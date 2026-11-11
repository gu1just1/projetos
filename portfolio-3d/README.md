# Portfólio 3D — Retro Workstation

Experiência interativa em português com uma estação de trabalho 3D e uma interface inspirada em sistemas operacionais dos anos 1990.

## Requisitos

- Node.js instalado para usar o servidor local incluído.
- Navegador moderno com suporte a WebGL e aceleração de hardware.
- Conexão com a internet para carregar Three.js e fontes do Google, atualmente referenciados por CDN no `index.html`.

## Executar localmente

A partir da raiz deste repositório:

```bash
cd portfolio-3d
node server.js
```

O servidor escuta na porta 8080 e em todas as interfaces de rede disponíveis. Abra:

```text
http://localhost:8080
```

Para encerrar, pressione Ctrl+C no terminal. O servidor é destinado ao desenvolvimento local; não o exponha diretamente à internet.

## Arquivos principais

- `index.html`: estrutura da experiência e dependências carregadas.
- `style.css`: estilos e layout.
- `main.js`: cena 3D, áudio e interações do equipamento.
- `os_core.js`: janelas e aplicações da interface retrô.
- `server.js`: servidor HTTP estático simples.
- `assets/models/PC_workstation_web.glb`: modelo 3D utilizado na cena.
- `vendor/`: cópias locais de bibliotecas de suporte; a página atualmente carrega os scripts Three.js por CDN.

## Observações

O servidor incluído não define uma etapa de build nem uma suíte de testes automatizados. O funcionamento depende de WebGL, do modelo 3D e dos recursos externos referenciados pela página.
