# 🚀 Repositório de Projetos de Engenharia de Software

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Code Style: PEP 8](https://img.shields.io/badge/Code%20Style-PEP%208-informational?style=for-the-badge)](https://peps.python.org/pep-0008/)
[![Test Suite](https://img.shields.io/badge/Tests-100%25%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)](consumo-energia/test_app.py)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow?style=for-the-badge&logo=git&logoColor=white)](https://www.conventionalcommits.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

Bem-vindo ao repositório central de engenharia de software e portfólio técnico. Este repositório reúne aplicações, utilitários e algoritmos desenvolvidos com foco em excelência técnica, código limpo (*Clean Code*), tipagem estrita, testes automatizados e documentação formal.

---

## 🏛️ Padrões de Engenharia Adotados

Todo o código deste repositório adere a princípios consolidados de desenvolvimento profissional:

- **Clean Code & Arquitetura Limpa**: Nomenclatura semântica, responsabilidade única (SRP) e separação clara entre regras de negócio (funções puras) e camadas de I/O.
- **Tipagem Estrita (*Type Hinting*)**: Anotações completas de tipos em todas as assinaturas de funções e constantes.
- **Programação Defensiva**: Validação rigorosa de entradas de dados, tratamento de limites de borda e garantia de estabilidade.
- **Testes Automatizados (TDD/Unit Testing)**: Suítes de testes unitários com cobertura de cenários nominais, fracionários, limites de borda e caminhos de exceção.
- **Padronização de Commits**: Histórico rastreável e semântico seguindo o padrão [*Conventional Commits*](https://www.conventionalcommits.org/).

---

## 📂 Catálogo de Projetos

| Projeto | Descrição | Stack | Status | Documentação |
| :--- | :--- | :---: | :---: | :---: |
| [**Calculadora de Consumo Elétrico**](consumo-energia/) | Simulador CLI para estimativa de consumo energético (kWh) e projeção financeira mensal com validação defensiva e modelagem matemática formal. | Python 3.10+ <br> `unittest` | Concluído | [Acessar README](consumo-energia/README.md) |

---

## 🗂️ Estrutura do Repositório

```text
.
├── .gitignore                   # Regras de exclusão para Python, IDEs e sistemas operacionais
├── LICENSE                      # Licença MIT
├── README.md                    # Vitrine e portfólio profissional do repositório
├── assets/                      # Recursos visuais, diagramas e mídias
│   └── README.md                # Diretrizes de organização de assets
└── consumo-energia/             # Projeto: Calculadora de Consumo Elétrico
    ├── app.py                   # Código-fonte principal com validação e tipagem estrita
    ├── test_app.py              # Suíte de testes unitários automatizados
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
Você pode executar a suíte completa de testes de todos os módulos a partir da raiz:
```bash
python -m unittest discover -s consumo-energia -v
```

---

## 📜 Licença

Este projeto está distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.
