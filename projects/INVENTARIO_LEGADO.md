# Inventário de materiais históricos

Registro dos materiais antigos encontrados no repositório. Nenhum item foi removido. Os caminhos abaixo permanecem no Git e podem conter dados únicos; revise o conteúdo antes de qualquer limpeza.

## Cópias do aplicativo

- `projects/_legado_desktop/biblioteca/`: versão antiga extraída da biblioteca.
- `projects/_legado_desktop/biblioteca.zip`: pacote ZIP da biblioteca.
- `projects/_legado_desktop/bibli_nov/biblioteca_corrigida.zip`: outro pacote ZIP.
- `projects/media-downloader/.archive/`: arquivos antigos e materiais de recuperação do projeto atual.

## Atalhos

- `projects/_legado_desktop/Biblioteca de Midia.lnk`
- `projects/_legado_desktop/Biblioteca de Mídia.lnk`

Os dois atalhos diferem apenas pela acentuação no nome. Seus alvos são metadados locais do Windows e podem ser inválidos fora da máquina onde foram criados.

## Possível redundância de conteúdo

Os diretórios `projects/_legado_desktop/biblioteca/` e `projects/media-downloader/` têm documentação e código com nomes equivalentes. Isso sugere cópias de versões do mesmo aplicativo, mas não prova que os conteúdos sejam idênticos. Os ZIPs também podem conter arquivos não presentes nas pastas extraídas.

## Critério recomendado para limpeza futura

1. Comparar hashes e listas de arquivos entre pastas e ZIPs.
2. Guardar uma cópia de segurança fora do repositório, se houver conteúdo exclusivo.
3. Confirmar quais itens podem ser removidos ou mantidos apenas localmente.
4. Só então abrir uma mudança de remoção; o histórico Git continuará retendo conteúdos já publicados.

## Arquivos observados na árvore atual

```text
projects/_legado_desktop/Biblioteca de Midia.lnk
projects/_legado_desktop/Biblioteca de Mídia.lnk
projects/_legado_desktop/README.md
projects/_legado_desktop/bibli_nov
projects/_legado_desktop/bibli_nov/biblioteca_corrigida.zip
projects/_legado_desktop/biblioteca.zip
projects/_legado_desktop/biblioteca
projects/_legado_desktop/biblioteca/.gitignore
projects/_legado_desktop/biblioteca/ATAQUE
projects/_legado_desktop/biblioteca/ATAQUE/Videos
projects/_legado_desktop/biblioteca/ATAQUE/Videos/teste_seguro.mp4
projects/_legado_desktop/biblioteca/LEIA-ME.md
projects/_legado_desktop/biblioteca/arquivos_python.txt
projects/_legado_desktop/biblioteca/config.py
projects/_legado_desktop/biblioteca/download
projects/_legado_desktop/biblioteca/download/__init__.py
projects/_legado_desktop/biblioteca/download/downloader.py
projects/_legado_desktop/biblioteca/estrutura_atual.txt
projects/_legado_desktop/biblioteca/gui
projects/_legado_desktop/biblioteca/gui/__init__.py
projects/_legado_desktop/biblioteca/gui/interface.py
projects/_legado_desktop/biblioteca/main.py
projects/_legado_desktop/biblioteca/pytest.ini
projects/_legado_desktop/biblioteca/requirements.txt
projects/_legado_desktop/biblioteca/security
projects/_legado_desktop/biblioteca/security/__init__.py
projects/_legado_desktop/biblioteca/security/hash.py
projects/_legado_desktop/biblioteca/security/logs.py
projects/_legado_desktop/biblioteca/storage
projects/_legado_desktop/biblioteca/storage/__init__.py
projects/_legado_desktop/biblioteca/storage/pendrive.py
projects/_legado_desktop/biblioteca/tests
projects/_legado_desktop/biblioteca/tests/test_downloader.py
projects/_legado_desktop/biblioteca/tests/test_downloader_antes_correcao.py
projects/_legado_desktop/biblioteca/tests/test_downloader_backup.py
projects/_legado_desktop/biblioteca/tests/test_mediavault.py
projects/_legado_desktop/biblioteca/tests/test_organizer.py
projects/_legado_desktop/biblioteca/tests/test_security.py
projects/_legado_desktop/biblioteca/tests/test_storage.py
projects/_legado_desktop/biblioteca/tests/teste_completo_backup.py
projects/_legado_desktop/biblioteca/tools
projects/_legado_desktop/biblioteca/tools/relatorio_projeto.py
projects/_legado_desktop/biblioteca/utils
projects/_legado_desktop/biblioteca/utils/__init__.py
projects/_legado_desktop/biblioteca/utils/organizer.py
projects/media-downloader/.archive/ATAQUE
projects/media-downloader/.archive/ATAQUE/Videos
projects/media-downloader/.archive/ATAQUE/Videos/teste_seguro.mp4
projects/media-downloader/.archive/arquivos_python.txt
projects/media-downloader/.archive/estrutura_atual.txt
```
