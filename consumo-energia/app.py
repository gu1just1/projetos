"""
Módulo de Cálculo e Simulação de Consumo Elétrico Residencial.

Este módulo implementa lógica de engenharia para estimativa de consumo
energético em kWh e projeção financeira mensal para aparelhos eletrodomésticos,
seguindo princípios de Clean Code, funções puras e validação defensiva.
"""

from typing import Final

# ==========================================
# Constantes de Negócio
# ==========================================
TARIFA_KWH_PADRAO: Final[float] = 0.75
DIAS_FATURAMENTO: Final[int] = 30


def calcular_consumo(
    potencia_watts: float,
    horas_dia: float,
    dias: int = DIAS_FATURAMENTO
) -> float:
    """
    Calcula o consumo elétrico total em quilowatt-hora (kWh).

    Fórmula:
        Consumo (kWh) = (Potência (W) * Horas/Dia * Dias) / 1000

    Args:
        potencia_watts (float): Potência nominal do aparelho em Watts (W >= 0).
        horas_dia (float): Tempo médio de uso diário em horas (0 <= h <= 24).
        dias (int, opcional): Quantidade de dias no ciclo de faturamento (dias >= 0).
            O padrão é DIAS_FATURAMENTO (30).

    Returns:
        float: Consumo de energia em kWh.

    Raises:
        ValueError: Caso algum parâmetro seja negativo ou horas_dia > 24.
    """
    if potencia_watts < 0:
        raise ValueError("A potência não pode ser negativa.")
    if not (0 <= horas_dia <= 24):
        raise ValueError("O tempo de uso diário deve estar entre 0 e 24 horas.")
    if dias < 0:
        raise ValueError("O número de dias não pode ser negativo.")

    return (potencia_watts * horas_dia * dias) / 1000.0


def calcular_custo(
    consumo_kwh: float,
    tarifa_kwh: float = TARIFA_KWH_PADRAO
) -> float:
    """
    Calcula a projeção de custo financeiro baseado no consumo e na tarifa aplicada.

    Fórmula:
        Custo (R$) = Consumo (kWh) * Tarifa (R$/kWh)

    Args:
        consumo_kwh (float): Volume de energia consumida em kWh (>= 0).
        tarifa_kwh (float, opcional): Valor da tarifa cobrada por kWh em R$.
            O padrão é TARIFA_KWH_PADRAO (0.75).

    Returns:
        float: Custo total estimado em Reais (R$).

    Raises:
        ValueError: Caso o consumo ou a tarifa sejam negativos.
    """
    if consumo_kwh < 0:
        raise ValueError("O consumo em kWh não pode ser negativo.")
    if tarifa_kwh < 0:
        raise ValueError("A tarifa por kWh não pode ser negativa.")

    return consumo_kwh * tarifa_kwh


def solicitar_texto(mensagem: str) -> str:
    """
    Valida a entrada de texto do usuário em loop, proibindo strings vazias.

    Args:
        mensagem (str): Mensagem/prompt a ser exibida ao usuário.

    Returns:
        str: Texto sanitizado e não vazio informado pelo usuário.
    """
    while True:
        entrada: str = input(mensagem).strip()
        if entrada:
            return entrada
        print("⚠️ O nome do aparelho não pode ser vazio. Digite novamente.")


def solicitar_numero(
    mensagem: str,
    min_valor: float = 0.0,
    max_valor: float | None = None,
    permitir_zero: bool = False
) -> float:
    """
    Valida a entrada numérica do usuário com suporte a vírgula e limites específicos.

    Args:
        mensagem (str): Mensagem/prompt a ser exibida ao usuário.
        min_valor (float, opcional): Valor mínimo aceito. Padrão 0.0.
        max_valor (float | None, opcional): Valor máximo aceito (ex: 24h para tempo diário).
        permitir_zero (bool, opcional): Se True, permite valor igual ao min_valor (quando 0).

    Returns:
        float: Número float validado dentro das restrições.
    """
    while True:
        entrada_bruta: str = input(mensagem).strip().replace(',', '.')
        if not entrada_bruta:
            print("⚠️ A entrada não pode estar vazia. Por favor, digite um número.")
            continue

        try:
            valor: float = float(entrada_bruta)

            if permitir_zero:
                if valor < min_valor:
                    print(f"⚠️ O valor não pode ser menor que {min_valor}.")
                    continue
            else:
                if valor <= min_valor:
                    print(f"⚠️ O valor deve ser estritamente maior que {min_valor}.")
                    continue

            if max_valor is not None and valor > max_valor:
                print(f"⚠️ O valor não pode ultrapassar o limite de {max_valor} (ex: 24 horas/dia).")
                continue

            return valor
        except ValueError:
            print("❌ Entrada inválida. Por favor, utilize apenas números (ex: 150 ou 3.5).")


def main() -> None:
    """Ponto de entrada principal da interface de linha de comando (CLI)."""
    print("\n" + "=" * 48)
    print("⚡ SIMULADOR DE CONSUMO ELÉTRICO RESIDENCIAL ⚡")
    print("=" * 48)

    aparelho: str = solicitar_texto("Nome do aparelho (ex: Geladeira): ")
    potencia: float = solicitar_numero(
        "Potência nominal em Watts (W): ",
        min_valor=0.0,
        permitir_zero=False
    )
    horas: float = solicitar_numero(
        "Tempo médio de uso diário (0 a 24 horas): ",
        min_valor=0.0,
        max_valor=24.0,
        permitir_zero=True
    )

    consumo: float = calcular_consumo(potencia, horas)
    custo: float = calcular_custo(consumo)

    print("\n" + "-" * 48)
    print("📊 RELATÓRIO DE CONSUMO ESTIMADO")
    print("-" * 48)
    print(f"Aparelho Analisado:   {aparelho.title()}")
    print(f"Potência Registrada:  {potencia:.1f} W")
    print(f"Tempo de Uso Diário:  {horas:.2f} h/dia")
    print(f"Ciclo de Faturamento: {DIAS_FATURAMENTO} dias")
    print(f"Tarifa Aplicada:      R$ {TARIFA_KWH_PADRAO:.2f}/kWh")
    print("-" * 48)
    print(f"⚡ Consumo Mensal:    {consumo:.2f} kWh")
    print(f"💰 Custo Projetado:   R$ {custo:.2f}")
    print("=" * 48 + "\n")


if __name__ == "__main__":
    main()