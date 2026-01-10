from __future__ import annotations

import pandas as pd
import numpy as np


# =========================
# Data loading
# =========================

def load_prices(path: str) -> pd.DataFrame:
    """
    Load prices CSV and return a clean DataFrame.

    Expected columns: date, asset, price, category
    - date parsed to datetime
    - price parsed to numeric
    - rows with missing date/asset/price removed
    - sorted by asset/date
    """
    df = pd.read_csv(path)

    required = {"date", "asset", "price", "category"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {sorted(required)}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce", dayfirst=True)
    df["asset"] = df["asset"].astype(str).str.strip()
    df["category"] = df["category"].astype(str).str.strip()

    df["price"] = (
        df["price"]
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace(" ", "", regex=False)
    )
    df["price"] = pd.to_numeric(df["price"], errors="coerce")

    df = df.dropna(subset=["date", "asset", "price"])
    df = df.sort_values(["asset", "date"]).reset_index(drop=True)
    return df


# =========================
# Returns computation
# =========================

def compute_monthly_returns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute monthly returns in DECIMAL (e.g. 0.02 = +2%).
    Note: pct_change() returns decimal returns by definition.
    """
    df = df.copy()
    df["monthly_return"] = df.groupby("asset")["price"].pct_change()
    df["year"] = df["date"].dt.year
    return df


def compute_yearly_returns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute yearly returns in DECIMAL (e.g. 0.15 = +15%),
    by compounding monthly returns: (1+r).prod() - 1
    """
    tmp = df.dropna(subset=["monthly_return"]).copy()
    yr = (
        tmp.groupby(["asset", "year"])["monthly_return"]
        .apply(lambda x: (1 + x).prod() - 1)
        .reset_index(name="yearly_return")
    )
    return yr


def compute_yearly_wide(yr: pd.DataFrame) -> pd.DataFrame:
    """Pivot yearly returns to a wide format: index=year, columns=asset, values=yearly_return (decimal)."""
    return yr.pivot(index="year", columns="asset", values="yearly_return").sort_index()


def pairwise_overlap_counts(wide: pd.DataFrame) -> pd.DataFrame:
    """Count overlapping years between each pair of assets."""
    m = wide.notna().astype(int)
    return m.T.dot(m)


# =========================
# Rolling correlation
# =========================

def compute_rolling_corr_year_end(
    df_monthly: pd.DataFrame,
    asset_a: str,
    asset_b: str,
    window_months: int,
) -> pd.Series:
    """
    Rolling correlation (DECIMAL returns as inputs, correlation output is [-1, 1]).
    We take the last rolling-corr value of each year.
    """
    monthly_wide = (
        df_monthly[df_monthly["asset"].isin([asset_a, asset_b])]
        .pivot(index="date", columns="asset", values="monthly_return")
        .sort_index()
    )

    monthly_wide = monthly_wide[[asset_a, asset_b]].dropna(how="any")
    if monthly_wide.empty:
        return pd.Series(dtype=float)

    s1 = monthly_wide[asset_a]
    s2 = monthly_wide[asset_b]

    rc = s1.rolling(window=window_months, min_periods=window_months).corr(s2).dropna()
    if rc.empty:
        return pd.Series(dtype=float)

    rc_year_end = rc.groupby(rc.index.year).last()
    rc_year_end.index.name = "year"
    return rc_year_end


# =========================
# Display cap (still DECIMAL!)
# =========================

def cap_yearly_returns_for_display(yr: pd.DataFrame, cap_pct: float) -> pd.DataFrame:
    """
    Apply a visual cap (for UI) BUT keep everything in DECIMAL.

    Example:
      cap_pct=100 -> cap_dec=1.0 -> clamp to [-1.0, +1.0]
      yearly_return=1.80 (180%) becomes disp_return=1.0 (100%), clipped=True
    """
    cap_dec = float(cap_pct) / 100.0
    out = yr.copy()
    out["true_return"] = out["yearly_return"].astype(float)
    out["disp_return"] = out["yearly_return"].astype(float).clip(lower=-cap_dec, upper=cap_dec)
    out["clipped"] = out["true_return"] != out["disp_return"]
    return out


# =========================
# Payload builder
# =========================

def compute_payload(
    df_prices: pd.DataFrame,
    assets: list[str],
    year_start: int,
    year_end: int,
    cap_pct: float,
    rolling_window_months: int,
) -> dict:
    # Monthly + yearly (DECIMAL)
    df_m = compute_monthly_returns(df_prices)
    df_m_sel = df_m[df_m["asset"].isin(assets)].copy()

    yr = compute_yearly_returns(df_m_sel)
    yr = yr[(yr["year"] >= year_start) & (yr["year"] <= year_end)].copy()

    # Apply cap for display (still DECIMAL)
    yr_disp = cap_yearly_returns_for_display(yr, cap_pct=cap_pct)

    # Pearson + overlap on yearly returns (DECIMAL)
    yearly_wide = compute_yearly_wide(yr)
    pearson = None
    overlap = None
    if yearly_wide.shape[1] >= 2:
        corr = yearly_wide.corr(method="pearson", min_periods=2)
        ov = pairwise_overlap_counts(yearly_wide)
        order = list(yearly_wide.columns)
        pearson = corr.reindex(index=order, columns=order)
        overlap = ov.reindex(index=order, columns=order)

    # Rolling corr only if exactly 2 assets (correlation [-1,1])
    rolling = None
    if len(assets) == 2:
        a1, a2 = assets[0], assets[1]
        rc = compute_rolling_corr_year_end(df_m, a1, a2, int(rolling_window_months))
        rc = rc[(rc.index >= year_start) & (rc.index <= year_end)]
        if not rc.empty:
            rolling = [{"year": int(y), "value": float(v)} for y, v in rc.items()]

    # Build JSON-friendly rows
    yearly_rows = []
    for _, r in yr_disp.sort_values(["asset", "year"]).iterrows():
        yearly_rows.append(
            {
                "asset": str(r["asset"]),
                "year": int(r["year"]),
                # DECIMAL outputs (0.15 = 15%)
                "true_return": float(r["true_return"]),
                "disp_return": float(r["disp_return"]),
                "clipped": bool(r["clipped"]),
            }
        )

    out = {
        "inputs": {
            "assets": assets,
            "yearRange": [int(year_start), int(year_end)],
            "capPct": float(cap_pct),
            "rollingWindowMonths": int(rolling_window_months),
        },
        "yearlyReturns": yearly_rows,  # decimals
        "rollingCorrelation": rolling,  # correlation in [-1, 1]
        "pearsonMatrix": None if pearson is None else pearson.round(6).to_dict(),
        "overlapYears": None if overlap is None else overlap.astype(int).to_dict(),
    }
    return out
