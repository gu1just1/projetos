# MediaVault — Media Management Utility

Aplicativo desktop em Python/Tkinter para gerenciamento de downloads, organização
de arquivos, cópia segura para armazenamento removível e verificação de integridade.

## Estrutura

```text
biblioteca/
├── main.py                  # ponto de entrada
├── config.py                # configuração local do usuário
├── requirements.txt
├── pytest.ini
├── download/
│   └── downloader.py        # downloads HTTP e yt-dlp
├── gui/
│   └── interface.py         # interface Tkinter
├── storage/
│   └── pendrive.py          # detecção/cópia segura
├── security/
│   ├── hash.py              # SHA-256
│   └── logs.py              # logs
├── utils/
│   └── organizer.py         # classificação e bloqueios
├── tests/                   # suíte principal
├── backup/                  # versões antigas e recuperação
├── _arquivos_antigos/       # código legado
├── data/                    # dados de execução/testes
├── teste_seguranca/         # arquivos usados nos testes de segurança
└── ATAQUE/                  # material de teste de segurança
```

## Como executar

No Windows:

```powershell
cd C:\caminho\para\biblioteca
python -m pip install -r requirements.txt
python main.py
```

Para executar os testes:

```powershell
python -m pytest -v
```

A suíte atual contém **63 testes** e deve terminar com:

```text
63 passed
```

## Downloader

O downloader suporta:

- downloads HTTP/HTTPS diretos;
- downloads via yt-dlp;
- vídeo e MP3;
- fila sequencial;
- cancelamento;
- downloads em lote;
- limite máximo de **5 GB por arquivo**;
- validação de `Content-Length`;
- proteção contra arquivos parciais;
- detecção de download truncado;
- nomes seguros para Windows;
- prevenção de colisão de nomes;
- atualização de progresso, velocidade e ETA.

Para MP3 e determinados downloads de vídeo, o **FFmpeg** precisa estar instalado e disponível no `PATH`.

## Segurança

O projeto possui:

- bloqueio de extensões potencialmente perigosas;
- proteção contra nomes reservados do Windows;
- proteção contra path traversal;
- limite de tamanho;
- cópia segura;
- verificação SHA-256;
- logs de operações;
- testes específicos para nomes como `CON`, `PRN`, `AUX` e `NUL`.

## Backups

Arquivos antigos não ficam dentro de `tests/`, para que o pytest não tente
executá-los como testes.

Os backups relacionados ao problema atual ficam em:

```text
backup/
└── recuperacao/
```

Eles são mantidos apenas para recuperação e não participam da suíte.

## Observação

`__pycache__` e `.pytest_cache` são arquivos gerados automaticamente e foram
removidos da cópia organizada. Eles voltarão a aparecer localmente quando Python
e pytest forem executados, mas não devem ser tratados como código do projeto.
