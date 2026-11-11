# MediaVault — Media Management Utility

Aplicativo desktop em Python/Tkinter para organizar downloads e arquivos, copiar itens para armazenamento removível e verificar a integridade das cópias.

## Requisitos

- Python 3.10 ou superior recomendado.
- FFmpeg no PATH para recursos de conversão de mídia.
- Conexão com a internet para downloads.

## Instalar e executar

No Windows, a partir da raiz deste repositório:

```powershell
cd projects/media-downloader
python -m pip install -r requirements.txt
python main.py
```

O Tkinter é distribuído com muitas instalações do Python para Windows. Em outras plataformas, instale o pacote Tk da distribuição do Python, se necessário.

## Testes

O diretório `tests/` contém a suíte pytest. Execute-a a partir da pasta do projeto:

```powershell
python -m pytest tests -v
```

A suíte pode evoluir; não há contagem fixa de testes indicada aqui. O workflow de integração contínua na raiz do repositório executa apenas os testes da calculadora de consumo elétrico, não esta suíte.

## Estrutura atual

```text
projects/media-downloader/
├── config.py
├── download/
├── gui/
├── security/
├── storage/
├── tests/
├── tools/
├── utils/
├── LEIA-ME.md
├── main.py
├── pytest.ini
└── requirements.txt
```

A pasta `.archive/` contém arquivos de referência/recuperação e é ignorada pelo Git conforme o `.gitignore` local.

## Recursos

- Downloads diretos HTTP/HTTPS e via yt-dlp.
- Fila sequencial, cancelamento e downloads em lote.
- Limite de tamanho por arquivo e validação de downloads incompletos.
- Nomes de arquivo seguros e prevenção contra colisões.
- Cópia para armazenamento removível e validação SHA-256.
- Registro de operações.

## Dependências e observações

As dependências Python estão em [requirements.txt](requirements.txt). O FFmpeg é um programa externo e precisa ser instalado separadamente para conversões que dependem dele.

Use o aplicativo apenas para conteúdo que você tem autorização para baixar. A disponibilidade de downloads depende dos sites e serviços acessados e dos termos aplicáveis.

## Histórico e privacidade

As pastas antigas foram mantidas para referência e recuperação. Elas não são necessárias para executar a versão atual. Confira cuidadosamente arquivos de configuração e dados antes de publicar alterações: a configuração local é gravada no perfil do usuário e não deve conter credenciais.
