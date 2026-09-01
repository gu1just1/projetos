from pathlib import Path
import sys
import traceback


# ============================================================
# CONFIGURAÇÃO DO AMBIENTE
# ============================================================

RAIZ_PROJETO = Path(__file__).resolve().parent.parent

if str(RAIZ_PROJETO) not in sys.path:
    sys.path.insert(0, str(RAIZ_PROJETO))


print("=" * 60)
print("TESTE COMPLETO - MEDIAVAULT")
print("=" * 60)

print("Projeto:", RAIZ_PROJETO)


erros = []


def teste(nome, func):
    print(f"\n[TESTANDO] {nome}")

    try:
        func()
        print(f"[OK] {nome}")

    except Exception as erro:
        print(f"[ERRO] {nome}")
        print(erro)

        erros.append(nome)

        traceback.print_exc()


# ============================================================
# 1 - ESTRUTURA DO PROJETO
# ============================================================

def teste_estrutura():

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

        if not caminho.exists():
            raise FileNotFoundError(
                f"Arquivo ausente: {arquivo}"
            )


teste(
    "Estrutura do projeto",
    teste_estrutura
)


# ============================================================
# 2 - IMPORTAÇÃO DOS MÓDULOS
# ============================================================

def teste_imports():

    import config

    import download.downloader
    import storage.pendrive

    import security.hash
    import security.logs

    import utils.organizer

    import gui.interface

    print("Todos os módulos carregados")


teste(
    "Importação dos módulos",
    teste_imports
)


# ============================================================
# 3 - TESTE SHA-256
# ============================================================

def teste_hash():

    from security.hash import (
        sha256_arquivo,
        arquivos_identicos
    )


    arquivo_a = RAIZ_PROJETO / "teste_a.txt"
    arquivo_b = RAIZ_PROJETO / "teste_b.txt"


    try:

        arquivo_a.write_text(
            "MediaVault teste SHA256",
            encoding="utf-8"
        )

        arquivo_b.write_text(
            "MediaVault teste SHA256",
            encoding="utf-8"
        )


        resultado = arquivos_identicos(
            arquivo_a,
            arquivo_b
        )


        if not resultado:
            raise Exception(
                "Arquivos deveriam possuir o mesmo hash"
            )


        hash_final = sha256_arquivo(
            arquivo_a
        )


        print(
            "SHA256:",
            hash_final
        )


    finally:

        if arquivo_a.exists():
            arquivo_a.unlink()

        if arquivo_b.exists():
            arquivo_b.unlink()



teste(
    "Integridade SHA-256",
    teste_hash
)


# ============================================================
# RESULTADO FINAL
# ============================================================

print("\n" + "=" * 60)


if erros:

    print("TESTES COM FALHA:")

    for erro in erros:
        print("-", erro)

else:

    print(
        "TODOS OS TESTES PASSARAM"
    )


print("=" * 60)