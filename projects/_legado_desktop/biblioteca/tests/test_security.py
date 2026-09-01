from pathlib import Path

from security.hash import (
    sha256_arquivo,
    arquivos_identicos,
)

from security.logs import (
    registrar,
    ler_historico,
)


def test_sha256_arquivo(tmp_path):

    arquivo = tmp_path / "teste.txt"

    arquivo.write_text(
        "MediaVault Security",
        encoding="utf-8",
    )


    resultado = sha256_arquivo(
        arquivo
    )


    assert resultado
    assert len(resultado) == 64



def test_arquivos_identicos(tmp_path):

    arquivo_a = tmp_path / "a.txt"
    arquivo_b = tmp_path / "b.txt"


    arquivo_a.write_text(
        "mesmo conteúdo",
        encoding="utf-8",
    )

    arquivo_b.write_text(
        "mesmo conteúdo",
        encoding="utf-8",
    )


    assert arquivos_identicos(
        arquivo_a,
        arquivo_b,
    )



def test_arquivos_diferentes(tmp_path):

    arquivo_a = tmp_path / "a.txt"
    arquivo_b = tmp_path / "b.txt"


    arquivo_a.write_text(
        "arquivo A",
        encoding="utf-8",
    )

    arquivo_b.write_text(
        "arquivo B",
        encoding="utf-8",
    )


    assert not arquivos_identicos(
        arquivo_a,
        arquivo_b,
    )



def test_arquivo_inexistente():

    assert not arquivos_identicos(
        Path("nao_existe_a.txt"),
        Path("nao_existe_b.txt"),
    )



def test_registrar_log(tmp_path):

    log = tmp_path / "historico.csv"


    registrar(
        log_path=log,
        usuario="teste",
        arquivo="video.mp4",
        origem="origem",
        destino="destino",
        hash_sha256="abc123",
        resultado="OK",
        detalhe="teste",
    )


    assert log.exists()


    historico = ler_historico(
        log
    )


    assert len(historico) == 1

    registro = historico[0]


    assert registro["usuario"] == "teste"
    assert registro["arquivo"] == "video.mp4"
    assert registro["resultado"] == "OK"
