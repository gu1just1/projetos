"""
utils/organizer.py

Sistema seguro de organização e cópia de arquivos
MediaVault

Responsabilidades:
- Classificação de arquivos
- Sanitização de nomes
- Proteção contra path traversal
- Bloqueio de extensões perigosas
- Cópia segura
- Validação de integridade
"""

import re
import shutil
import hashlib

from pathlib import Path


# ==============================
# CONFIGURAÇÕES
# ==============================


MAPA_CATEGORIAS = {

    "Videos": {
        ".mp4",
        ".mkv",
        ".avi",
        ".mov",
        ".webm",
    },

    "Musicas": {
        ".mp3",
        ".wav",
        ".flac",
        ".m4a",
        ".ogg",
    },

    "Fotos": {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".bmp",
    },

    "Documentos": {
        ".pdf",
        ".docx",
        ".doc",
        ".txt",
        ".pptx",
        ".xlsx",
    },

}


EXTENSOES_BLOQUEADAS = {

    ".exe",
    ".bat",
    ".cmd",
    ".ps1",
    ".vbs",
    ".scr",
    ".msi",
    ".com",
    ".js",

}


ARQUIVOS_BLOQUEADOS = {

    "autorun.inf",
    "desktop.ini",

}


NOMES_RESERVADOS_WINDOWS = {

    "CON",
    "PRN",
    "AUX",
    "NUL",

    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),

}


TAMANHO_MAX_MB_PADRAO = 4096


# ==============================
# CLASSIFICAÇÃO
# ==============================


def categoria_por_extensao(caminho):

    extensao = Path(caminho).suffix.lower()

    for categoria, extensoes in MAPA_CATEGORIAS.items():

        if extensao in extensoes:
            return categoria

    return "Outros"



# ==============================
# SEGURANÇA
# ==============================


def extensao_bloqueada(caminho):

    return (
        Path(caminho)
        .suffix
        .lower()
        in EXTENSOES_BLOQUEADAS
    )



def arquivo_bloqueado(nome):

    arquivo = Path(nome).name.lower()

    # Arquivos especiais
    if arquivo in ARQUIVOS_BLOQUEADOS:
        return True


    # Reservados do Windows:
    # CON.txt
    # PRN.jpg
    # AUX.pdf

    nome_base = Path(arquivo).stem.upper()

    if nome_base in NOMES_RESERVADOS_WINDOWS:
        return True


    return False



def nome_arquivo_seguro(nome):

    nome = str(nome)

    caminho = Path(nome)

    base = caminho.stem
    extensao = caminho.suffix.lower()


    base = re.sub(
        r'[<>:"/\\|?*\x00-\x1F]',
        "_",
        base,
    )


    base = base.strip(" .")


    if not base:
        base = "arquivo"


    if base.upper() in NOMES_RESERVADOS_WINDOWS:

        base = "arquivo_" + base


    return (
        base[:100]
        +
        extensao
    )



def nome_usuario_seguro(usuario):

    if not usuario:
        return "local"


    usuario = str(usuario)


    if (
        ".." in usuario
        or "/" in usuario
        or "\\" in usuario
    ):
        return "local"


    usuario = re.sub(
        r'[^a-zA-Z0-9_-]',
        "_",
        usuario,
    )


    usuario = usuario.strip("_")


    if not usuario:
        return "local"


    return usuario[:50]



# ==============================
# HASH
# ==============================


def calcular_hash(caminho):

    sha256 = hashlib.sha256()


    with open(caminho, "rb") as arquivo:

        for bloco in iter(
            lambda: arquivo.read(1024 * 1024),
            b"",
        ):

            sha256.update(bloco)


    return sha256.hexdigest()



# ==============================
# AUXILIARES
# ==============================


def nome_sem_conflito(destino):

    destino = Path(destino)


    if not destino.exists():

        return destino


    contador = 1


    while True:

        novo = destino.with_name(
            f"{destino.stem}_{contador}{destino.suffix}"
        )


        if not novo.exists():

            return novo


        contador += 1



# ==============================
# CÓPIA PRINCIPAL
# ==============================


def organizar_e_copiar(
        origem: Path,
        destino_base: Path,
        usuario="local",
):


    origem = Path(origem)

    destino_base = Path(destino_base)


    if not origem.exists():

        raise FileNotFoundError(
            "Arquivo não encontrado"
        )


    if not origem.is_file():

        raise ValueError(
            "Origem não é arquivo"
        )


    if origem.is_symlink():

        raise ValueError(
            "Links simbólicos bloqueados"
        )


    if extensao_bloqueada(origem):

        raise ValueError(
            "Extensão bloqueada"
        )


    if arquivo_bloqueado(origem.name):

        raise ValueError(
            "Arquivo protegido"
        )


    tamanho_mb = (
        origem.stat().st_size
        /
        1024
        /
        1024
    )


    if tamanho_mb > TAMANHO_MAX_MB_PADRAO:

        raise ValueError(
            "Arquivo excede limite permitido"
        )


    usuario = nome_usuario_seguro(usuario)


    categoria = categoria_por_extensao(origem)


    nome_final = nome_arquivo_seguro(
        origem.name
    )


    pasta_destino = (
        destino_base
        /
        usuario
        /
        categoria
    )


    pasta_destino.mkdir(
        parents=True,
        exist_ok=True,
    )


    destino_final = nome_sem_conflito(
        pasta_destino / nome_final
    )


    shutil.copy2(
        origem,
        destino_final,
    )


    hash_origem = calcular_hash(origem)

    hash_destino = calcular_hash(destino_final)


    if hash_origem != hash_destino:

        destino_final.unlink(
            missing_ok=True
        )

        raise IOError(
            "Falha de integridade na cópia"
        )


    return destino_final