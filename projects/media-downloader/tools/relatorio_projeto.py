from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent


print("=" * 60)
print("RELATÓRIO MEDIAVAULT")
print("=" * 60)

print()

print("Python:")
print(sys.version)

print()

arquivos = list(ROOT.rglob("*.py"))

print("Arquivos Python:", len(arquivos))

total_linhas = 0

print("\nLinhas por arquivo:")

for arquivo in arquivos:

    try:
        linhas = len(
            arquivo.read_text(
                encoding="utf-8"
            ).splitlines()
        )

        total_linhas += linhas

        print(
            f"{arquivo.relative_to(ROOT)}: {linhas}"
        )

    except Exception:
        pass


print()

print("Total de linhas:", total_linhas)


print()

print("Testes encontrados:")

testes = list(
    (ROOT / "tests").glob("test_*.py")
)

for teste in testes:
    print("-", teste.name)


print()

print("Quantidade de testes:")

try:
    resultado = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests",
            "--collect-only",
            "-q",
        ],
        capture_output=True,
        text=True,
    )

    print(
        resultado.stdout.splitlines()[-1]
    )

except Exception as erro:
    print(erro)


print()

print("=" * 60)