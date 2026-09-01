"""
Suíte de Testes Automatizados para a Calculadora de Consumo Elétrico.

Cobre cenários nominais, valores fracionários, limites de borda, tarifas
customizadas e validação defensiva contra entradas inválidas nas funções puras.
"""

import unittest
from app import (
    calcular_consumo,
    calcular_custo,
    TARIFA_KWH_PADRAO,
    DIAS_FATURAMENTO,
)


class TestCalculoConsumo(unittest.TestCase):
    """Testes unitários para a função calcular_consumo."""

    def test_caso_nominal_padrao(self):
        """Aparelho de 1000W ligado por 1h/dia durante 30 dias consome 30 kWh."""
        consumo = calcular_consumo(potencia_watts=1000.0, horas_dia=1.0)
        self.assertAlmostEqual(consumo, 30.0, places=4)

    def test_caso_com_valores_fracionados(self):
        """Valores fracionários de potência e horas diárias."""
        # 150.5 W * 3.5 h/dia * 30 dias / 1000 = 15.8025 kWh
        consumo = calcular_consumo(potencia_watts=150.5, horas_dia=3.5)
        self.assertAlmostEqual(consumo, 15.8025, places=4)

    def test_limite_borda_zero_horas(self):
        """Aparelho que não é utilizado (0h/dia) tem consumo 0 kWh."""
        consumo = calcular_consumo(potencia_watts=500.0, horas_dia=0.0)
        self.assertEqual(consumo, 0.0)

    def test_limite_borda_zero_watts(self):
        """Aparelho com 0 Watts consome 0 kWh."""
        consumo = calcular_consumo(potencia_watts=0.0, horas_dia=10.0)
        self.assertEqual(consumo, 0.0)

    def test_limite_borda_24_horas_continuas(self):
        """Aparelho ligado 24h/dia ininterruptamente (ex: Geladeira 200W)."""
        # 200W * 24h * 30 dias / 1000 = 144.0 kWh
        consumo = calcular_consumo(potencia_watts=200.0, horas_dia=24.0)
        self.assertAlmostEqual(consumo, 144.0, places=4)

    def test_dias_faturamento_customizado(self):
        """Cálculo com período customizado de faturamento (ex: 15 dias)."""
        # 1000W * 2h * 15 dias / 1000 = 30.0 kWh
        consumo = calcular_consumo(potencia_watts=1000.0, horas_dia=2.0, dias=15)
        self.assertAlmostEqual(consumo, 30.0, places=4)

    def test_excecao_potencia_negativa(self):
        """Potência negativa deve levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_consumo(potencia_watts=-100.0, horas_dia=2.0)

    def test_excecao_horas_negativas(self):
        """Horas negativas devem levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_consumo(potencia_watts=100.0, horas_dia=-1.0)

    def test_excecao_horas_acima_de_24(self):
        """Uso diário superior a 24 horas deve levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_consumo(potencia_watts=100.0, horas_dia=24.1)

    def test_excecao_dias_negativos(self):
        """Quantidade de dias negativa deve levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_consumo(potencia_watts=100.0, horas_dia=5.0, dias=-5)


class TestCalculoCusto(unittest.TestCase):
    """Testes unitários para a função calcular_custo."""

    def test_custo_tarifa_padrao(self):
        """Custo com a tarifa de negócio padrão (R$ 0,75/kWh)."""
        # 100 kWh * 0.75 = R$ 75.00
        custo = calcular_custo(consumo_kwh=100.0)
        self.assertAlmostEqual(custo, 75.00, places=2)

    def test_custo_tarifa_customizada(self):
        """Custo com tarifas personalizadas regionais."""
        # 50 kWh * 0.92 = R$ 46.00
        custo = calcular_custo(consumo_kwh=50.0, tarifa_kwh=0.92)
        self.assertAlmostEqual(custo, 46.00, places=2)

    def test_custo_consumo_zero(self):
        """Consumo zero deve resultar em custo zero."""
        custo = calcular_custo(consumo_kwh=0.0)
        self.assertEqual(custo, 0.0)

    def test_custo_valores_fracionados_precisos(self):
        """Cálculo com casas decimais fracionadas."""
        # 15.8025 kWh * 0.75 = 11.851875 -> R$ 11.85
        custo = calcular_custo(consumo_kwh=15.8025, tarifa_kwh=TARIFA_KWH_PADRAO)
        self.assertAlmostEqual(custo, 11.851875, places=4)

    def test_excecao_consumo_negativo(self):
        """Consumo negativo deve levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_custo(consumo_kwh=-10.0)

    def test_excecao_tarifa_negativa(self):
        """Tarifa negativa deve levantar ValueError."""
        with self.assertRaises(ValueError):
            calcular_custo(consumo_kwh=50.0, tarifa_kwh=-0.50)


if __name__ == "__main__":
    unittest.main()
