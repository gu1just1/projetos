<p align="center">
  <img src="assets/ventilador.gif" alt="Animação de boas-vindas" width="180" />
</p>

# 🚀 Repositório de Projetos de Engenharia de Software

<p align="left">
  <img src="assets/rosto.gif" alt="Foto de perfil" width="80" align="left" style="margin-right:14px; border-radius:50%;" />
  
  **Guilherme** — Desenvolvedor de Software | Python · Clean Code · TDD
  
  Bem-vindo ao meu repositório central de projetos técnicos! Aqui você encontra aplicações desenvolvidas com foco em excelência de código, tipagem estrita, testes automatizados e documentação formal.
</p>

<br clear="left" />

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Code Style: PEP 8](https://img.shields.io/badge/Code%20Style-PEP%208-informational?style=for-the-badge)](https://peps.python.org/pep-0008/)
[![Test Suite](https://img.shields.io/badge/Tests-100%25%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)](consumo-energia/test_app.py)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow?style=for-the-badge&logo=git&logoColor=white)](https://www.conventionalcommits.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

## 🏛️ Padrões de Engenharia Adotados

Todo o código deste repositório adere a princípios consolidados de desenvolvimento profissional:

- **Clean Code & Arquitetura Limpa**: Nomenclatura semântica, responsabilidade única (SRP) e separação entre regras de negócio e camadas de I/O.
- **Tipagem Estrita (*Type Hinting*)**: Anotações completas de tipos em todas as assinaturas de funções e constantes.
- **Programação Defensiva**: Validação rigorosa de entradas, tratamento de limites de borda e garantia de estabilidade.
- **Testes Automatizados (TDD/Unit Testing)**: Suítes com cobertura de cenários nominais, fracionários, limites de borda e caminhos de exceção.
- **Padronização de Commits**: Histórico rastreável e semântico seguindo o padrão [*Conventional Commits*](https://www.conventionalcommits.org/).

---

## 📂 Projetos Disponíveis

> Clique no botão **▶ Acessar** para ir direto ao projeto.

| # | Projeto | Descrição | Stack | Status | Acesso |
| :---: | :--- | :--- | :---: | :---: | :---: |
| 01 | **⚡ Calculadora de Consumo Elétrico** | Simulador CLI para estimativa de consumo energético (kWh) e projeção financeira mensal com validação defensiva e modelagem matemática. | Python 3.10+ · `unittest` | ✅ Concluído | [**▶ Acessar**](consumo-energia/) |

---

## 🗂️ Estrutura do Repositório

```text
.
├── .gitignore                   # Regras de exclusão para Python, IDEs e SOs
├── LICENSE                      # Licença MIT
├── README.md                    # Este arquivo — vitrine e portfólio profissional
├── assets/                      # Recursos visuais, animações e mídias
│   ├── energia.gif              # Animação demonstrativa do projeto de energia
│   ├── ventilador.gif           # Animação do banner de boas-vindas
│   ├── rosto.gif                # Foto de perfil do desenvolvedor
│   └── poesiaarte.gif           # Banner de encerramento
└── consumo-energia/             # Projeto 01: Calculadora de Consumo Elétrico
    ├── app.py                   # Código-fonte principal com validação e tipagem estrita
    ├── test_app.py              # Suíte de 16 testes unitários automatizados
    ├── requirements.txt         # Manifesto de ambiente e dependências
    └── README.md                # Documentação técnica detalhada com LaTeX
```

---

## ⚡ Como Começar

### Pré-requisitos
- [Python 3.10+](https://www.python.org/downloads/)
- [Git](https://git-scm.com/)

### Clonando o Repositório
```bash
git clone https://github.com/gu1just1/projetos.git
cd projetos
```

### Executando os Testes Automatizados (Global)
```bash
python -m unittest discover -s consumo-energia -v
```

---

## 📜 Licença

Este projeto está distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.

---

<p align="center">
  <img src="assets/poesiaarte.gif" alt="Arte de encerramento" width="520" />
</p>
