# ⚡ Calculadora de Consumo Elétrico Residencial

[![Python Version](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Code Style: PEP 8](https://img.shields.io/badge/Code%20Style-PEP%208-informational?style=for-the-badge)](https://peps.python.org/pep-0008/)
[![Tests: Unittest](https://img.shields.io/badge/Tests-16%20Passed-success?style=for-the-badge&logo=pytest&logoColor=white)](test_app.py)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](../LICENSE)

Módulo em linha de comando (CLI) desenvolvido em Python para simulação, cálculo e projeção financeira de consumo de energia elétrica residencial para aparelhos eletrodomésticos.

---

## 🎯 Visão Geral e Arquitetura

O projeto foi construído sob rigorosos padrões de engenharia de software:
- **Clean Code & PEP 8**: Código expressivo, funções com responsabilidade única e boas práticas de nomenclatura.
- **Tipagem Estrita (*Type Hints*)**: Todos os parâmetros e retornos possuem anotações de tipo validadas.
- **Funções Puras e Determinísticas**: Isolamento da lógica matemática de cálculo das operações de I/O de terminal.
- **Validação Defensiva**: Validação robusta de entradas de usuário em loop contínuo contra strings vazias, valores negativos e limite físico diário ($0 \le \text{horas} \le 24$).
- **Zero Dependências Externas**: Execução nativa sobre a *Python Standard Library*.

---

## 🧮 Modelagem Matemática

O cálculo de estimativa de consumo mensal e a respectiva projeção financeira utilizam as seguintes formulações físicas e financeiras:

### 1. Consumo Energético Mensal ($\text{kWh}$)

$$\text{Consumo}_{\text{mensal}} (\text{kWh}) = \frac{P \times H \times D}{1000}$$

### 2. Custo Financeiro Projetado ($\text{R\\$}$)

$$\text{Custo}_{\text{projetado}} (\text{R\\$}) = \text{Consumo}_{\text{mensal}} \times T$$

---

## 📊 Tabela de Variáveis e Parâmetros

| Símbolo | Variável | Unidade de Medida | Descrição / Restrição | Valor Padrão |
| :---: | :--- | :---: | :--- | :---: |
| $P$ | `potencia_watts` | $\text{W}$ (Watts) | Potência nominal do aparelho ($P \ge 0$) | — |
| $H$ | `horas_dia` | $\text{h/dia}$ (Horas) | Tempo médio de uso diário ($0 \le H \le 24$) | — |
| $D$ | `dias` | $\text{dias}$ | Ciclo de faturamento em dias ($D \ge 0$) | `30` |
| $T$ | `tarifa_kwh` | $\text{R\$/kWh}$ | Valor cobrado por kWh pela concessionária ($T \ge 0$) | `R$ 0,75` |
| $\text{Consumo}$ | `consumo_kwh` | $\text{kWh}$ | Energia elétrica total consumida no ciclo | Calculado |
| $\text{Custo}$ | `custo_mensal` | $\text{R\$}$ | Impacto financeiro estimado da fatura | Calculado |

---

## 💻 Instruções de Uso via CLI

### 1. Pré-requisitos
- **Python 3.10 ou superior** instalado no ambiente.

### 2. Executar a Aplicação
Navegue até a pasta do projeto e execute:
```bash
python app.py
```

### 3. Exemplo Interativo no Terminal
```text
================================================
⚡ SIMULADOR DE CONSUMO ELÉTRICO RESIDENCIAL ⚡
================================================
Nome do aparelho (ex: Geladeira): Geladeira Frost Free
Potência nominal em Watts (W): 180
Tempo médio de uso diário (0 a 24 horas): 24

------------------------------------------------
📊 RELATÓRIO DE CONSUMO ESTIMADO
------------------------------------------------
Aparelho Analisado:   Geladeira Frost Free
Potência Registrada:  180.0 W
Tempo de Uso Diário:  24.00 h/dia
Ciclo de Faturamento: 30 dias
Tarifa Aplicada:      R$ 0.75/kWh
------------------------------------------------
⚡ Consumo Mensal:    129.60 kWh
💰 Custo Projetado:   R$ 97.20
================================================
```

---

## 🧪 Suíte de Testes Automatizados

A suíte de testes unitários foi elaborada com o framework nativo `unittest`, cobrindo 100% dos caminhos de execução matemática:
- **Cenários Nominais**: Verificação de cálculos com valores típicos.
- **Valores Fracionários**: Precisão de ponto flutuante em potências e tempos não-inteiros.
- **Limites de Borda**: 0W, 0 horas, 24 horas contínuas e ciclos customizados.
- **Validações de Exceção**: Bloqueio com `ValueError` para dados fora do domínio ($P < 0$, $H < 0$, $H > 24$, $D < 0$, $T < 0$).

### Executando os Testes
Para rodar a suíte com relatório verboso:
```bash
python -m unittest test_app.py -v
```
Ou executando a suíte diretamente:
```bash
python test_app.py
```

---

## 📁 Estrutura de Arquivos do Módulo

```text
consumo-energia/
├── app.py            # Lógica principal, validação defensiva e CLI
├── test_app.py       # Suíte completa de testes unitários (16 casos)
├── requirements.txt  # Manifesto de dependências e ambiente
└── README.md         # Documentação técnica e modelagem matemática
```