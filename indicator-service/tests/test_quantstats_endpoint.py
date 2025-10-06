import math
import unittest

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from quantstats import stats as qs_stats

from app import app


class QuantStatsEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def post_metrics(self, payload):
        response = self.client.post("/metrics/quantstats", json=payload)
        self.assertEqual(response.status_code, 200, msg=response.text)
        return response.json()["metrics"]

    def test_calmar_matches_quantstats_for_returns(self):
        # alternating wins/losses to ensure non-zero drawdown
        returns = [0.012, -0.018, 0.025, -0.01, 0.017, -0.022, 0.03]
        index = pd.date_range("2020-01-01", periods=len(returns))
        series = pd.Series(returns, index=index, dtype="float64")
        expected = float(qs_stats.calmar(series))
        expected_gpr = float(qs_stats.gain_to_pain_ratio(series))

        metrics = self.post_metrics({"returns": returns, "period": "daily", "risk_free_rate": 0.0})

        self.assertIn("qs_calmar", metrics)
        self.assertIsNotNone(metrics["qs_calmar"])
        self.assertAlmostEqual(metrics["qs_calmar"], expected, places=9)

        self.assertIn("qs_gain_to_pain_ratio", metrics)
        self.assertIsNotNone(metrics["qs_gain_to_pain_ratio"])
        self.assertAlmostEqual(metrics["qs_gain_to_pain_ratio"], expected_gpr, places=9)

    def test_calmar_matches_quantstats_for_equity_path(self):
        equity = [100, 103, 101, 105, 108, 104, 109, 107]
        returns = np.diff(equity) / np.array(equity[:-1])
        index = pd.date_range("2020-01-01", periods=len(returns))
        series = pd.Series(returns, index=index, dtype="float64")
        expected = float(qs_stats.calmar(series))

        metrics = self.post_metrics({"equity": equity, "period": "daily"})

        self.assertIn("qs_calmar", metrics)
        self.assertIsNotNone(metrics["qs_calmar"])
        self.assertAlmostEqual(metrics["qs_calmar"], expected, places=9)

    def test_calmar_drops_to_none_when_result_is_not_finite(self):
        # steadily increasing equity -> zero drawdown -> infinite calmar
        returns = [0.01] * 10
        index = pd.date_range("2020-01-01", periods=len(returns))
        series = pd.Series(returns, index=index, dtype="float64")
        result = qs_stats.calmar(series)
        self.assertTrue(math.isinf(result))

        metrics = self.post_metrics({"returns": returns, "period": "daily"})

        self.assertIsNone(metrics["qs_calmar"], "Infinite values should be sanitized to None for API clients")


if __name__ == "__main__":
    unittest.main()
