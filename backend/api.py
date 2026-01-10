from __future__ import annotations

import os
from typing import List, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engine import load_prices, compute_payload

app = FastAPI(title="Correlio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = os.getenv("CORRELIO_CSV_PATH", "data/prices.csv")


class ComputeRequest(BaseModel):
    assets: List[str] = Field(..., min_length=1, max_length=10)
    yearRange: Tuple[int, int]
    capPct: float = Field(100.0, ge=50.0, le=2000.0)
    rollingWindowMonths: int = Field(24, ge=2, le=120)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/assets")
def assets():
    df = load_prices(DATA_PATH)

    # ✅ On renvoie description si la colonne existe, sinon on ne casse rien
    cols = ["asset", "category"]
    if "description" in df.columns:
        cols.append("description")

    meta = (
        df[cols]
        .drop_duplicates()
        .sort_values(["category", "asset"])
        .to_dict(orient="records")
    )
    return {"assets": meta}


@app.post("/compute")
def compute(req: ComputeRequest):
    y0, y1 = req.yearRange
    if y0 > y1:
        raise HTTPException(status_code=400, detail="Invalid yearRange: start > end")

    df_prices = load_prices(DATA_PATH)

    min_year = int(df_prices["date"].dt.year.min())
    max_year = int(df_prices["date"].dt.year.max())

    if y0 < min_year or y1 > max_year:
        raise HTTPException(
            status_code=400,
            detail=f"yearRange must be within [{min_year}, {max_year}]",
        )

    return compute_payload(
        df_prices=df_prices,
        assets=req.assets,
        year_start=y0,
        year_end=y1,
        cap_pct=req.capPct,
        rolling_window_months=req.rollingWindowMonths,
    )
