"""
config.py
=========
Configuração simples persistida em JSON local (nome do último usuário,
última pasta usada). Nada sensível é armazenado aqui.
"""

import json
from pathlib import Path

CONFIG_PATH = Path.home() / ".biblioteca_midia_config.json"


def carregar_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def salvar_config(dados: dict):
    atual = carregar_config()
    atual.update(dados)
    CONFIG_PATH.write_text(json.dumps(atual, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Aliases usados pela interface (gui/interface.py).
# ---------------------------------------------------------------------------

def carregar_config_usuario() -> dict:
    return carregar_config()


def salvar_config_usuario(dados: dict) -> None:
    salvar_config(dados)
