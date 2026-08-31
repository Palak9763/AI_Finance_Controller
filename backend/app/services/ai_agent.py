"""
AI Investigation Agent.

Graph shape (implemented as a plain Python state machine -- same node names
LangGraph would use, so swapping in a real LangGraph runtime later is a
drop-in change, not a rewrite):

  Understand Exception -> Collect Related Records -> Search Finance Knowledge (RAG)
  -> Analyze Evidence -> Identify Root Cause -> Generate Recommendation
  -> Confidence Check -> (Human Review if low-confidence/high-risk) -> END

SECURITY: every tool below is read-only against financial data except
`create_review`, which only ever creates a PENDING review for a human. The
agent can never write to invoices/gstr*/tally/bank tables and can never
self-approve.

Demo mode (no OPENAI_API_KEY): rule-based "Demo AI Provider" produces the
exact same structured JSON shape from heuristics. The UI must always label
which provider produced an investigation.
"""
import os
import json
import re
from decimal import Decimal
from .rag import get_kb

PROVIDER_DEMO = "Demo AI Provider"
PROVIDER_OPENAI = "OpenAI Agent"


# ---------------------------------------------------------------------------
# READ-ONLY TOOLS (agent may only call these; create_review is the sole
# write path and it can only create PENDING reviews)
# ---------------------------------------------------------------------------
class AgentTools:
    def __init__(self, db, models):
        self.db = db
        self.m = models

    def get_gstr_record(self, invoice_no):
        g1 = self.db.query(self.m.Gstr1Record).filter(self.m.Gstr1Record.invoice_no.contains(invoice_no)).first()
        g2b = self.db.query(self.m.Gstr2bRecord).filter(self.m.Gstr2bRecord.invoice_no.contains(invoice_no)).first()
        return {"gstr1": _row_to_dict(g1), "gstr2b": _row_to_dict(g2b)}

    def get_tally_record(self, invoice_no):
        rows = self.db.query(self.m.TallyRecord).filter(self.m.TallyRecord.invoice_no.contains(invoice_no)).all()
        return [_row_to_dict(r) for r in rows]

    def get_bank_transaction(self, invoice_no):
        rows = self.db.query(self.m.BankTransaction).filter(
            (self.m.BankTransaction.reference_no.contains(invoice_no)) |
            (self.m.BankTransaction.narration.contains(invoice_no))
        ).all()
        return [_row_to_dict(r) for r in rows]

    def get_invoice(self, invoice_no):
        rows = self.db.query(self.m.Invoice).filter(self.m.Invoice.invoice_no.contains(invoice_no)).all()
        return [_row_to_dict(r) for r in rows]

    def find_related_transactions(self, vendor):
        rows = self.db.query(self.m.BankTransaction).filter(self.m.BankTransaction.party.contains(vendor)).limit(10).all()
        return [_row_to_dict(r) for r in rows]

    def run_reconciliation(self):
        return {"note": "Re-run available via POST /api/reconciliation/run; agent does not trigger writes itself."}

    def get_anomaly_details(self, invoice_no):
        row = self.db.query(self.m.Anomaly).filter(self.m.Anomaly.invoice_no == invoice_no).first()
        return _row_to_dict(row)

    def search_finance_knowledge(self, query, top_k=2):
        return get_kb().search(query, top_k=top_k)

    def create_review(self, exception_id, investigation_id):
        """The ONLY write path available to the agent. Always creates a PENDING review."""
        review = self.m.Review(exception_id=exception_id, investigation_id=investigation_id, status="PENDING")
        self.db.add(review)
        self.db.commit()
        self.db.refresh(review)
        return review


def _row_to_dict(row):
    if row is None:
        return None
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


# ---------------------------------------------------------------------------
# STATE MACHINE
# ---------------------------------------------------------------------------
def investigate(exception_row, result_row, tools: AgentTools, provider: str = None):
    """
    Runs the full node graph and returns (structured_output_dict, stages_log, provider_used).
    """
    use_openai = bool(os.environ.get("OPENAI_API_KEY")) if provider is None else (provider == PROVIDER_OPENAI)
    provider_used = PROVIDER_OPENAI if use_openai else PROVIDER_DEMO

    stages = []

    def log_stage(name, detail):
        stages.append({"stage": name, "detail": detail})

    # --- Understand Exception ---
    log_stage("Understand Exception",
               f"Case {result_row.invoice_no}: status={result_row.status}, vendor={result_row.vendor}, "
               f"amounts(invoice={result_row.invoices_amount}, tally={result_row.tally_amount}, "
               f"bank={result_row.bank_amount})")

    # --- Collect Related Records ---
    gstr = tools.get_gstr_record(result_row.invoice_no)
    tally = tools.get_tally_record(result_row.invoice_no)
    bank = tools.get_bank_transaction(result_row.invoice_no)
    invoice = tools.get_invoice(result_row.invoice_no)
    log_stage("Collect Related Records",
               f"Retrieved {1 if gstr.get('gstr1') else 0} GSTR-1, {1 if gstr.get('gstr2b') else 0} GSTR-2B, "
               f"{len(tally)} Tally, {len(bank)} Bank, {len(invoice)} Invoice record(s).")

    # --- Search Finance Knowledge (RAG) ---
    query_text = _build_kb_query(result_row)
    kb_hits = tools.search_finance_knowledge(query_text, top_k=2)
    log_stage("Search Finance Knowledge (RAG)",
               f"Query: '{query_text}'. Retrieved {len(kb_hits)} policy doc(s): "
               f"{', '.join(h['title'] for h in kb_hits) if kb_hits else 'none'}")

    # --- Analyze Evidence ---
    evidence = _build_evidence(result_row, gstr, tally, bank, invoice)
    log_stage("Analyze Evidence", f"Compiled {len(evidence)} evidence item(s).")

    if use_openai:
        structured = _openai_investigate(result_row, evidence, kb_hits)
    else:
        structured = _demo_investigate(result_row, evidence, kb_hits)

    log_stage("Identify Root Cause", structured["root_cause"])
    log_stage("Generate Recommendation", structured["recommendation"])
    log_stage("Confidence Check",
               f"confidence={structured['confidence']}, risk={structured['risk_level']}, "
               f"requires_human_review={structured['requires_human_review']}")

    if structured["requires_human_review"]:
        log_stage("Human Review", "Routed to human review queue (PENDING).")
    else:
        log_stage("Human Review", "Low risk / high confidence -- still requires human sign-off per policy "
                                   "(AI can never self-approve).")

    return structured, stages, provider_used


def _build_kb_query(result_row):
    parts = [result_row.status.replace("_", " ").lower()]
    if result_row.evidence:
        parts.append(" ".join(result_row.evidence)[:200])
    return " ".join(parts)


def _build_evidence(result_row, gstr, tally, bank, invoice):
    ev = []
    if invoice:
        ev.append({"source": "invoice", "field": "total", "value": invoice[0].get("total"), "type": "FOUND_EVIDENCE"})
    if gstr.get("gstr1"):
        ev.append({"source": "gstr1", "field": "total", "value": gstr["gstr1"].get("total"), "type": "FOUND_EVIDENCE"})
    if gstr.get("gstr2b"):
        ev.append({"source": "gstr2b", "field": "itc_eligible", "value": gstr["gstr2b"].get("itc_eligible"),
                   "type": "FOUND_EVIDENCE"})
    if tally:
        ev.append({"source": "tally", "field": "amount", "value": tally[0].get("amount"), "type": "FOUND_EVIDENCE"})
    if bank:
        ev.append({"source": "bank", "field": "amount", "value": bank[0].get("amount"), "type": "FOUND_EVIDENCE"})
        ev.append({"source": "bank", "field": "narration", "value": bank[0].get("narration"), "type": "FOUND_EVIDENCE"})
    if result_row.absolute_difference:
        ev.append({"source": "reconciliation_engine", "field": "absolute_difference",
                   "value": result_row.absolute_difference, "type": "FOUND_EVIDENCE"})
    if not bank and not tally:
        ev.append({"source": "system", "field": "coverage", "value": "no bank or tally record found",
                   "type": "UNKNOWN"})
    return ev


def _demo_investigate(result_row, evidence, kb_hits):
    """Rule-based heuristics: narration keyword match -> policy lookup -> templated explanation."""
    status = result_row.status
    narration = ""
    for e in evidence:
        if e["source"] == "bank" and e["field"] == "narration" and e["value"]:
            narration = str(e["value"]).upper()

    def kb_titles():
        return [h["title"] for h in kb_hits]

    if status == "MATCHED_WITH_TOLERANCE" and ("CHARGE" in narration or "FEE" in narration):
        root_cause = ("Small settlement shortfall explained by a standard bank service charge deducted "
                       "at the time of transfer, per bank narration.")
        recommendation = "Accept as reconciled. No vendor follow-up required."
        confidence, risk, needs_review = 0.93, "LOW", False
        evidence.append({"source": "policy", "field": "bank_fee_deduction_policy", "value": "matched",
                          "type": "INFERENCE"})

    elif status == "MATCHED_WITH_TOLERANCE":
        root_cause = "Amount or settlement date falls within the configured tolerance band; treated as a normal timing/processing variance."
        recommendation = "Accept as reconciled under standard tolerance policy."
        confidence, risk, needs_review = 0.88, "LOW", False

    elif status == "MISMATCH":
        abs_diff = result_row.absolute_difference
        if abs_diff and float(abs_diff) > 0:
            root_cause = (f"Amount discrepancy of {abs_diff} between records exceeds the configured tolerance "
                          "and does not match any known bank-fee or rounding pattern in the narration.")
            recommendation = "Escalate to vendor for a corrected invoice or credit note; do not clear until resolved."
            confidence, risk, needs_review = 0.65, "HIGH", True
        else:
            root_cause = "GSTIN mismatch detected between source systems for the same invoice number and vendor."
            recommendation = "Verify correct GSTIN with vendor master data and correct the erroneous source record."
            confidence, risk, needs_review = 0.7, "MEDIUM", True

    elif status == "MISSING":
        if any("UNPAID" in str(e.get("value", "")) for e in evidence):
            root_cause = "Invoice and ledger entry exist, but no bank settlement was found; payment status indicates it has not yet been paid."
            recommendation = "No action needed if within normal payment terms; flag for payment desk if overdue."
            confidence, risk, needs_review = 0.8, "LOW", True
        else:
            root_cause = "Invoice exists in GST filings but has no corresponding Tally ledger voucher."
            recommendation = "Check whether the invoice was booked under a different voucher type or accounting period; book if missing."
            confidence, risk, needs_review = 0.6, "MEDIUM", True

    elif status == "DUPLICATE":
        root_cause = "The same normalized invoice number appears more than once in the source records for this vendor."
        recommendation = "Confirm with the originating department whether this is a genuine re-upload or a double booking; reverse the duplicate voucher if so."
        confidence, risk, needs_review = 0.75, "MEDIUM", True

    elif status == "PARTIAL_MATCH":
        if any(e["field"] == "itc_eligible" and e["value"] == "NO" for e in evidence):
            root_cause = "The commercial transaction reconciles cleanly, but GSTR-2B marks the input tax credit as not eligible."
            recommendation = "Do not claim ITC for this invoice in the current filing period; correct the ITC ledger entry."
            confidence, risk, needs_review = 0.82, "MEDIUM", True
        else:
            root_cause = "Settlement date differs from the invoice date by more than the configured tolerance window."
            recommendation = "Confirm the payment was for this specific invoice given the delay; no amount issue found."
            confidence, risk, needs_review = 0.7, "MEDIUM", True

    elif status in ("AMBIGUOUS",):
        root_cause = "Insufficient evidence"
        recommendation = "Manually confirm which invoice the bank settlement applies to using vendor communication or payment advice; do not guess."
        confidence, risk, needs_review = 0.35, "HIGH", True
        evidence.append({"source": "system", "field": "match_candidates", "value": "multiple plausible matches",
                          "type": "UNKNOWN"})

    else:  # REVIEW_REQUIRED
        root_cause = "Record failed basic validation (invalid GSTIN format or unrecognized vendor) and cannot be reconciled with confidence."
        recommendation = "Route to vendor master data team to validate/register GSTIN before further processing."
        confidence, risk, needs_review = 0.4, "HIGH", True

    return dict(
        case_id=result_row.invoice_no,
        summary=f"{status.replace('_', ' ').title()} case for {result_row.vendor} ({result_row.invoice_no}).",
        root_cause=root_cause,
        evidence=evidence,
        recommendation=recommendation,
        confidence=confidence,
        risk_level=risk,
        requires_human_review=needs_review,
        retrieved_docs=kb_titles(),
    )


def _openai_investigate(result_row, evidence, kb_hits):
    """
    Real-mode path -- calls OpenAI's API and requires the response to conform
    to the same structured JSON contract as the demo provider. Falls back to
    the demo provider if the call fails or the network/key is unavailable,
    so the demo never breaks.
    """
    try:
        import requests
        api_key = os.environ["OPENAI_API_KEY"]
        prompt = (
            "You are a finance reconciliation investigator. Given this exception and evidence, "
            "return ONLY a JSON object with keys: case_id, summary, root_cause, evidence (list of "
            "{source, field, value, type in [FOUND_EVIDENCE, INFERENCE, UNKNOWN]}), recommendation, "
            "confidence (0-1), risk_level (LOW/MEDIUM/HIGH), requires_human_review (bool). "
            "If evidence is insufficient, root_cause must be exactly 'Insufficient evidence' and "
            "requires_human_review must be true. Never guess.\n\n"
            f"Case: {result_row.invoice_no}\nStatus: {result_row.status}\nVendor: {result_row.vendor}\n"
            f"Evidence: {json.dumps(evidence, default=str)}\n"
            f"Retrieved policy docs: {json.dumps(kb_hits, default=str)}\n"
        )
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": prompt}],
                  "response_format": {"type": "json_object"}},
            timeout=20,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        parsed.setdefault("retrieved_docs", [h["title"] for h in kb_hits])
        return parsed
    except Exception:
        # Bulletproof fallback -- never break the demo.
        fallback = _demo_investigate(result_row, evidence, kb_hits)
        fallback["summary"] += " (OpenAI call unavailable -- fell back to Demo AI Provider heuristics.)"
        return fallback
