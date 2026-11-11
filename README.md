# Projetos de Guilherme

Repositório pessoal que reúne projetos de software, estudos e protótipos. Os projetos têm escopos e níveis de acabamento diferentes; consulte o README de cada pasta antes de executar.

## Projetos principais

| Projeto | Descrição | Tecnologias / execução |
| --- | --- | --- |
| [Calculadora de Consumo Elétrico](consumo-energia/) | Aplicativo de terminal para estimar consumo mensal de energia e custo. | Python 3.10+; sem dependências externas. |
| [Portfólio 3D](portfolio-3d/) | Experiência web interativa com modelo 3D e interface própria. | HTML, CSS, JavaScript e Three.js local. Abra `index.html`; consulte o código para requisitos de execução. |
| [MediaVault](projects/media-downloader/) | Aplicativo desktop para organizar downloads e copiar arquivos com verificação de integridade. | Python, Tkinter, yt-dlp e requests; consulte [LEIA-ME](projects/media-downloader/LEIA-ME.md). |

## Outros conteúdos

- [Projetos legados de biblioteca de mídia](projects/_legado_desktop/): versões anteriores, materiais de recuperação e arquivos históricos. Mantidos para referência. O [inventário do legado](projects/INVENTARIO_LEGADO.md) lista os ZIPs, atalhos e possíveis duplicatas sem remover conteúdo.
- [System Monitor API](projects/system-monitor-api/): pasta inicial com diretrizes; documentação e implementação ainda não estão presentes.
- [Assets](assets/): imagens e animações usados em documentação e apresentação.

## Executar a calculadora

Requer Python 3.10 ou superior:

```bash
python consumo-energia/app.py
```

Para executar os testes da calculadora:

```bash
python -m unittest discover -s consumo-energia -v
```

## Executar o MediaVault

No Windows, instale as dependências do projeto e inicie o aplicativo:

```powershell
cd projects/media-downloader
python -m pip install -r requirements.txt
python main.py
```

O FFmpeg precisa estar disponível no PATH para recursos de conversão de mídia. Veja instruções e limitações no [guia do MediaVault](projects/media-downloader/LEIA-ME.md).

## Testes automatizados

A integração contínua executa a suíte da calculadora em Python 3.11. O MediaVault possui testes pytest no diretório do projeto; sua execução e status não são cobertos pelo workflow atual.

```bash
python -m unittest discover -s consumo-energia -p "test_*.py" -v
```

## Estrutura resumida

```text
.
├── .github/workflows/ci.yml
├── assets/
├── consumo-energia/
├── portfolio-3d/
└── projects/
    ├── media-downloader/
    ├── _legado_desktop/
    └── system-monitor-api/
```

## Licença

O repositório inclui uma licença MIT. Antes de reutilizar um projeto específico, confira também seus arquivos e dependências: componentes de terceiros podem ter termos próprios.
