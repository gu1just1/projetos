"""
storage/pendrive.py
====================
Detecção de pendrives (dispositivos removíveis) no Windows e função de
cópia segura para o pendrive, com verificação de tamanho, extensão
bloqueada e hash SHA-256 (origem == destino).
"""

import ctypes
import os
import platform
import shutil
import string
import subprocess
from pathlib import Path
from dataclasses import dataclass

from security.hash import sha256_arquivo, arquivos_identicos
from utils.organizer import (
    categoria_por_extensao, extensao_bloqueada, nome_sem_conflito,
    TAMANHO_MAX_MB_PADRAO,
)


@dataclass
class Pendrive:
    letra: str        # ex: "E:\\"
    label: str         # ex: "USB KINGSTON"
    livre_gb: float
    total_gb: float

    @property
    def nome_exibicao(self) -> str:
        return f"{self.label} ({self.letra})  —  {self.livre_gb} GB livres"

    def __str__(self):
        return self.nome_exibicao


def abrir_pasta(caminho: Path):
    """Abre a pasta/pendrive no Explorador de Arquivos do Windows."""
    caminho = Path(caminho)
    caminho.mkdir(parents=True, exist_ok=True)
    if platform.system() == "Windows":
        os.startfile(str(caminho))  # noqa: only exists on Windows
    else:
        subprocess.Popen(["xdg-open", str(caminho)])


def listar_pendrives() -> list[Pendrive]:
    """Detecta dispositivos removíveis conectados. Só funciona no Windows
    (GetDriveTypeW é uma API do Windows). Em outros SOs retorna lista vazia."""
    drives = []
    if platform.system() != "Windows":
        return drives

    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for i, letra in enumerate(string.ascii_uppercase):
        if not (bitmask & (1 << i)):
            continue
        caminho = f"{letra}:\\"
        DRIVE_REMOVABLE = 2
        if ctypes.windll.kernel32.GetDriveTypeW(caminho) != DRIVE_REMOVABLE:
            continue
        try:
            total, _usado, livre = shutil.disk_usage(caminho)
        except OSError:
            continue
        drives.append(Pendrive(
            letra=caminho,
            label=_obter_label(caminho),
            livre_gb=round(livre / (1024 ** 3), 2),
            total_gb=round(total / (1024 ** 3), 2),
        ))
    return drives


def _obter_label(caminho: str) -> str:
    buf = ctypes.create_unicode_buffer(1024)
    ctypes.windll.kernel32.GetVolumeInformationW(
        caminho, buf, ctypes.sizeof(buf), None, None, None, None, 0
    )
    return buf.value or "PENDRIVE"


class ErroCopiaSegura(Exception):
    pass


def copiar_para_pendrive(origem: Path, destino: "Pendrive | Path",
                          tamanho_max_mb: int = TAMANHO_MAX_MB_PADRAO) -> Path:
    """Copia um arquivo para o pendrive (ou pasta manual escolhida pelo
    usuário quando nenhum pendrive é detectado), dentro da subpasta
    correta (Videos/Musicas/Fotos/Documentos/Outros), verificando:
    - extensão bloqueada
    - tamanho máximo
    - integridade via hash SHA-256 pós-cópia

    `destino` aceita tanto um objeto Pendrive quanto um Path direto
    (pasta escolhida manualmente).

    Retorna o Path final da cópia. Lança ErroCopiaSegura em caso de
    falha em qualquer verificação.
    """
    if extensao_bloqueada(origem):
        raise ErroCopiaSegura(f"Tipo de arquivo bloqueado por segurança: {origem.suffix}")

    tamanho_mb = origem.stat().st_size / (1024 * 1024)
    if tamanho_mb > tamanho_max_mb:
        raise ErroCopiaSegura(f"Arquivo excede o limite de {tamanho_max_mb} MB ({tamanho_mb:.0f} MB)")

    base = Path(destino.letra) if isinstance(destino, Pendrive) else Path(destino)
    categoria = categoria_por_extensao(origem)
    pasta_destino = base / categoria
    pasta_destino.mkdir(parents=True, exist_ok=True)

    destino = nome_sem_conflito(pasta_destino / origem.name)
    shutil.copy2(origem, destino)

    if not arquivos_identicos(origem, destino):
        # Remove a cópia corrompida para não deixar lixo no pendrive
        try:
            destino.unlink()
        except OSError:
            pass
        raise ErroCopiaSegura("Falha na verificação de integridade (hash não confere)")

    return destino
