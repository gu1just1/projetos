from pathlib import Path

import pytest

from storage.pendrive import (
    Pendrive,
    copiar_para_pendrive,
    ErroCopiaSegura,
)


def test_criar_pendrive():

    usb = Pendrive(
        letra="E:\\",
        label="KINGSTON",
        livre_gb=20.5,
        total_gb=64.0,
    )

    assert usb.letra == "E:\\"
    assert usb.label == "KINGSTON"
    assert "KINGSTON" in usb.nome_exibicao


def test_copia_segura_video(tmp_path):

    origem = tmp_path / "video.mp4"
    origem.write_text(
        "teste mediavault",
        encoding="utf-8",
    )


    destino = tmp_path / "pendrive"


    resultado = copiar_para_pendrive(
        origem,
        destino,
    )


    assert resultado.exists()
    assert resultado.parent.name == "Videos"

    assert resultado.read_text(
        encoding="utf-8"
    ) == "teste mediavault"



def test_copia_segura_documento(tmp_path):

    origem = tmp_path / "arquivo.pdf"

    origem.write_bytes(
        b"conteudo pdf teste"
    )


    destino = tmp_path / "usb"


    resultado = copiar_para_pendrive(
        origem,
        destino,
    )


    assert resultado.exists()
    assert resultado.parent.name == "Documentos"



def test_bloqueia_extensao_perigosa(tmp_path):

    origem = tmp_path / "virus.exe"

    origem.write_bytes(
        b"arquivo perigoso"
    )


    destino = tmp_path / "pendrive"


    with pytest.raises(ErroCopiaSegura):

        copiar_para_pendrive(
            origem,
            destino,
        )



def test_conflito_de_nome(tmp_path):

    origem = tmp_path / "foto.jpg"

    origem.write_bytes(
        b"imagem"
    )


    destino = tmp_path / "usb"


    primeira = copiar_para_pendrive(
        origem,
        destino,
    )


    segunda = copiar_para_pendrive(
        origem,
        destino,
    )


    assert primeira != segunda
    assert segunda.exists()
