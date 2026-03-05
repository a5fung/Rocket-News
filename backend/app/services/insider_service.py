"""
Insider trading data via SEC EDGAR Form 4 filings.

No API key required — uses the official EDGAR submissions API and filing archive.
Filters for meaningful transactions only: P (open-market purchases) and S (sales).
Ignores: A (grants/awards), F (tax withholding), other derivative transactions.

Rate limit: EDGAR allows 10 req/s. We parallelize XML fetches but cap at 5
recent Form 4s per symbol to stay well within limits.
"""

import asyncio
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

from app.services.market_service import _http  # reuse shared httpx client

_EDGAR_HEADERS = {"User-Agent": "RocketNews/0.1 research@rocketnews.app"}

# Ticker → zero-padded 10-digit CIK string (process lifetime cache)
_CIK_MAP: dict[str, str] = {}
_cik_loaded = False

# Per-symbol insider trade cache — 2h TTL
_insider_cache: dict[str, tuple[float, list[dict]]] = {}
_INSIDER_TTL = 7_200.0


async def _load_cik_map() -> None:
    global _CIK_MAP, _cik_loaded
    if _cik_loaded:
        return
    try:
        resp = await _http.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=_EDGAR_HEADERS,
        )
        if resp.status_code == 200:
            for entry in resp.json().values():
                ticker = str(entry.get("ticker", "")).upper()
                cik = str(entry.get("cik_str", "")).zfill(10)
                if ticker:
                    _CIK_MAP[ticker] = cik
        _cik_loaded = True
    except Exception:
        pass


async def _recent_form4_filings(cik: str, days: int) -> list[dict]:
    """Return metadata for the 5 most recent Form 4 filings within `days`."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        resp = await _http.get(
            f"https://data.sec.gov/submissions/CIK{cik}.json",
            headers=_EDGAR_HEADERS,
        )
        if resp.status_code != 200:
            return []
        recent = resp.json().get("filings", {}).get("recent", {})
        forms   = recent.get("form", [])
        dates   = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        docs    = recent.get("primaryDocument", [])

        filings = []
        for form, date, acc, doc in zip(forms, dates, accessions, docs):
            if form != "4":
                continue
            if date < cutoff:
                break  # filings are newest-first
            filings.append({"date": date, "acc": acc.replace("-", ""), "doc": doc, "cik": cik})
            if len(filings) >= 5:
                break
        return filings
    except Exception:
        return []


async def _parse_form4(filing: dict) -> dict | None:
    cik_int = int(filing["cik"])
    url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{filing['acc']}/{filing['doc']}"
    try:
        resp = await _http.get(url, headers=_EDGAR_HEADERS)
        if resp.status_code != 200:
            return None
        root = ET.fromstring(resp.text)

        # Reporter info
        owner = root.find(".//reportingOwner")
        if owner is None:
            return None
        name  = (owner.findtext(".//rptOwnerName") or "").strip()
        title = (owner.findtext(".//officerTitle") or "").strip()
        is_director = owner.findtext(".//isDirector") == "1"
        is_10pct    = owner.findtext(".//isTenPercentOwner") == "1"
        role = title or ("Director" if is_director else "10% Owner" if is_10pct else "Insider")

        # Non-derivative transactions (open-market buys/sells)
        transactions = []
        for tx in root.findall(".//nonDerivativeTransaction"):
            code = (tx.findtext(".//transactionCode") or "").strip()
            if code not in ("P", "S"):
                continue  # skip grants (A), tax withholding (F), etc.
            try:
                shares = float(tx.findtext(".//transactionShares/value") or "0")
                price  = float(tx.findtext(".//transactionPricePerShare/value") or "0") or None
            except ValueError:
                continue
            date_val = tx.findtext(".//transactionDate/value") or filing["date"]
            transactions.append({
                "type":   "buy" if code == "P" else "sell",
                "shares": int(shares),
                "price":  price,
                "date":   date_val,
            })

        if not transactions:
            return None
        return {"name": name, "role": role, "transactions": transactions, "filingDate": filing["date"]}
    except Exception:
        return None


async def get_insider_trades(symbol: str, days: int = 30) -> list[dict]:
    now = time.monotonic()
    cached = _insider_cache.get(symbol)
    if cached and (now - cached[0]) < _INSIDER_TTL:
        return cached[1]

    await _load_cik_map()
    cik = _CIK_MAP.get(symbol.upper())
    if not cik:
        _insider_cache[symbol] = (now, [])
        return []

    filings = await _recent_form4_filings(cik, days=days)
    parsed  = await asyncio.gather(*[_parse_form4(f) for f in filings])
    trades  = [p for p in parsed if p is not None]

    _insider_cache[symbol] = (now, trades)
    return trades
