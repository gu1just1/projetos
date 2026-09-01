
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

            return {
                "filepath": str(arquivo),
            }

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

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

            raise AssertionError(
                "O hook deveria ter interrompido o download."
            )

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

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

            return {
                "filepath": None,
            }

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    with pytest.raises(modulo.DownloadCancelled):
        downloader._baixar_com_ytdlp(item)
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
    assert item.arquivo_final.exists()

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

            return {
                "filepath": str(arquivo),
            }

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

    try:
        downloader._baixar_com_ytdlp(item)
    except modulo.DownloadCancelled:
        pass
    else:
        raise AssertionError("DownloadCancelled não foi lançado.")

    assert item.progresso == 50.0
    assert item.velocidade == "2.00 MB/s"
    assert item.tempo_restante == "10s"
    assert item.tamanho == "5.0 MB"
    assert eventos
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

            return {
                "filepath": str(arquivo),
            }

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    try:
        downloader._baixar_com_ytdlp(item)
    except modulo.DownloadCancelled:
        pass
    else:
        raise AssertionError("DownloadCancelled não foi lançado.")

    assert item.arquivo_final is not None
    assert item.arquivo_final.exists()

def test_ytdlp_hook_rejeita_total_acima_do_limite(tmp_path, monkeypatch):
    import download.downloader as modulo

    class DownloadErrorFake(Exception):
        pass

    class UtilsFake:
        DownloadError = DownloadErrorFake
        DownloadError = DownloadErrorFake

        def __exit__(self, exc_type, exc, tb):
            return False

        def extract_info(self, url, download=True):
            hook = self.opcoes["progress_hooks"][0]

            hook({
                "status": "downloading",
                "total_bytes": modulo.MAX_DOWNLOAD_SIZE_BYTES + 1,
                "downloaded_bytes": 0,
            })

            raise AssertionError("O hook deveria ter interrompido o download.")

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    try:
        downloader._baixar_com_ytdlp(item)
    except modulo.DownloadSizeError as erro:
        assert "5 GB" in str(erro)
    else:
        raise AssertionError("DownloadSizeError não foi lançado.")


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

            try:
                hook({
                    "status": "downloading",
                    "total_bytes": 1000,
                    "downloaded_bytes": 100,
                })
            except DownloadErrorFake:
                return {
                    "filepath": None,
                }

            raise AssertionError("O hook deveria ter cancelado o download.")

    class YTDLPFake:
        YoutubeDL = YoutubeDLFake
        utils = UtilsFake

    monkeypatch.setattr(modulo, "yt_dlp", YTDLPFake)

    downloader = modulo.Downloader(
        tmp_path,
        lambda item: None,
    )

    item = modulo.DownloadItem(
        url="https://site.com/video",
        tipo="Video",
        formato="video",
    )

    try:
        downloader._baixar_com_ytdlp(item)
    except modulo.DownloadCancelled:
        pass
    else:
        raise AssertionError("DownloadCancelled não foi lançado.")

