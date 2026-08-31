def calcular_consumo(potencia: float, horas_dia: float) -> float:
    """Calcula o consumo mensal (30 dias) em kWh."""
    return (potencia * horas_dia * 30) / 1000

def solicitar_numero(mensagem: str) -> float:
    """Valida a entrada do usuário em loop até receber um número válido."""
    while True:
        try:
            valor = float(input(mensagem).replace(',', '.'))
            if valor <= 0:
                print("⚠️ O valor deve ser maior que zero.")
                continue
            return valor
        except ValueError:
            print("❌ Entrada inválida. Por favor, digite apenas números.")

def main():
    print("\n⚡ Simulador de Consumo Elétrico Inteligente ⚡")
    print("-" * 46)
    
    aparelho = input("Nome do aparelho (ex: Geladeira): ").strip()
    potencia = solicitar_numero("Potência em Watts (W): ")
    horas = solicitar_numero("Tempo médio de uso diário (horas): ")
    
    consumo = calcular_consumo(potencia, horas)
    custo_kwh = 0.75 # Tarifa base
    custo_mensal = consumo * custo_kwh
    
    print("\n📊 Relatório de Consumo Estimado")
    print("-" * 46)
    print(f"Aparelho:          {aparelho.capitalize()}")
    print(f"Consumo Mensal:    {consumo:.2f} kWh")
    print(f"Custo Projetado:   R$ {custo_mensal:.2f}")
    print("-" * 46 + "\n")

if __name__ == "__main__":
    main()