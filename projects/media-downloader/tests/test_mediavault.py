from pathlib import Path
import sys

import pytest


RAIZ_PROJETO = Path(__file__).resolve().parent.parent


if str(RAIZ_PROJETO) not in sys.path:
    sys.path.insert(0, str(RAIZ_PROJETO))


def test_estrutura_projeto():

    arquivos = [
        "config.py",
        "download/downloader.py",
        "storage/pendrive.py",
        "security/hash.py",
        "security/logs.py",
        "utils/organizer.py",
        "gui/interface.py",
    ]

    for arquivo in arquivos:
        caminho = RAIZ_PROJETO / arquivo

        assert caminho.exists(), (
            f"Arquivo ausente: {arquivo}"
        )


def test_importacao_modulos():

    import config

    import download.downloader
    import storage.pendrive

    import security.hash
    import security.logs

    import utils.organizer

    import gui.interface


def test_integridade_sha256():

    from security.hash import (
        sha256_arquivo,
        arquivos_identicos,
    )

    arquivo_a = RAIZ_PROJETO / "teste_a.txt"
    arquivo_b = RAIZ_PROJETO / "teste_b.txt"


    try:

        arquivo_a.write_text(
            "MediaVault teste SHA256",
            encoding="utf-8",
        )

        arquivo_b.write_text(
            "MediaVault teste SHA256",
            encoding="utf-8",
        )


        assert arquivos_identicos(
            arquivo_a,
            arquivo_b,
        )


        resultado = sha256_arquivo(
            arquivo_a
        )

        assert resultado
        assert len(resultado) == 64


    finally:

        arquivo_a.unlink(
            missing_ok=True
        )

        arquivo_b.unlink(
            missing_ok=True
        )