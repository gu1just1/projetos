"""
security/hash.py
=================
Funções para cálculo e verificação de integridade de arquivos via SHA-256.
Usado para garantir que o arquivo copiado para o pendrive é idêntico
ao arquivo original, byte a byte.
"""

import hashlib
from pathlib import Path


def sha256_arquivo(caminho: Path, tamanho_bloco: int = 1 << 20) -> str:
    """Calcula o hash SHA-256 de um arquivo, lendo em blocos (não carrega
    o arquivo inteiro na memória, então funciona bem mesmo com vídeos
    grandes)."""
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(tamanho_bloco), b""):
            h.update(bloco)
    return h.hexdigest()


def arquivos_identicos(origem: Path, destino: Path) -> bool:
    """Compara o hash de dois arquivos. Retorna True se forem idênticos."""
    try:
        return sha256_arquivo(origem) == sha256_arquivo(destino)
    except OSError:
        return False
