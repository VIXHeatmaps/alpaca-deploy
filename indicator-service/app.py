# ===================== BEGIN: CODE BLOCK A — FastAPI TA-Lib Service =====================
"""
IMPORTANT: AVOIDING FORWARD-LOOKING BIAS IN INDICATORS

When implementing new indicators, ensure NO forward-looking bias:

RULE: The indicator value at index i must ONLY use data from days 0 through i-1.
      It must NOT include any information from day i itself.

WHY: In backtesting, we make decisions at the start of day i based on what we knew
     at the end of day i-1. The close price of day i is unknown until day i ends.

EXAMPLES:
  ✅ CORRECT: result[i] = SMA(prices[0:i])  # Uses prices through i-1
  ❌ WRONG:   result[i] = SMA(prices[0:i+1]) # Uses price[i] which we don't know yet!

For custom indicators (non-TA-Lib):
  - Always LAG by 1 day: shift your result array forward by 1
  - Example: result[1:] = calculated_values[:-1]

TA-Lib indicators (RSI, SMA, EMA, etc.) are already point-in-time correct.
Custom indicators (VOLATILITY, CUMULATIVE_RETURN) required manual lagging.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import math

import numpy as np
import pandas as pd
import talib
from quantstats import stats as qs_stats

app = FastAPI(title="Indicator Service", version="1.1")

# ---------- Request models ----------
class CloseOnlyReq(BaseModel):
    indicator: str
    prices: List[float]
    params: Optional[Dict] = {}

class HLCReq(BaseModel):
    indicator: str
    high: List[float]
    low: List[float]
    close: List[float]
    params: Optional[Dict] = {}

class HLCVReq(BaseModel):
    indicator: str
    high: List[float]
    low: List[float]
    close: List[float]
    volume: List[float]
    params: Optional[Dict] = {}

class CloseVolumeReq(BaseModel):
    indicator: str
    close: List[float]
    volume: List[float]
    params: Optional[Dict] = {}

# legacy / convenience for earlier curl tests
class RSIRequest(BaseModel):
    values: List[float] = Field(..., min_items=2)
    period: int = 14


class QuantStatsRequest(BaseModel):
    returns: Optional[List[float]] = None
    equity: Optional[List[float]] = None
    risk_free_rate: float = 0.0
    period: str = "daily"
    confidence: float = 0.95

# ---------- Utils ----------
def _nan_to_none(arr: np.ndarray):
    return [None if (x is None or (isinstance(x, float) and np.isnan(x))) else float(x) for x in arr]

def _as_nd(a: List[float]) -> np.ndarray:
    return np.array(a, dtype="float64")


def _clean_numeric_list(values: Optional[List[float]]) -> np.ndarray:
    if not values:
        return np.array([], dtype="float64")
    arr = np.array(values, dtype="float64")
    if arr.size == 0:
        return arr
    mask = np.isfinite(arr)
    return arr[mask]


_PERIOD_SETTINGS = {
    "daily": ("D", 252),
    "day": ("D", 252),
    "1d": ("D", 252),
    "weekly": ("W", 52),
    "week": ("W", 52),
    "1w": ("W", 52),
    "monthly": ("M", 12),
    "month": ("M", 12),
    "1m": ("M", 12),
    "quarterly": ("Q", 4),
    "quarter": ("Q", 4),
    "1q": ("Q", 4),
    "yearly": ("Y", 1),
    "annual": ("Y", 1),
    "1y": ("Y", 1),
}


def _resolve_period_settings(label: Optional[str]) -> tuple[str, int]:
    if not label:
        return "D", 252
    key = str(label).strip().lower()
    if key in _PERIOD_SETTINGS:
        return _PERIOD_SETTINGS[key]
    try:
        periods = int(float(key))
        if periods > 0:
            return "D", periods
    except (TypeError, ValueError):
        pass
    return "D", 252


def _annual_to_periodic_rate(rate: float, periods: int) -> float:
    try:
        annual = float(rate)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(annual) or annual == 0.0:
        return 0.0
    periods = max(1, int(periods or 0))
    return (1.0 + annual) ** (1.0 / periods) - 1.0


def _returns_series(values: np.ndarray, freq: str) -> pd.Series:
    idx = pd.date_range(end=pd.Timestamp.today().normalize(), periods=values.size, freq=freq)
    return pd.Series(values, index=idx, dtype="float64")


def _equity_to_returns(equity: np.ndarray) -> np.ndarray:
    if equity.size < 2:
        return np.array([], dtype="float64")
    prev = equity[:-1]
    curr = equity[1:]
    safe_prev = np.where(prev == 0, np.nan, prev)
    returns = curr / safe_prev - 1.0
    mask = np.isfinite(returns)
    return returns[mask]

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/metrics/quantstats")
def quantstats_metrics(req: QuantStatsRequest):
    returns_arr = _clean_numeric_list(req.returns)
    if returns_arr.size < 2 and req.equity:
        returns_arr = _equity_to_returns(_clean_numeric_list(req.equity))

    if returns_arr.size < 2:
        raise HTTPException(status_code=400, detail="Provide at least two clean return observations or equity points.")

    freq, periods_per_year = _resolve_period_settings(req.period)
    series = _returns_series(returns_arr, freq)
    excess_per_period = _annual_to_periodic_rate(req.risk_free_rate, periods_per_year)
    if excess_per_period:
        calmar_series = series - excess_per_period
    else:
        calmar_series = series

    metrics: Dict[str, Optional[float]] = {
        "qs_sample_size": float(series.shape[0])
    }

    def capture(name: str, fn):
        try:
            value = fn()
            if isinstance(value, (np.ndarray, list, tuple)):
                value = value[0] if len(value) else np.nan
            if isinstance(value, (np.floating, np.integer)):
                value = float(value)
            if isinstance(value, (int, float)) and math.isfinite(value):
                metrics[name] = float(value)
            else:
                metrics[name] = None
        except Exception:
            metrics[name] = None

    capture("qs_calmar", lambda: qs_stats.calmar(calmar_series, periods=periods_per_year))
    capture("qs_omega", lambda: qs_stats.omega(series))
    capture("qs_tail_ratio", lambda: qs_stats.tail_ratio(series))
    capture("qs_common_sense_ratio", lambda: qs_stats.common_sense_ratio(series))
    capture("qs_value_at_risk", lambda: qs_stats.value_at_risk(series, confidence=req.confidence))
    capture("qs_cvar", lambda: qs_stats.cvar(series, confidence=req.confidence))
    capture("qs_ulcer_index", lambda: qs_stats.ulcer_index(series))
    capture("qs_avg_drawdown", lambda: qs_stats.avg_drawdown(series))
    capture("qs_avg_drawdown_days", lambda: qs_stats.avg_drawdown_days(series))
    capture("qs_payoff_ratio", lambda: qs_stats.payoff_ratio(series))
    capture("qs_profit_ratio", lambda: qs_stats.profit_ratio(series))
    capture("qs_gain_to_pain_ratio", lambda: qs_stats.gain_to_pain_ratio(series))
    capture("qs_skew", lambda: qs_stats.skew(series))
    capture("qs_kurtosis", lambda: qs_stats.kurtosis(series))
    capture("qs_win_rate", lambda: qs_stats.win_rate(series))
    capture("qs_loss_rate", lambda: qs_stats.loss_rate(series))

    return {"metrics": metrics}

# ---------- Close-only indicators (existing) ----------
@app.post("/indicator")
def indicator_router(payload: dict):
    """
    Single endpoint that dispatches based on fields present.
    - Close-only: {"prices":[...]}
    - HLC: {"high":[...], "low":[...], "close":[...]}
    - HLCV: {"high":[...], "low":[...], "close":[...], "volume":[...]}
    - Close+Volume: {"close":[...], "volume":[...]}
    """
    ind = (payload.get("indicator") or "").upper().strip()

    # ---- Close-only path ----
    if "prices" in payload:
        req = CloseOnlyReq(**payload)
        prices = _as_nd(req.prices)

        if prices.size < 2:
            raise HTTPException(status_code=400, detail="prices must contain at least 2 values")

        if ind == "CURRENT_PRICE" or ind in ("PRICE", "CLOSE", "LAST"):
            return {"values": _nan_to_none(prices)}

        if ind == "RSI":
            period = int(req.params.get("period", 14))
            if prices.size < period:
                raise HTTPException(status_code=400, detail="prices length must be >= period")
            out = talib.RSI(prices, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "SMA":
            period = int(req.params.get("period", 14))
            out = talib.SMA(prices, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "EMA":
            period = int(req.params.get("period", 14))
            out = talib.EMA(prices, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind in ("MACD", "MACD_HIST", "MACD-HIST", "MACD_LINE", "MACD_SIGNAL"):
            fast = int(req.params.get("fastperiod", 12))
            slow = int(req.params.get("slowperiod", 26))
            signal = int(req.params.get("signalperiod", 9))
            macd, macd_signal, macd_hist = talib.MACD(prices, fastperiod=fast, slowperiod=slow, signalperiod=signal)
            if ind in ("MACD", "MACD_HIST", "MACD-HIST"):
                return {"values": _nan_to_none(macd_hist)}
            if ind == "MACD_LINE":
                return {"values": _nan_to_none(macd)}
            if ind == "MACD_SIGNAL":
                return {"values": _nan_to_none(macd_signal)}

        if ind in ("PPO", "PPO_LINE", "PPO_SIGNAL", "PPO_HIST"):
            fast = int(req.params.get("fastperiod", 12))
            slow = int(req.params.get("slowperiod", 26))
            matype = int(req.params.get("matype", 0))
            ppo_line = talib.PPO(prices, fastperiod=fast, slowperiod=slow, matype=matype)
            if ind in ("PPO", "PPO_LINE"):
                return {"values": _nan_to_none(ppo_line)}
            signalperiod = int(req.params.get("signalperiod", 9))
            ppo_signal = talib.EMA(ppo_line, timeperiod=signalperiod)
            if ind == "PPO_SIGNAL":
                return {"values": _nan_to_none(ppo_signal)}
            if ind == "PPO_HIST":
                hist = ppo_line - ppo_signal
                return {"values": _nan_to_none(hist)}

        if ind in ("BBANDS_UPPER", "BBANDS_MIDDLE", "BBANDS_LOWER"):
            period = int(req.params.get("period", 20))
            nbdevup = float(req.params.get("nbdevup", 2.0))
            nbdevdn = float(req.params.get("nbdevdn", 2.0))
            matype = int(req.params.get("matype", 0))
            upper, middle, lower = talib.BBANDS(prices, timeperiod=period, nbdevup=nbdevup, nbdevdn=nbdevdn, matype=matype)
            if ind == "BBANDS_UPPER":
                return {"values": _nan_to_none(upper)}
            if ind == "BBANDS_MIDDLE":
                return {"values": _nan_to_none(middle)}
            if ind == "BBANDS_LOWER":
                return {"values": _nan_to_none(lower)}

        if ind == "CUMULATIVE_RETURN":
            # Calculate cumulative return - LAGGED to avoid forward-looking bias
            # Value at index i represents cumulative return as of EOD i-1
            # This ensures we only use information available BEFORE making a decision on day i
            if prices.size < 1 or prices[0] == 0:
                raise HTTPException(status_code=400, detail="Invalid prices for cumulative return")

            result = np.full(prices.size, np.nan)
            # Shift by 1: result[i] = return from start to day i-1
            if prices.size > 1:
                result[1:] = (prices[:-1] / prices[0]) - 1.0
            result[0] = 0.0  # No return before first day

            return {"values": _nan_to_none(result)}

        if ind == "VOLATILITY":
            # Calculate rolling volatility - LAGGED to avoid forward-looking bias
            # Value at index i represents volatility using data UP TO day i-1 (not including day i)
            # This ensures we only use returns that occurred BEFORE day i when making decisions
            period = int(req.params.get("period", 20))
            annualize = req.params.get("annualize", "true").lower() == "true"

            if prices.size < period + 1:
                raise HTTPException(status_code=400, detail=f"Need at least {period + 1} prices for volatility calculation")

            # Calculate returns: return[i] = (price[i+1] - price[i]) / price[i]
            returns = np.diff(prices) / prices[:-1]

            # Calculate rolling standard deviation using pandas
            returns_series = pd.Series(returns)
            rolling_vol = returns_series.rolling(window=period).std().values

            # Annualize if requested (assuming daily data)
            if annualize:
                rolling_vol = rolling_vol * np.sqrt(252)

            # Align to prices: result[i] uses returns up to day i-1
            # rolling_vol[j] uses returns[j-period+1:j+1] (j is in returns space, 1 shorter than prices)
            # We want result[i] to use rolling_vol calculated through day i-1
            # So result[i] should get rolling_vol[i-2] (which used returns through index i-2, i.e. day i-1)
            result = np.full(prices.size, np.nan)
            if prices.size > period:
                # Shift by 1 day to avoid forward-looking bias
                result[period:] = rolling_vol[period-2:-1]

            return {"values": _nan_to_none(result)}

        # Unsupported close-only
        raise HTTPException(status_code=400, detail=f"Unsupported close-only indicator '{ind}'")

    # ---- HLC path (new) ----
    if all(k in payload for k in ("high", "low", "close")) and "volume" not in payload:
        req = HLCReq(**payload)
        high, low, close = _as_nd(req.high), _as_nd(req.low), _as_nd(req.close)

        if ind == "ADX":
            period = int(req.params.get("period", 14))
            out = talib.ADX(high, low, close, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "STOCH_K":  # return slow %K
            fastk = int(req.params.get("fastk_period", 14))
            slowk = int(req.params.get("slowk_period", 3))
            slowd = int(req.params.get("slowd_period", 3))
            slowk_matype = int(req.params.get("slowk_matype", 0))
            slowd_matype = int(req.params.get("slowd_matype", 0))
            slowk_arr, slowd_arr = talib.STOCH(
                high, low, close,
                fastk_period=fastk,
                slowk_period=slowk, slowk_matype=slowk_matype,
                slowd_period=slowd, slowd_matype=slowd_matype
            )
            return {"values": _nan_to_none(slowk_arr)}

        if ind in ("AROON_UP", "AROON_DOWN"):
            period = int(req.params.get("period", 14))
            aroondown, aroonup = talib.AROON(high, low, timeperiod=period)
            if ind == "AROON_UP":
                return {"values": _nan_to_none(aroonup)}
            if ind == "AROON_DOWN":
                return {"values": _nan_to_none(aroondown)}

        if ind == "AROONOSC":
            period = int(req.params.get("period", 14))
            out = talib.AROONOSC(high, low, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "WILLR":
            period = int(req.params.get("period", 14))
            out = talib.WILLR(high, low, close, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "CCI":
            period = int(req.params.get("period", 14))
            out = talib.CCI(high, low, close, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "NATR":
            period = int(req.params.get("period", 14))
            out = talib.NATR(high, low, close, timeperiod=period)
            return {"values": _nan_to_none(out)}

        raise HTTPException(status_code=400, detail=f"Unsupported HLC indicator '{ind}'")

    # ---- HLCV path (new) ----
    if all(k in payload for k in ("high", "low", "close", "volume")):
        req = HLCVReq(**payload)
        high, low, close, volume = _as_nd(req.high), _as_nd(req.low), _as_nd(req.close), _as_nd(req.volume)

        if ind == "MFI":
            period = int(req.params.get("period", 14))
            out = talib.MFI(high, low, close, volume, timeperiod=period)
            return {"values": _nan_to_none(out)}

        if ind == "AD":
            out = talib.AD(high, low, close, volume)
            return {"values": _nan_to_none(out)}

        if ind == "ADOSC":
            fast = int(req.params.get("fastperiod", 3))
            slow = int(req.params.get("slowperiod", 10))
            out = talib.ADOSC(high, low, close, volume, fastperiod=fast, slowperiod=slow)
            return {"values": _nan_to_none(out)}

        raise HTTPException(status_code=400, detail=f"Unsupported HLCV indicator '{ind}'")

    # ---- Close + Volume path (legacy OBV) ----
    if all(k in payload for k in ("close", "volume")) and "high" not in payload:
        req = CloseVolumeReq(**payload)
        close, volume = _as_nd(req.close), _as_nd(req.volume)

        if ind == "OBV":
            out = talib.OBV(close, volume)
            return {"values": _nan_to_none(out)}

        raise HTTPException(status_code=400, detail=f"Unsupported Close+Volume indicator '{ind}'")

    raise HTTPException(status_code=400, detail="Malformed request: missing required fields")

@app.post("/rsi")
def rsi(req: RSIRequest):
    arr = _as_nd(req.values)
    out = talib.RSI(arr, timeperiod=req.period)
    return {"rsi": _nan_to_none(out)}
# ====================== END: CODE BLOCK A — FastAPI TA-Lib Service ======================

if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
