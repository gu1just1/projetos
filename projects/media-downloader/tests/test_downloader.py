import pytest

from pathlib import Path

from download.downloader import (
    DownloadCancelled,
    DownloadItem,
    DownloadSizeError,
    detectar_tipo,
    sanitizar_nome_arquivo,
)


def test_detectar_tipo():

    assert detectar_tipo(
        "https://youtube.com/watch?v=123"
    ) == "YouTube"

    assert detectar_tipo(
        "https://site.com/video.mp4"
    ) == "Download direto"

    assert detectar_tipo(
        "https://site.com/video"
    ) == "Outro (via yt-dlp)"


def test_sanitizar_nome_windows():

    resultado = sanitizar_nome_arquivo(
        "CON.txt"
    )

    assert resultado != "CON.txt"


def test_sanitizar_caracteres_invalidos():

    resultado = sanitizar_nome_arquivo(
        'video<>:"/\\|?*.mp4'
    )

    for caractere in '<>:"/\\|?*':
        assert caractere not in resultado


def test_formatadores():

    from download.downloader import (
        _formatar_eta,
        _formatar_velocidade,
    )

    assert _formatar_velocidade(None) == "-"
    assert _formatar_eta(None) == "-"

    assert "MB/s" in _formatar_velocidade(
        1024 * 1024
    )

    assert _formatar_eta(65) == "1m05s"


def test_nome_disponivel(tmp_path):

    from download.downloader import _nome_disponivel

    arquivo = tmp_path / "video.mp4"

    arquivo.write_text(
        "teste",
        encoding="utf-8",
    )

    novo = _nome_disponivel(
        tmp_path,
        "video.mp4",
    )

    assert novo != arquivo
    assert novo.suffix == ".mp4"
    assert novo.stem.startswith("video")


def test_download_item():

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    assert item.url == "https://site.com/video.mp4"
    assert item.formato == "video"


def test_nome_reserved_windows():

    resultado = sanitizar_nome_arquivo(
        "CON.txt"
    )

    assert resultado != "CON.txt"
    assert resultado.lower().endswith(".txt")


def test_nome_reserved_com():

    resultado = sanitizar_nome_arquivo(
        "COM1.mp4"
    )

    assert resultado != "COM1.mp4"


def test_nome_muito_grande():

    nome = "a" * 300 + ".mp4"

    resultado = sanitizar_nome_arquivo(nome)

    assert len(resultado) <= 180
    assert resultado.endswith(".mp4")


def test_nome_vazio():

    resultado = sanitizar_nome_arquivo("")

    assert resultado


def test_nome_apenas_caracteres_invalidos():

    resultado = sanitizar_nome_arquivo(
        '<>:"/\\|?*'
    )

    assert resultado


def test_excecoes_download():

    assert issubclass(
        DownloadCancelled,
        Exception,
    )

    assert issubclass(
        DownloadSizeError,
        Exception,
    )




def test_baixar_direto_sucesso(tmp_path, monkeypatch):
    from download.downloader import DownloadItem, Downloader

    class RespostaFake:
        headers = {"Content-Length": "9"}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            assert chunk_size == 64 * 1024
            yield b"ola "
            yield b"mundo"

        def close(self):
            pass

    resposta = RespostaFake()

    def fake_get(*args, **kwargs):
        assert args[0] == "https://site.com/video.mp4"
        assert kwargs["stream"] is True
        assert kwargs["allow_redirects"] is True
        return resposta

    monkeypatch.setattr(
        "download.downloader.requests.get",
        fake_get,
    )

    atualizacoes = []

    downloader = Downloader(
        tmp_path,
        lambda item: atualizacoes.append(item.progresso),
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    downloader._baixar_direto(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.exists()
    assert item.arquivo_final.read_bytes() == b"ola mundo"
    assert item.progresso == 100.0
    assert atualizacoes
    assert not list(tmp_path.glob("*.part"))


def test_baixar_direto_sem_content_length(tmp_path, monkeypatch):
    from download.downloader import DownloadItem, Downloader

    class RespostaFake:
        headers = {}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"conteudo"

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
    )

    downloader._baixar_direto(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.read_bytes() == b"conteudo"
    assert item.tamanho == "0.0 MB"


def test_baixar_direto_content_length_invalido(tmp_path, monkeypatch):
    from download.downloader import DownloadItem, Downloader

    class RespostaFake:
        headers = {"Content-Length": "abc"}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"teste"

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
    )

    downloader._baixar_direto(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.read_bytes() == b"teste"


def test_baixar_direto_limpa_temporario_em_erro(tmp_path, monkeypatch):
    import pytest

    from download.downloader import DownloadItem, Downloader

    class RespostaFake:
        headers = {"Content-Length": "100"}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"parcial"

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
    )

    with pytest.raises(Exception):
        downloader._baixar_direto(item)

    assert not list(tmp_path.glob("*.part"))


def test_baixar_direto_cancelado_remove_temporario(tmp_path, monkeypatch):
    from download.downloader import DownloadCancelled, DownloadItem, Downloader

    class RespostaFake:
        headers = {"Content-Length": "100"}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"primeiro bloco"
            yield b"segundo bloco"

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    item.cancelar = True

    try:
        downloader._baixar_direto(item)
    except DownloadCancelled:
        pass
    else:
        raise AssertionError("O download deveria ter sido cancelado.")

    temporarios = list(tmp_path.glob(".bibliotecamidia-*.part"))

    assert temporarios == []
    assert item.arquivo_final is None

def test_baixar_direto_excede_limite(tmp_path, monkeypatch):
    from download.downloader import (
        DownloadItem,
        DownloadSizeError,
        Downloader,
        MAX_DOWNLOAD_SIZE_BYTES,
    )

    class RespostaFake:
        headers = {"Content-Length": str(MAX_DOWNLOAD_SIZE_BYTES + 1)}

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"dados"

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    try:
        downloader._baixar_direto(item)
    except DownloadSizeError:
        pass
    else:
        raise AssertionError("O download deveria exceder o limite.")

    assert item.arquivo_final is None
    assert list(tmp_path.glob(".bibliotecamidia-*.part")) == []

def test_baixar_direto_erro_http_remove_temporario(tmp_path, monkeypatch):
    from download.downloader import DownloadItem, Downloader

    class RespostaFake:
        headers = {}

        def raise_for_status(self):
            import requests
            raise requests.HTTPError("Erro HTTP simulado")

        def close(self):
            pass

    monkeypatch.setattr(
        "download.downloader.requests.get",
        lambda *args, **kwargs: RespostaFake(),
    )

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    try:
        downloader._baixar_direto(item)
    except Exception:
        pass
    else:
        raise AssertionError("O download deveria falhar com erro HTTP.")

    assert item.arquivo_final is None
    assert list(tmp_path.glob(".bibliotecamidia-*.part")) == []

def test_downloader_processa_fila(tmp_path, monkeypatch):
    from download.downloader import DownloadItem, Downloader

    processados = []

    downloader = Downloader(
        tmp_path,
        lambda item: processados.append(item.url),
    )

    def fake_baixar_item(item):
        processados.append(item.url)

    monkeypatch.setattr(
        downloader,
        "_baixar_item",
        fake_baixar_item,
    )

    item1 = DownloadItem(
        url="https://site.com/video1.mp4",
        formato="video",
    )

    item2 = DownloadItem(
        url="https://site.com/video2.mp4",
        formato="video",
    )

    downloader.adicionar(item1)
    downloader.adicionar(item2)

    downloader._thread.join(timeout=5)

    assert item1.url in processados
    assert item2.url in processados
    assert not downloader._thread.is_alive()
def test_downloader_continua_fila_apos_erro(tmp_path, monkeypatch):
    from download.downloader import DownloadError, DownloadItem, Downloader

    processados = []

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    def fake_baixar_item(item):
        if item.url.endswith("erro.mp4"):
            raise DownloadError("Erro simulado")
        processados.append(item.url)

    monkeypatch.setattr(
        downloader,
        "_baixar_item",
        fake_baixar_item,
    )

    item1 = DownloadItem(
        url="https://site.com/erro.mp4",
        formato="video",
    )

    item2 = DownloadItem(
        url="https://site.com/sucesso.mp4",
        formato="video",
    )

    downloader.adicionar(item1)
    downloader.adicionar(item2)

    downloader._thread.join(timeout=5)

    assert item1.erro
    assert item2.url in processados
    assert not downloader._thread.is_alive()

def test_downloader_marca_item_cancelado(tmp_path):
    from download.downloader import DownloadItem, Downloader

    atualizacoes = []

    downloader = Downloader(
        tmp_path,
        lambda item: atualizacoes.append(item.status),
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    item.cancelar = True

    downloader._marcar_cancelado(item)

    assert item.status == "Cancelado"
    assert item.progresso == 0.0
    assert item.erro == ""
    assert "Cancelado" in atualizacoes

def test_baixar_ytdlp_sem_yt_dlp(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    monkeypatch.setattr(modulo, "yt_dlp", None)

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )

    try:
        downloader._baixar_com_ytdlp(item)
    except RuntimeError as erro:
        assert "yt-dlp" in str(erro)
    else:
        raise AssertionError(
            "Deveria gerar RuntimeError quando yt-dlp não está instalado."
        )


def test_baixar_ytdlp_mp3_sem_ffmpeg(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    monkeypatch.setattr(modulo, "yt_dlp", object())
    monkeypatch.setattr(modulo.shutil, "which", lambda nome: None)

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    item = DownloadItem(
        url="https://site.com/audio",
        formato="mp3",
    )
    try:
        downloader._baixar_com_ytdlp(item)
    except RuntimeError as erro:
        assert "FFmpeg" in str(erro)
    else:
        raise AssertionError("Deveria gerar RuntimeError quando FFmpeg não está disponível.")


def test_baixar_ytdlp_sucesso(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def extract_info(self, url, download=True):
            assert url == "https://site.com/video"
            assert download is True

            caminho = Path(
                self.opcoes["outtmpl"].replace(
                    "%(title)s.%(ext)s",
                    "video.mp4",
                )
            )
            caminho.write_bytes(b"video de teste")

            return {"filepath": str(caminho)}

        def prepare_filename(self, info):
            return info["filepath"]

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = Downloader(tmp_path, lambda item: None)

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )

    downloader._baixar_com_ytdlp(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.exists()
    assert item.arquivo_final.read_bytes() == b"video de teste"
    assert item.arquivo_final.name == "video.mp4"


def test_baixar_ytdlp_usa_filename_quando_filepath_nao_existe(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def extract_info(self, url, download=True):
            caminho = Path(
                self.opcoes["outtmpl"].replace(
                    "%(title)s.%(ext)s",
                    "video.mp4",
                )
            )
            caminho.write_bytes(b"video fallback")
            return {"_filename": str(caminho)}

        def prepare_filename(self, info):
            return info["_filename"]

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = Downloader(tmp_path, lambda item: None)

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )

    downloader._baixar_com_ytdlp(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.exists()
    assert item.arquivo_final.read_bytes() == b"video fallback"


def test_baixar_ytdlp_propagando_erro(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    class ErroYTDLP(Exception):
        pass

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def extract_info(self, url, download=True):
            raise ErroYTDLP("erro simulado do yt-dlp")

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

        class utils:
            DownloadError = ErroYTDLP

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = Downloader(tmp_path, lambda item: None)

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )

    with pytest.raises(ErroYTDLP, match="erro simulado"):
        downloader._baixar_com_ytdlp(item)


def test_baixar_ytdlp_sem_arquivo_final(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def extract_info(self, url, download=True):
            return {
                "title": "video teste",
                "ext": "mp4",
            }

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = Downloader(tmp_path, lambda item: None)

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )

    with pytest.raises(Exception):
        downloader._baixar_com_ytdlp(item)


def test_baixar_ytdlp_cancelado(tmp_path, monkeypatch):
    import download.downloader as modulo
    from download.downloader import DownloadItem, Downloader, DownloadCancelled

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def extract_info(self, url, download=True):
            raise modulo.yt_dlp.utils.DownloadError("Download cancelado pelo usuário.")

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

        class utils:
            DownloadError = DownloadCancelled

    # Use the module's own cancellation exception as the fake yt-dlp error.
    YTDLPFake.utils.DownloadError = DownloadCancelled
    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = Downloader(tmp_path, lambda item: None)

    item = DownloadItem(
        url="https://site.com/video",
        formato="video",
    )
    item.cancelar = True

    with pytest.raises(DownloadCancelled):
        downloader._baixar_com_ytdlp(item)

    assert item.arquivo_final is None

def test_downloader_encerrar_sem_thread(tmp_path):
    from download.downloader import Downloader

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    assert downloader.encerrar(timeout=1) is True

def test_downloader_adicionar_apos_encerrar(tmp_path):
    from download.downloader import DownloadItem, Downloader

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    downloader.encerrar()

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    try:
        downloader.adicionar(item)
    except RuntimeError as erro:
        assert "encerrado" in str(erro).lower()
    else:
        raise AssertionError("Era esperado RuntimeError.")

def test_downloader_callback_com_erro_nao_interrompe(tmp_path):
    from download.downloader import DownloadItem, Downloader

    def callback_com_erro(item):
        raise RuntimeError("erro proposital no callback")

    downloader = Downloader(
        tmp_path,
        callback_com_erro,
    )

    item = DownloadItem(
        url="https://site.com/video.mp4",
        formato="video",
    )

    downloader._notificar(item)

def test_downloader_aguardar_sem_thread(tmp_path):
    from download.downloader import Downloader

    downloader = Downloader(
        tmp_path,
        lambda item: None,
    )

    assert downloader._thread is None
    assert downloader.aguardar() is True

def test_downloader_aguardar_thread_finalizada(tmp_path):
    from download.downloader import Downloader, DownloadItem

    processados = []

    downloader = Downloader(
        tmp_path,
        lambda item: processados.append(item.url),
    )

    item = DownloadItem(
        url="https://site.com/teste.mp4",
        formato="video",
    )

    downloader._baixar = lambda item: processados.append(item.url)

    downloader.adicionar(item)

    assert downloader.aguardar(timeout=5) is True
    assert not downloader._thread.is_alive()
    assert item.url in processados

def test_download_item_url_vazia():
    from download.downloader import DownloadItem

    import pytest

    with pytest.raises(ValueError):
        DownloadItem(url="   ")


def test_download_item_formato_invalido():
    from download.downloader import DownloadItem

    import pytest

    with pytest.raises(ValueError):
        DownloadItem(
            url="https://site.com/video.mp4",
            formato="avi",
        )


def test_download_item_indice_lote_negativo():
    from download.downloader import DownloadItem

    import pytest

    with pytest.raises(ValueError):
        DownloadItem(
            url="https://site.com/video.mp4",
            indice_lote=-1,
        )


def test_download_item_total_lote_negativo():
    from download.downloader import DownloadItem

    import pytest

    with pytest.raises(ValueError):
        DownloadItem(
            url="https://site.com/video.mp4",
            total_lote=-1,
        )


def test_download_item_indice_maior_que_total():
    from download.downloader import DownloadItem

    import pytest

    with pytest.raises(ValueError):
        DownloadItem(
            url="https://site.com/video.mp4",
            indice_lote=3,
            total_lote=2,
        )


def test_ytdlp_hook_atualiza_progresso_velocidade_eta(tmp_path, monkeypatch):
    import download.downloader as modulo

    arquivo = tmp_path / "video.mp4"
    eventos = []

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=True):
            hook = self.opcoes["progress_hooks"][0]
            hook({
                "status": "downloading",
                "total_bytes": 10 * 1024 * 1024,
                "downloaded_bytes": 5 * 1024 * 1024,
                "speed": 2 * 1024 * 1024,
                "eta": 10,
            })
            arquivo.write_bytes(b"video")
            return {"filepath": str(arquivo)}

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: eventos.append(
            (
                item.progresso,
                item.velocidade,
                item.tempo_restante,
                item.tamanho,
            )
        ),
    )

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    downloader._baixar_com_ytdlp(item)

    assert item.progresso == 50.0
    assert item.velocidade == "2.00 MB/s"
    assert item.tempo_restante == "10s"
    assert item.tamanho == "5.0 MB"
    assert eventos


def test_ytdlp_hook_ignora_status_desconhecido(tmp_path, monkeypatch):
    import download.downloader as modulo

    arquivo = tmp_path / "video.mp4"

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=True):
            hook = self.opcoes["progress_hooks"][0]
            hook({
                "status": "processing",
                "total_bytes": 1000,
                "downloaded_bytes": 500,
            })
            arquivo.write_bytes(b"video")
            return {"filepath": str(arquivo)}

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(tmp_path, lambda item: None)

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    downloader._baixar_com_ytdlp(item)

    assert item.arquivo_final is not None
    assert item.arquivo_final.exists()


def test_ytdlp_hook_rejeita_total_acima_do_limite(tmp_path, monkeypatch):
    import download.downloader as modulo

    class DownloadErrorFake(Exception):
        pass

    class UtilsFake:
        DownloadError = DownloadErrorFake

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=True):
            hook = self.opcoes["progress_hooks"][0]
            hook({
                "status": "downloading",
                "total_bytes": modulo.MAX_DOWNLOAD_SIZE_BYTES + 1,
                "downloaded_bytes": 0,
            })

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(tmp_path, lambda item: None)

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    with pytest.raises(modulo.DownloadSizeError, match="5 GB"):
        downloader._baixar_com_ytdlp(item)


def test_ytdlp_hook_cancelado(tmp_path, monkeypatch):
    import download.downloader as modulo

    class DownloadErrorFake(Exception):
        pass

    class UtilsFake:
        DownloadError = DownloadErrorFake

    class YoutubeDLFake:
        def __init__(self, opcoes):
            self.opcoes = opcoes

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=True):
            hook = self.opcoes["progress_hooks"][0]
            item.cancelar = True

            with pytest.raises(DownloadErrorFake):
                hook({
                    "status": "downloading",
                    "total_bytes": 1000,
                    "downloaded_bytes": 100,
                })

            return {"filepath": None}

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(tmp_path, lambda item: None)

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    with pytest.raises(modulo.DownloadCancelled):
        downloader._baixar_com_ytdlp(item)
