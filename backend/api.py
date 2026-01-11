from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Tuple, Optional

from fastapi import FastAPI, HTTPException, Header, Query
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

# =========================
# Feedback storage (SQLite)
# =========================
FEEDBACK_DB_PATH = os.getenv("CORRELIO_FEEDBACK_DB", "data/feedback.db")
ADMIN_TOKEN = os.getenv("CORRELIO_ADMIN_TOKEN", "")  # set this in your env for /feedback GET

def _ensure_feedback_db():
    os.makedirs(os.path.dirname(FEEDBACK_DB_PATH), exist_ok=True)
    con = sqlite3.connect(FEEDBACK_DB_PATH)
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_utc TEXT NOT NULL,
                email TEXT,
                provider TEXT,
                user_id TEXT,
                message TEXT NOT NULL,
                page TEXT,
                selected_assets TEXT,
                year_start INTEGER,
                year_end INTEGER,
                cap_pct REAL,
                rolling_window_months INTEGER,
                user_agent TEXT,
                meta_json TEXT
            );
            """
        )
        con.commit()
    finally:
        con.close()

@app.on_event("startup")
def startup():
    _ensure_feedback_db()

def _db():
    return sqlite3.connect(FEEDBACK_DB_PATH)

# =========================
# Existing compute contract
# =========================
class ComputeRequest(BaseModel):
    assets: List[str] = Field(..., min_length=1, max_length=10)
    yearRange: Tuple[int, int]
    capPct: float = Field(100.0, ge=50.0, le=2000.0)
    rollingWindowMonths: int = Field(24, ge=2, le=120)

# =========================
# Feedback models
# =========================
class FeedbackRequest(BaseModel):
    message: str = Field(..., min_length=3, max_length=2000)

    email: Optional[str] = Field(default=None, max_length=254)
    provider: Optional[str] = Field(default=None, max_length=50)
    userId: Optional[str] = Field(default=None, max_length=128)

    page: Optional[str] = Field(default=None, max_length=200)
    selectedAssets: Optional[List[str]] = Field(default=None, max_length=10)

    yearStart: Optional[int] = None
    yearEnd: Optional[int] = None
    capPct: Optional[float] = None
    rollingWindowMonths: Optional[int] = None

    metaJson: Optional[str] = Field(default=None, max_length=5000)

class FeedbackRow(BaseModel):
    id: int
    created_at_utc: str
    email: Optional[str]
    provider: Optional[str]
    user_id: Optional[str]
    message: str
    page: Optional[str]
    selected_assets: Optional[str]
    year_start: Optional[int]
    year_end: Optional[int]
    cap_pct: Optional[float]
    rolling_window_months: Optional[int]
    user_agent: Optional[str]

# =========================
# Routes
# =========================
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/assets")
def assets():
    df = load_prices(DATA_PATH)

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


@app.post("/feedback")
def create_feedback(
    req: FeedbackRequest,
    user_agent: Optional[str] = Header(default=None, alias="User-Agent"),
):
    created_at = datetime.now(timezone.utc).isoformat()

    selected_assets = None
    if req.selectedAssets:
        selected_assets = ",".join([a.strip() for a in req.selectedAssets if a and a.strip()])[:1000]

    con = _db()
    try:
        cur = con.execute(
            """
            INSERT INTO feedback (
                created_at_utc, email, provider, user_id, message, page, selected_assets,
                year_start, year_end, cap_pct, rolling_window_months, user_agent, meta_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                created_at,
                (req.email.strip() if req.email else None),
                (req.provider.strip() if req.provider else None),
                (req.userId.strip() if req.userId else None),
                req.message.strip(),
                (req.page.strip() if req.page else None),
                selected_assets,
                req.yearStart,
                req.yearEnd,
                req.capPct,
                req.rollingWindowMonths,
                user_agent,
                req.metaJson,
            ),
        )
        con.commit()
        new_id = int(cur.lastrowid)
    finally:
        con.close()

    return {"ok": True, "id": new_id, "created_at_utc": created_at}


@app.get("/feedback", response_model=List[FeedbackRow])
def list_feedback(
    limit: int = Query(50, ge=1, le=200),
    x_admin_token: str = Header(default="", alias="X-Admin-Token"),
):
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    con = _db()
    try:
        rows = con.execute(
            """
            SELECT id, created_at_utc, email, provider, user_id, message, page, selected_assets,
                   year_start, year_end, cap_pct, rolling_window_months, user_agent
            FROM feedback
            ORDER BY id DESC
            LIMIT ?;
            """,
            (limit,),
        ).fetchall()
    finally:
        con.close()

    out: List[FeedbackRow] = []
    for r in rows:
        out.append(
            FeedbackRow(
                id=r[0],
                created_at_utc=r[1],
                email=r[2],
                provider=r[3],
                user_id=r[4],
                message=r[5],
                page=r[6],
                selected_assets=r[7],
                year_start=r[8],
                year_end=r[9],
                cap_pct=r[10],
                rolling_window_months=r[11],
                user_agent=r[12],
            )
        )
    return out
