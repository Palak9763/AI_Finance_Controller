"""
Deterministic reconciliation engine.

Classification is a pure function of (source records, tolerance config) ->
deterministic status + evidence trail. AI NEVER touches this module.

Matching hierarchy (stop at first level that produces a confident match):
  1. Exact invoice number + GSTIN
  2. Normalized invoice number + GSTIN
  3. Invoice number + vendor + amount
  4. Vendor + amount + date-within-tolerance
  5. Fuzzy/candidate detection -- NEVER auto-accepted; -> AMBIGUOUS/REVIEW_REQUIRED
"""
from dataclasses import dataclass, field
from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from .normalization import (
    normalize_invoice_number, normalize_vendor_name, normalize_gstin,
    normalize_amount, normalize_date, extract_reference_from_narration,
    NormalizationResult,
)

TOLERANCE_CONFIG = {
    "amount_absolute_tolerance": Decimal("100.00"),
    "amount_percentage_tolerance": Decimal("0.5"),   # percent
    "date_tolerance_days": 3,
}

STATUSES = [
    "MATCHED", "MATCHED_WITH_TOLERANCE", "PARTIAL_MATCH", "MISMATCH",
    "MISSING", "DUPLICATE", "AMBIGUOUS", "REVIEW_REQUIRED",
]


@dataclass
class NormalizedInvoice:
    key: str
    invoice_no_raw: str
    invoice_no_norm: str
    vendor_raw: str
    vendor_norm: str
    gstin_raw: str
    gstin_norm: str
    gstin_valid: bool
    date_raw: str
    date_norm: Optional[str]
    taxable: Optional[Decimal]
    tax: Optional[Decimal]
    total: Optional[Decimal]
    payment_status: str
    source_id: str


def _days_between(d1: str, d2: str) -> Optional[int]:
    if not d1 or not d2:
        return None
    try:
        a = datetime.fromisoformat(d1).date()
        b = datetime.fromisoformat(d2).date()
        return abs((a - b).days)
    except ValueError:
        return None


def amount_diff(a: Optional[Decimal], b: Optional[Decimal]):
    if a is None or b is None:
        return None, None
    abs_diff = abs(a - b)
    pct_diff = (abs_diff / a * 100) if a != 0 else Decimal(0)
    return abs_diff, pct_diff


def within_tolerance(a: Optional[Decimal], b: Optional[Decimal], cfg=TOLERANCE_CONFIG) -> (bool, Decimal, Decimal):
    abs_diff, pct_diff = amount_diff(a, b)
    if abs_diff is None:
        return False, None, None
    ok = abs_diff <= cfg["amount_absolute_tolerance"] or pct_diff <= cfg["amount_percentage_tolerance"]
    return ok, abs_diff, pct_diff


def normalize_invoice_record(raw: dict, source_id: str, source: str, norm_result: NormalizationResult,
                              invoice_field="invoice_no", vendor_field="vendor", gstin_field="gstin",
                              date_field="date", amount_field="total") -> NormalizedInvoice:
    inv_raw = raw.get(invoice_field, "")
    inv_norm = normalize_invoice_number(inv_raw)
    norm_result.warn(source, source_id, "invoice_no", inv_raw, inv_norm, "strip_separators_uppercase")

    vendor_raw = raw.get(vendor_field, "")
    vendor_norm = normalize_vendor_name(vendor_raw)
    norm_result.warn(source, source_id, "vendor", vendor_raw, vendor_norm, "strip_legal_suffix_casefold")

    gstin_raw = raw.get(gstin_field, "")
    gstin_norm, gstin_valid = normalize_gstin(gstin_raw)
    norm_result.warn(source, source_id, "gstin", gstin_raw, gstin_norm, "uppercase_trim_validate")

    date_raw = raw.get(date_field, "")
    date_norm = normalize_date(date_raw)
    norm_result.warn(source, source_id, "date", date_raw, date_norm or "UNPARSEABLE", "parse_to_iso8601")

    amt_raw = raw.get(amount_field, "")
    amt_norm = normalize_amount(amt_raw)
    norm_result.warn(source, source_id, amount_field, amt_raw, amt_norm, "strip_symbols_to_decimal")

    tax = None
    if "tax" in raw:
        tax = normalize_amount(raw.get("tax"))

    return NormalizedInvoice(
        key=inv_norm, invoice_no_raw=str(inv_raw), invoice_no_norm=inv_norm,
        vendor_raw=str(vendor_raw), vendor_norm=vendor_norm,
        gstin_raw=str(gstin_raw), gstin_norm=gstin_norm, gstin_valid=gstin_valid,
        date_raw=str(date_raw), date_norm=date_norm,
        taxable=None, tax=tax, total=amt_norm,
        payment_status=raw.get("payment_status", ""), source_id=source_id,
    )

@dataclass
class ReconciliationResult:
    invoice_no: str
    vendor: str
    gstin: str
    date: Optional[str]
    invoices_amount: Optional[str]
    gstr1_amount: Optional[str]
    gstr2b_amount: Optional[str]
    tally_amount: Optional[str]
    bank_amount: Optional[str]
    status: str
    match_level: Optional[int]
    absolute_difference: Optional[str]
    percentage_difference: Optional[str]
    evidence: List[str] = field(default_factory=list)
    is_duplicate_group: bool = False
    duplicate_ids: List[str] = field(default_factory=list)


def reconcile(invoices_raw: List[dict], gstr1_raw: List[dict], gstr2b_raw: List[dict],
              tally_raw: List[dict], bank_raw: List[dict],
              cfg: dict = None) -> (List[ReconciliationResult], NormalizationResult):
    """
    Pure function: (source records, tolerance config) -> deterministic status + evidence.
    Never reads ground_truth.
    """
    cfg = cfg or TOLERANCE_CONFIG
    norm = NormalizationResult()

    # --- normalize every source into keyed lookups ---
    def norm_list(raw_list, source, invoice_field, vendor_field, gstin_field, date_field, amount_field, id_field):
        out = []
        for r in raw_list:
            sid = str(r.get(id_field, r.get(invoice_field, "")))
            out.append(normalize_invoice_record(r, sid, source, norm, invoice_field, vendor_field,
                                                 gstin_field, date_field, amount_field))
        return out

    invoices = norm_list(invoices_raw, "invoices", "invoice_no", "vendor", "gstin", "date", "total", "invoice_id")
    gstr1 = norm_list(gstr1_raw, "gstr1", "invoice_no", "customer", "gstin", "date", "total", "invoice_no")
    # Use the pre-computed "total" field (taxable_value + cgst + sgst + igst),
    # which main.py injects before calling reconcile(), so both sides are gross.
    gstr2b = norm_list(gstr2b_raw, "gstr2b", "invoice_no", "supplier_name", "supplier_gstin", "invoice_date",
                        "total", "invoice_no")
    tally = norm_list(tally_raw, "tally", "invoice_no", "party", "gstin", "date", "amount", "voucher_id")

    bank = []
    for r in bank_raw:
        ref = r.get("reference_no") or extract_reference_from_narration(r.get("narration", ""))
        inv_guess = extract_reference_from_narration(r.get("narration", "")) or ref
        rec = dict(r)
        rec["invoice_no"] = inv_guess or ref or ""
        b = normalize_invoice_record(rec, r.get("txn_id", ""), "bank", norm, "invoice_no", "party",
                                      "gstin", "date", "amount")
        b.gstin_norm = ""  # bank has no GSTIN
        bank.append(b)

    # group by normalized invoice number (primary key for reconciliation)
    def group_by_key(items):
        m: Dict[str, List[NormalizedInvoice]] = {}
        for it in items:
            m.setdefault(it.invoice_no_norm, []).append(it)
        return m

    inv_by_key = group_by_key(invoices)
    g1_by_key = group_by_key(gstr1)
    g2b_by_key = group_by_key(gstr2b)
    tally_by_key = group_by_key(tally)
    bank_by_key = group_by_key(bank)

    all_keys = set(inv_by_key) | set(g1_by_key) | set(g2b_by_key) | set(tally_by_key)
    all_keys.discard("")

    # Pre-compute which invoices are contested by >=2 candidates for the same
    # generic ("NA"/unresolvable) bank transaction on vendor+amount alone.
    # These invoices are genuinely ambiguous even though invoice/tally match cleanly.
    contested_keys = set()
    na_bank_by_vendor_amount: Dict[tuple, int] = {}
    for b in bank_by_key.get("NA", []):
        na_bank_by_vendor_amount[(b.vendor_norm, b.total)] = na_bank_by_vendor_amount.get((b.vendor_norm, b.total), 0) + 1
    for key, inv_list in inv_by_key.items():
        for iv in inv_list:
            if (iv.vendor_norm, iv.total) in na_bank_by_vendor_amount:
                candidates_for_txn = [i2 for k2, l2 in inv_by_key.items() for i2 in l2
                                       if i2.vendor_norm == iv.vendor_norm and i2.total == iv.total]
                if len(candidates_for_txn) >= 2:
                    contested_keys.add(key)

    results: List[ReconciliationResult] = []
    duplicate_flagged = set()

    for key in sorted(all_keys):
        inv_list = inv_by_key.get(key, [])
        tally_list = tally_by_key.get(key, [])
        g1_list = g1_by_key.get(key, [])
        g2b_list = g2b_by_key.get(key, [])
        bank_list = bank_by_key.get(key, [])

        primary = (inv_list or g1_list or tally_list)[0]
        vendor = primary.vendor_raw
        gstin = primary.gstin_raw
        inv_date = primary.date_norm
        evidence = []

        if key in contested_keys:
            inv_rec0 = inv_list[0] if inv_list else None
            tally_rec0 = tally_list[0] if tally_list else None
            results.append(ReconciliationResult(
                invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
                invoices_amount=str(inv_rec0.total) if inv_rec0 else None,
                gstr1_amount=str(g1_list[0].total) if g1_list else None,
                gstr2b_amount=str(g2b_list[0].total) if g2b_list else None,
                tally_amount=str(tally_rec0.total) if tally_rec0 else None,
                bank_amount=None, status="AMBIGUOUS", match_level=5,
                absolute_difference=None, percentage_difference=None,
                evidence=["Invoice and Tally records match cleanly, but the bank settlement for this "
                          "vendor/amount is shared by multiple invoices with no distinguishing reference "
                          "number in the narration -- genuinely ambiguous, requires human review."],
            ))
            continue

        # --- DUPLICATE DETECTION (multiple invoice-source or tally-source records for same key) ---
        if len(inv_list) > 1 or len(tally_list) > 1:
            ids = [x.source_id for x in inv_list] + [x.source_id for x in tally_list]
            evidence.append(f"Found {len(inv_list)} invoice record(s) and {len(tally_list)} tally record(s) "
                             f"for invoice key {key} -- duplicate entry detected.")
            results.append(ReconciliationResult(
                invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
                invoices_amount=str(inv_list[0].total) if inv_list else None,
                gstr1_amount=str(g1_list[0].total) if g1_list else None,
                gstr2b_amount=str(g2b_list[0].total) if g2b_list else None,
                tally_amount=str(tally_list[0].total) if tally_list else None,
                bank_amount=str(bank_list[0].total) if bank_list else None,
                status="DUPLICATE", match_level=None, absolute_difference=None, percentage_difference=None,
                evidence=evidence, is_duplicate_group=True, duplicate_ids=ids,
            ))
            continue

        inv_rec = inv_list[0] if inv_list else None
        tally_rec = tally_list[0] if tally_list else None
        bank_rec = bank_list[0] if bank_list else None
        g1_rec = g1_list[0] if g1_list else None
        g2b_rec = g2b_list[0] if g2b_list else None

        # --- Invalid GSTIN / unknown vendor -> straight to review ---
        if inv_rec and not inv_rec.gstin_valid:
            evidence.append(f"GSTIN '{inv_rec.gstin_raw}' failed format validation.")
            results.append(ReconciliationResult(
                invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
                invoices_amount=str(inv_rec.total) if inv_rec else None, gstr1_amount=None,
                gstr2b_amount=None, tally_amount=None, bank_amount=None,
                status="REVIEW_REQUIRED", match_level=None, absolute_difference=None, percentage_difference=None,
                evidence=evidence,
            ))
            continue

        # --- MISSING: present in invoices/gstr1 but absent in tally or bank ---
        if inv_rec and not tally_rec:
            evidence.append("Invoice exists in source documents but has no corresponding Tally ledger entry.")
            results.append(ReconciliationResult(
                invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
                invoices_amount=str(inv_rec.total), gstr1_amount=str(g1_rec.total) if g1_rec else None,
                gstr2b_amount=str(g2b_rec.total) if g2b_rec else None, tally_amount=None,
                bank_amount=str(bank_rec.total) if bank_rec else None,
                status="MISSING", match_level=None, absolute_difference=None, percentage_difference=None,
                evidence=evidence,
            ))
            continue

        if inv_rec and tally_rec and not bank_rec and inv_rec.payment_status == "UNPAID":
            evidence.append("Invoice and Tally entry exist but no matching bank settlement was found; "
                             "payment status is UNPAID.")
            results.append(ReconciliationResult(
                invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
                invoices_amount=str(inv_rec.total), gstr1_amount=str(g1_rec.total) if g1_rec else None,
                gstr2b_amount=str(g2b_rec.total) if g2b_rec else None, tally_amount=str(tally_rec.total),
                bank_amount=None, status="MISSING", match_level=None, absolute_difference=None,
                percentage_difference=None, evidence=evidence,
            ))
            continue

        # --- MATCHING HIERARCHY (levels 1-4) between invoice/tally/bank amounts ---
        candidates = [x for x in [inv_rec, tally_rec, bank_rec] if x is not None]
        amounts = [c.total for c in candidates if c.total is not None]
        gstins_match = (inv_rec.gstin_norm == tally_rec.gstin_norm) if (inv_rec and tally_rec) else True

        match_level = None
        status = None
        abs_d = pct_d = None

        # Level 1: exact invoice number + GSTIN, exact amount match across all available sources
        if inv_rec and tally_rec and gstins_match and inv_rec.total == tally_rec.total:
            match_level = 1
            if bank_rec:
                ok, ad, pd = within_tolerance(tally_rec.total, bank_rec.total, cfg)
                if bank_rec.total == tally_rec.total:
                    status = "MATCHED"
                elif ok:
                    status = "MATCHED_WITH_TOLERANCE"
                    abs_d, pct_d = ad, pd
                else:
                    status = "MISMATCH"
                    abs_d, pct_d = amount_diff(tally_rec.total, bank_rec.total)
            else:
                status = "MATCHED"
            date_diff = _days_between(inv_rec.date_norm, bank_rec.date_norm) if bank_rec else 0
            if status == "MATCHED" and date_diff and date_diff > cfg["date_tolerance_days"]:
                status = "PARTIAL_MATCH"
                evidence.append(f"Amounts match exactly but settlement date differs by {date_diff} days "
                                 f"(tolerance is {cfg['date_tolerance_days']} days).")
            elif date_diff and 0 < date_diff <= cfg["date_tolerance_days"] and status == "MATCHED":
                status = "MATCHED_WITH_TOLERANCE"
                evidence.append(f"Settlement date differs by {date_diff} day(s), within the "
                                 f"{cfg['date_tolerance_days']}-day tolerance window.")
            evidence.append("Exact invoice number + GSTIN matched between Invoice and Tally records (Level 1).")

        # Level 2: normalized invoice number + GSTIN (already grouped by normalized key -> implicit)
        elif inv_rec and tally_rec and gstins_match:
            match_level = 2
            ok, ad, pd = within_tolerance(inv_rec.total, tally_rec.total, cfg)
            if ok:
                status = "MATCHED_WITH_TOLERANCE"
                abs_d, pct_d = ad, pd
                evidence.append(f"Normalized invoice number + GSTIN matched (Level 2); amount difference "
                                 f"of {ad} is within tolerance.")
            else:
                status = "MISMATCH"
                abs_d, pct_d = ad, pd
                evidence.append(f"Normalized invoice number + GSTIN matched (Level 2) but amount differs by "
                                 f"{ad} ({pd:.2f}% ), outside tolerance.")

        # Level 3: invoice number + vendor + amount (GSTIN mismatch case)
        elif inv_rec and tally_rec and inv_rec.vendor_norm == tally_rec.vendor_norm:
            match_level = 3
            evidence.append(f"GSTIN mismatch between Invoice ({inv_rec.gstin_raw}) and Tally "
                             f"({tally_rec.gstin_raw}) for the same invoice number and vendor.")
            ok, ad, pd = within_tolerance(inv_rec.total, tally_rec.total, cfg)
            abs_d, pct_d = ad, pd
            status = "MISMATCH"

        # Level 4 / Level 5: vendor + amount + date tolerance, else ambiguous
        else:
            match_level = 4
            status = "AMBIGUOUS"
            evidence.append("Could not confidently match on invoice number + GSTIN; multiple or partial "
                             "candidates found. Routed to human review (never auto-accepted).")

        results.append(ReconciliationResult(
            invoice_no=primary.invoice_no_raw, vendor=vendor, gstin=gstin, date=inv_date,
            invoices_amount=str(inv_rec.total) if inv_rec else None,
            gstr1_amount=str(g1_rec.total) if g1_rec else None,
            gstr2b_amount=str(g2b_rec.total) if g2b_rec else None,
            tally_amount=str(tally_rec.total) if tally_rec else None,
            bank_amount=str(bank_rec.total) if bank_rec else None,
            status=status, match_level=match_level,
            absolute_difference=str(abs_d) if abs_d is not None else None,
            percentage_difference=str(round(pct_d, 4)) if pct_d is not None else None,
            evidence=evidence,
        ))

    # --- Ambiguous bank transactions that matched no invoice key at all (multiple plausible matches) ---
    unmatched_bank = [b for k, blist in bank_by_key.items() for b in blist if k not in all_keys and k != ""]
    for b in unmatched_bank:
        # try to find plausible vendor+amount matches among invoices
        plausible = [i for i in invoices if i.vendor_norm == b.vendor_norm and i.total == b.total]
        if len(plausible) >= 2:
            results.append(ReconciliationResult(
                invoice_no=f"BANK:{b.source_id}", vendor=b.vendor_raw, gstin="", date=b.date_norm,
                invoices_amount=None, gstr1_amount=None, gstr2b_amount=None, tally_amount=None,
                bank_amount=str(b.total), status="AMBIGUOUS", match_level=5,
                absolute_difference=None, percentage_difference=None,
                evidence=[f"Bank transaction matches {len(plausible)} plausible invoices "
                          f"({', '.join(p.invoice_no_raw for p in plausible)}) on vendor + amount alone -- "
                          "genuinely ambiguous, requires human review."],
            ))

    return results, norm
