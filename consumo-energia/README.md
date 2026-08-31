# ⚡ Calculadora de Consumo Elétrico Inteligente

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)
![Status](https://img.shields.io/badge/Status-Concluído-success?style=for-the-badge)

## 🎯 Objetivo do Sistema
Uma aplicação de terminal desenvolvida em Python para estimar o consumo de energia elétrica mensal de eletrodomésticos, auxiliando na conscientização e previsibilidade de gastos residenciais. Conta com validação de dados nativa e interface CLI amigável.

## 🧮 A Matemática (Fórmula Utilizada)
O cálculo base para estimativa mensal considera um ciclo de 30 dias:
> **Consumo (kWh) = (Potência do Aparelho * Horas de Uso Diário * 30) / 1000**

O sistema também projeta o impacto financeiro multiplicando o consumo por uma tarifa média estipulada (R$ 0,75/kWh).

## 🚀 Como Executar o Projeto

1. Certifique-se de ter o Python instalado na sua máquina.
2. Clone este repositório ou baixe os arquivos.
3. Navegue até a pasta do projeto e execute o script via terminal:
   ```bash
   python app.py