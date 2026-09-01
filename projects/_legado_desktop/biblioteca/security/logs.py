"""
security/logs.py
=================
Registro de auditoria (historico.csv). Toda operação de download e
cópia para pendrive gera uma linha aqui, com data, usuário, arquivo,
origem, destino, hash e resultado.
"""

import csv
from datetime import datetime
from pathlib import Path

CABECALHO = ["data_hora", "usuario", "arquivo", "origem", "destino", "hash_sha256", "resultado", "detalhe"]


def registrar(log_path: Path, usuario: str, arquivo: str, origem: str,
              destino: str, hash_sha256: str, resultado: str, detalhe: str = ""):
    """Adiciona uma linha ao historico.csv. Cria o arquivo com cabeçalho
    se ainda não existir."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    novo = not log_path.exists()
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if novo:
            w.writerow(CABECALHO)
        w.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            usuario, arquivo, origem, destino, hash_sha256, resultado, detalhe
        ])


def ler_historico(log_path: Path):
    """Lê o histórico completo (usado se quiser mostrar na interface)."""
    if not log_path.exists():
        return []
    with open(log_path, "r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))
