# Σ Media Manager — Operation Console

Interface no estilo ferramenta de administração do Windows
(Wireshark/MMC): densa em informação, previsível, cor usada só para
comunicar estado.

## Estrutura
```
BibliotecaMidia/
├── main.py                    ← executar este
├── config.py                  ← salva nome do usuário localmente
├── requirements.txt
├── gui/
│   └── console_interface.py   ← toda a interface
├── download/
│   └── downloader.py          ← yt-dlp (YouTube etc.) + download direto
├── storage/
│   └── pendrive.py            ← detecção de pendrive + cópia segura
├── security/
│   ├── hash.py                ← SHA-256
│   └── logs.py                ← historico.csv
└── utils/
    └── organizer.py           ← organização por extensão + bloqueio
```

## Como rodar (via cmd, no Windows)

```cmd
cd caminho\para\BibliotecaMidia
pip install -r requirements.txt
python main.py
```

> Para baixar vídeos do YouTube com áudio e vídeo mesclados, o yt-dlp
> também precisa do **ffmpeg** instalado e no PATH do sistema.

## Como usar
1. Digite seu nome na barra de ferramentas.
2. Clique em **"+ Adicionar download"**, cole um link por linha
   (YouTube, .mp4, .jpg, .pdf, etc.) e confirme.
3. Selecione o pendrive na lista lateral (**Devices**) — se nenhum for
   detectado automaticamente, o sistema pede pra escolher uma pasta
   manualmente na hora de copiar.
4. Acompanhe o progresso na **Download Queue**. Ao concluir, o arquivo
   é verificado (hash SHA-256) e copiado para a subpasta correta
   (`Videos`, `Musicas`, `Fotos`, `Documentos`).
5. Tudo fica registrado em `~/BibliotecaMidia/logs/historico.csv`.

## Segurança implementada
- Bloqueio de extensões perigosas (.exe, .bat, .cmd, .ps1, .vbs, .scr).
- Limite de tamanho por arquivo (4 GB por padrão, ajustável em
  `utils/organizer.py`).
- Verificação de integridade via hash SHA-256 (origem x destino); se
  não bater, a cópia é descartada e registrada como erro.
- Nunca sobrescreve arquivo existente — adiciona sufixo automático.
- Log de auditoria em CSV com data, usuário, arquivo, hash e resultado.

## Versão final — o que foi corrigido e adicionado

**Bugs corrigidos:**
- Cancelar um download em andamento aparecia como "Erro" na fila em
  vez de "Cancelado" (tanto no yt-dlp quanto no download direto).
  Agora existe uma exceção dedicada (`DownloadCancelado`) que separa
  cancelamento real de erro real.
- Se nenhum pendrive fosse detectado, a cópia simplesmente não
  acontecia e o arquivo ficava só na pasta temporária sem aviso claro.
  Agora, sem pendrive detectado, abre um seletor de pasta manual — e
  se isso também for cancelado, o log avisa exatamente onde o arquivo
  ficou salvo.

**Adicionado:**
- Botão "Abrir pasta do pendrive" na barra de ferramentas.
- Indicadores de **CPU** e **Memory** na barra de status, como no seu
  mockup original (opcional — precisa de `psutil`; sem ele instalado,
  o app funciona normal e mostra "—" nesses dois campos).
- Cabeçalho dividido "Σ Media Manager" / "Operation Console".
- Painel de dispositivos mostra "(nenhum dispositivo)" explicitamente
  quando não há pendrive conectado.

## Gerar o .exe (opcional)
```cmd
pip install pyinstaller
pyinstaller --onefile --windowed --name "BibliotecaMidia" main.py
```
O executável final fica em `dist\BibliotecaMidia.exe`.

## O que foi mantido simples de propósito
O painel de **Navigation** (Dashboard/Storage/Reports/Settings) é
visual — só "Downloads" tem função funcional atrás por enquanto. Dá
pra evoluir item por item, sem reescrever a base.
