from pathlib import Path

from utils.organizer import (
    categoria_por_extensao,
    extensao_bloqueada,
    arquivo_bloqueado,
    nome_arquivo_seguro,
    nome_usuario_seguro,
    calcular_hash,
    nome_sem_conflito,
)


def test_categoria_extensao():

    assert categoria_por_extensao(Path("video.mp4"))
    assert categoria_por_extensao(Path("imagem.jpg"))


def test_extensao_bloqueada():

    assert extensao_bloqueada(Path("arquivo.exe")) is True


def test_arquivo_bloqueado():

    assert arquivo_bloqueado("CON.txt") is True


def test_nome_seguro():

    nome = nome_arquivo_seguro(
        "meu:arquivo?.mp4"
    )

    assert ":" not in nome
    assert "?" not in nome


def test_usuario_seguro():

    usuario = nome_usuario_seguro(
        "Joao Silva/Teste"
    )

    assert "/" not in usuario


def test_hash(tmp_path):

    arquivo = tmp_path / "teste.txt"

    arquivo.write_text(
        "MediaVault",
        encoding="utf-8"
    )

    resultado = calcular_hash(
        arquivo
    )

    assert len(resultado) == 64


def test_nome_sem_conflito(tmp_path):

    arquivo = tmp_path / "arquivo.txt"

    arquivo.write_text(
        "teste",
        encoding="utf-8"
    )

    novo = nome_sem_conflito(
        arquivo
    )

    assert novo != arquivo
