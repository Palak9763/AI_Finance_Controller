import os
import time
from dotenv import load_dotenv
load_dotenv()  # loads backend/.env into os.environ before anything else
import logging
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import models, schemas
from .database import engine, get_db, Base
from .services import ingestion, reconciliation as recon_svc, evaluation as eval_svc
from .services import anomaly as anomaly_svc, ai_agent, audit as audit_svc
from .services.knowledge_seed import DOCS as KB_DOCS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("finance-controller")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Finance Controller", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def no_stack_traces(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error. Please try again."})

def seed_knowledge_base(db: Session):
    if db.query(models.KnowledgeDocument).count() == 0:
        for d in KB_DOCS:
            doc = models.KnowledgeDocument(title=d["title"], category=d["category"], content=d["content"])
            db.add(doc)
            db.flush()
            db.add(models.KnowledgeChunk(document_id=doc.id, chunk_text=d["content"], chunk_index=0))
        db.commit()

@app.on_event("startup")
def on_startup():
    db = next(get_db())
    try:
        seed_knowledge_base(db)
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/config")
def config():
    """Tells the frontend which AI provider is active, without leaking the key."""
    has_key = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    return {
        "ai_provider": "OpenAI Agent" if has_key else "Demo AI Provider",
        "ai_provider_active": has_key,
        "model": "gpt-4o-mini" if has_key else None,
    }

def _severity_for(status, abs_diff):
    if status in ("DUPLICATE", "MISMATCH"):
        try:
            if abs_diff and float(abs_diff) > 5000:
                return "HIGH"
        except (TypeError, ValueError):
            pass
        return "MEDIUM" if status == "MISMATCH" else "MEDIUM"
    if status in ("AMBIGUOUS", "REVIEW_REQUIRED"):
        return "HIGH"
    if status in ("MISSING", "PARTIAL_MATCH"):
        return "MEDIUM"
    return "LOW"

EXCEPTION_STATUSES = {"PARTIAL_MATCH", "MISMATCH", "MISSING", "DUPLICATE", "AMBIGUOUS", "REVIEW_REQUIRED"}

from decimal import Decimal, InvalidOperation

def _safe_dec(v):
    try: return Decimal(str(v or 0))
    except InvalidOperation: return Decimal(0)


def _run_reconciliation_core(db: Session) -> dict:
    """Core reconciliation logic shared by the API endpoint and the startup auto-run."""
    counts = ingestion.ingest_all(db)
    seed_knowledge_base(db)

    invoices = ingestion.rows_as_dicts(db, models.Invoice)
    gstr1    = ingestion.rows_as_dicts(db, models.Gstr1Record)
    gstr2b_raw = ingestion.rows_as_dicts(db, models.Gstr2bRecord)
    tally    = ingestion.rows_as_dicts(db, models.TallyRecord)
    bank     = ingestion.rows_as_dicts(db, models.BankTransaction)
    ground_truth = ingestion.load_ground_truth()

    # GSTR-2B stores taxable_value + cgst + sgst + igst separately.
    # Tally stores a single gross (tax-inclusive) amount.
    # Pre-compute gross total on each GSTR-2B record so both sides compare on the same basis.
    gstr2b = []
    for r in gstr2b_raw:
        gross = (_safe_dec(r.get("taxable_value")) + _safe_dec(r.get("cgst"))
                 + _safe_dec(r.get("sgst")) + _safe_dec(r.get("igst")))
        gstr2b.append({**r, "total": str(gross)})

    t0 = time.time()
    results, norm = recon_svc.reconcile(invoices, gstr1, gstr2b, tally, bank)
    processing_time_ms = (time.time() - t0) * 1000

    evaluation = eval_svc.compute_evaluation(results, ground_truth, processing_time_ms)

    # Wipe previous run data and persist fresh results
    db.query(models.Exception_).delete()
    db.query(models.ReconciliationMatch).delete()
    db.query(models.ReconciliationResultRow).delete()
    db.query(models.Anomaly).delete()
    db.query(models.Investigation).delete()
    db.query(models.Review).delete()
    db.commit()

    run = models.ReconciliationRun(
        processing_time_ms=processing_time_ms, evaluation_json=evaluation,
        normalization_warning_count=len(norm.warnings),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    row_objs = []
    for r in results:
        row = models.ReconciliationResultRow(
            run_id=run.id, invoice_no=r.invoice_no, vendor=r.vendor, gstin=r.gstin, date=r.date,
            invoices_amount=r.invoices_amount, gstr1_amount=r.gstr1_amount, gstr2b_amount=r.gstr2b_amount,
            tally_amount=r.tally_amount, bank_amount=r.bank_amount, status=r.status,
            match_level=r.match_level, absolute_difference=r.absolute_difference,
            percentage_difference=r.percentage_difference, evidence=r.evidence,
        )
        db.add(row)
        row_objs.append((row, r))
    db.commit()

    exception_count = 0
    for row, r in row_objs:
        db.refresh(row)
        if r.status in EXCEPTION_STATUSES:
            exc = models.Exception_(
                result_id=row.id, invoice_no=r.invoice_no, vendor=r.vendor, status=r.status,
                severity=_severity_for(r.status, r.absolute_difference),
            )
            db.add(exc)
            exception_count += 1
    db.commit()

    anomalies = anomaly_svc.detect_anomalies([r for _, r in row_objs])
    for a in anomalies:
        db.add(models.Anomaly(
            invoice_no=a["invoice_no"], vendor=a["vendor"], amount=a["amount"],
            expected_range_low=a["expected_range_low"], expected_range_high=a["expected_range_high"],
            anomaly_score=a["anomaly_score"], reason=a["reason"], risk_level=a["risk_level"],
            reconciliation_status=a["reconciliation_status"],
        ))
    db.commit()
    audit_svc.write_audit(
        db, actor="system", action="RECONCILIATION_RUN_COMPLETED", entity_type="reconciliation_run",
        entity_id=run.id, new_status="COMPLETED",
        metadata={"total_records": evaluation["total_records"], "exception_count": exception_count,
                  "ingested": counts},
    )

    return {"run_id": run.id, "evaluation": evaluation, "exception_count": exception_count,
            "anomaly_count": len(anomalies), "ingested": counts}


@app.post("/api/reconciliation/run")
def run_reconciliation(db: Session = Depends(get_db)):
    return _run_reconciliation_core(db)

def _latest_run(db):
    return db.query(models.ReconciliationRun).order_by(models.ReconciliationRun.id.desc()).first()

@app.get("/api/reconciliation/results")
def get_results(status: str = None, vendor: str = None, search: str = None,
                 skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    run = _latest_run(db)
    if not run:
        return {"results": [], "total": 0}
    q = db.query(models.ReconciliationResultRow).filter(models.ReconciliationResultRow.run_id == run.id)
    if status:
        q = q.filter(models.ReconciliationResultRow.status == status)
    if vendor:
        q = q.filter(models.ReconciliationResultRow.vendor.contains(vendor))
    if search:
        q = q.filter(models.ReconciliationResultRow.invoice_no.contains(search))
    total = q.count()
    rows = q.order_by(models.ReconciliationResultRow.id).offset(skip).limit(limit).all()
    return {"results": [_result_to_dict(r) for r in rows], "total": total}

def _result_to_dict(r):
    return dict(
        id=r.id, invoice_no=r.invoice_no, vendor=r.vendor, gstin=r.gstin, date=r.date,
        invoices_amount=r.invoices_amount, gstr1_amount=r.gstr1_amount, gstr2b_amount=r.gstr2b_amount,
        tally_amount=r.tally_amount, bank_amount=r.bank_amount, status=r.status, match_level=r.match_level,
        absolute_difference=r.absolute_difference, percentage_difference=r.percentage_difference,
        evidence=r.evidence, ai_insight=r.ai_insight,
    )

@app.get("/api/reconciliation/results/{result_id}")
def get_result(result_id: int, db: Session = Depends(get_db)):
    r = db.query(models.ReconciliationResultRow).filter(models.ReconciliationResultRow.id == result_id).first()
    if not r:
        raise HTTPException(404, "Result not found")
    return _result_to_dict(r)

@app.get("/api/reconciliation/summary")
def reconciliation_summary(db: Session = Depends(get_db)):
    run = _latest_run(db)
    if not run:
        return {"has_run": False}
    return {"has_run": True, "run_id": run.id, "run_at": run.run_at, **run.evaluation_json}

@app.get("/api/evaluation")
def get_evaluation(db: Session = Depends(get_db)):
    run = _latest_run(db)
    if not run:
        return {"has_run": False}
    return {"has_run": True, "run_id": run.id, "run_at": run.run_at, **run.evaluation_json}

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    run = _latest_run(db)
    if not run:
        return {"has_run": False}
    ev = run.evaluation_json
    exception_count = db.query(models.Exception_).count()
    anomaly_count = db.query(models.Anomaly).count()
    pending_reviews = db.query(models.Review).filter(models.Review.status == "PENDING").count()
    approved = db.query(models.Review).filter(models.Review.status == "APPROVED").count()
    rejected = db.query(models.Review).filter(models.Review.status == "REJECTED").count()
    investigations_done = db.query(models.Investigation).count()
    return {
        "has_run": True, "run_id": run.id, "run_at": run.run_at,
        "evaluation": ev, "exception_count": exception_count, "anomaly_count": anomaly_count,
        "pending_reviews": pending_reviews, "approved_reviews": approved, "rejected_reviews": rejected,
        "investigations_done": investigations_done,
    }

@app.get("/api/exceptions")
def list_exceptions(status: str = None, severity: str = None, db: Session = Depends(get_db)):
    q = db.query(models.Exception_)
    if status:
        q = q.filter(models.Exception_.status == status)
    if severity:
        q = q.filter(models.Exception_.severity == severity)
    rows = q.order_by(models.Exception_.id).all()
    return {"exceptions": [
        dict(id=e.id, result_id=e.result_id, invoice_no=e.invoice_no, vendor=e.vendor, status=e.status,
             severity=e.severity, created_at=e.created_at, investigation_status=e.investigation_status)
        for e in rows
    ], "total": q.count()}

@app.get("/api/exceptions/{exception_id}")
def get_exception(exception_id: int, db: Session = Depends(get_db)):
    e = db.query(models.Exception_).filter(models.Exception_.id == exception_id).first()
    if not e:
        raise HTTPException(404, "Exception not found")
    result = db.query(models.ReconciliationResultRow).filter(models.ReconciliationResultRow.id == e.result_id).first()
    investigation = db.query(models.Investigation).filter(models.Investigation.exception_id == e.id).order_by(
        models.Investigation.id.desc()).first()
    review = db.query(models.Review).filter(models.Review.exception_id == e.id).order_by(models.Review.id.desc()).first()
    return dict(
        id=e.id, invoice_no=e.invoice_no, vendor=e.vendor, status=e.status, severity=e.severity,
        investigation_status=e.investigation_status,
        result=_result_to_dict(result) if result else None,
        investigation=_investigation_to_dict(investigation) if investigation else None,
        review=_review_to_dict(review) if review else None,
    )

def _investigation_to_dict(i):
    if not i:
        return None
    return dict(id=i.id, exception_id=i.exception_id, case_id=i.case_id, provider=i.provider, status=i.status,
                stages=i.stages_json, summary=i.summary, root_cause=i.root_cause, evidence=i.evidence_json,
                recommendation=i.recommendation, confidence=i.confidence, risk_level=i.risk_level,
                requires_human_review=i.requires_human_review, retrieved_docs=i.retrieved_docs_json,
                created_at=i.created_at)

def _review_to_dict(rv):
    if not rv:
        return None
    return dict(id=rv.id, exception_id=rv.exception_id, investigation_id=rv.investigation_id, status=rv.status,
                created_at=rv.created_at, decided_at=rv.decided_at, reason=rv.reason)

@app.post("/api/exceptions/{exception_id}/investigate")
def investigate_exception(exception_id: int, req: schemas.InvestigateRequest = schemas.InvestigateRequest(),
                           db: Session = Depends(get_db)):
    e = db.query(models.Exception_).filter(models.Exception_.id == exception_id).first()
    if not e:
        raise HTTPException(404, "Exception not found")
    result = db.query(models.ReconciliationResultRow).filter(models.ReconciliationResultRow.id == e.result_id).first()
    if not result:
        raise HTTPException(404, "Underlying reconciliation result not found")

    tools = ai_agent.AgentTools(db, models)
    structured, stages, provider_used = ai_agent.investigate(e, result, tools, provider=req.provider)

    inv = models.Investigation(
        exception_id=e.id, case_id=structured["case_id"], provider=provider_used, status="COMPLETE",
        stages_json=stages, summary=structured["summary"], root_cause=structured["root_cause"],
        evidence_json=structured["evidence"], recommendation=structured["recommendation"],
        confidence=structured["confidence"], risk_level=structured["risk_level"],
        requires_human_review=structured["requires_human_review"],
        retrieved_docs_json=structured.get("retrieved_docs", []),
    )
    db.add(inv)
    e.investigation_status = "DONE"
    db.commit()
    db.refresh(inv)

    review = tools.create_review(exception_id=e.id, investigation_id=inv.id)

    result.ai_insight = structured["root_cause"]
    db.commit()
    audit_svc.write_audit(
        db, actor="ai_agent", action="AI_INVESTIGATION_COMPLETED", entity_type="exception", entity_id=e.id,
        ai_recommendation=structured["recommendation"],
        metadata={"provider": provider_used, "confidence": structured["confidence"],
                  "risk_level": structured["risk_level"]},
    )

    return {"investigation": _investigation_to_dict(inv), "review": _review_to_dict(review)}

@app.get("/api/investigations/{investigation_id}")
def get_investigation(investigation_id: int, db: Session = Depends(get_db)):
    inv = db.query(models.Investigation).filter(models.Investigation.id == investigation_id).first()
    if not inv:
        raise HTTPException(404, "Investigation not found")
    return _investigation_to_dict(inv)

@app.get("/api/anomalies")
def list_anomalies(risk_level: str = None, db: Session = Depends(get_db)):
    q = db.query(models.Anomaly)
    if risk_level:
        q = q.filter(models.Anomaly.risk_level == risk_level)
    rows = q.order_by(models.Anomaly.anomaly_score.desc()).all()
    return {"anomalies": [
        dict(id=a.id, invoice_no=a.invoice_no, vendor=a.vendor, amount=a.amount,
             expected_range_low=a.expected_range_low, expected_range_high=a.expected_range_high,
             anomaly_score=a.anomaly_score, reason=a.reason, risk_level=a.risk_level,
             reconciliation_status=a.reconciliation_status)
        for a in rows
    ], "total": q.count()}

@app.get("/api/reviews")
def list_reviews(status: str = None, db: Session = Depends(get_db)):
    q = db.query(models.Review)
    if status:
        q = q.filter(models.Review.status == status)
    rows = q.order_by(models.Review.id.desc()).all()
    out = []
    for rv in rows:
        e = db.query(models.Exception_).filter(models.Exception_.id == rv.exception_id).first()
        inv = db.query(models.Investigation).filter(models.Investigation.id == rv.investigation_id).first()
        out.append(dict(
            **_review_to_dict(rv),
            invoice_no=e.invoice_no if e else None, vendor=e.vendor if e else None,
            status_reconciliation=e.status if e else None,
            recommendation=inv.recommendation if inv else None,
            confidence=inv.confidence if inv else None, risk_level=inv.risk_level if inv else None,
            provider=inv.provider if inv else None,
        ))
    return {"reviews": out, "total": q.count()}

def _decide_review(review_id, new_status, req: schemas.ReviewAction, db: Session):
    rv = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not rv:
        raise HTTPException(404, "Review not found")
    from datetime import datetime, timezone
    prev_status = rv.status
    rv.status = new_status
    rv.decided_at = datetime.now(timezone.utc)
    rv.reason = req.reason
    db.commit()
    db.refresh(rv)

    e = db.query(models.Exception_).filter(models.Exception_.id == rv.exception_id).first()
    inv = db.query(models.Investigation).filter(models.Investigation.id == rv.investigation_id).first()

    audit_svc.write_audit(
        db, actor=req.actor, action=f"HUMAN_{new_status}", entity_type="review", entity_id=rv.id,
        previous_status=prev_status, new_status=new_status,
        ai_recommendation=inv.recommendation if inv else None, human_decision=new_status,
        reason=req.reason, metadata={"exception_id": e.id if e else None, "invoice_no": e.invoice_no if e else None},
    )
    return _review_to_dict(rv)

@app.post("/api/reviews/{review_id}/approve")
def approve_review(review_id: int, req: schemas.ReviewAction = schemas.ReviewAction(), db: Session = Depends(get_db)):
    return _decide_review(review_id, "APPROVED", req, db)

@app.post("/api/reviews/{review_id}/reject")
def reject_review(review_id: int, req: schemas.ReviewAction = schemas.ReviewAction(), db: Session = Depends(get_db)):
    return _decide_review(review_id, "REJECTED", req, db)

@app.post("/api/reviews/{review_id}/pending")
def pending_review(review_id: int, req: schemas.ReviewAction = schemas.ReviewAction(), db: Session = Depends(get_db)):
    rv = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not rv:
        raise HTTPException(404, "Review not found")
    prev_status = rv.status
    rv.status = "PENDING"
    rv.reason = req.reason
    db.commit()
    audit_svc.write_audit(db, actor=req.actor, action="HUMAN_MARKED_PENDING", entity_type="review",
                           entity_id=rv.id, previous_status=prev_status, new_status="PENDING", reason=req.reason)
    return _review_to_dict(rv)

@app.get("/api/audit-logs")
def list_audit_logs(entity_type: str = None, limit: int = 200, db: Session = Depends(get_db)):
    q = db.query(models.AuditLog)
    if entity_type:
        q = q.filter(models.AuditLog.entity_type == entity_type)
    rows = q.order_by(models.AuditLog.id.desc()).limit(limit).all()
    return {"audit_logs": [
        dict(id=a.id, timestamp=a.timestamp, actor=a.actor, action=a.action, entity_type=a.entity_type,
             entity_id=a.entity_id, previous_status=a.previous_status, new_status=a.new_status,
             ai_recommendation=a.ai_recommendation, human_decision=a.human_decision, reason=a.reason,
             metadata=a.audit_metadata)
        for a in rows
    ]}

@app.get("/api/knowledge-documents")
def list_knowledge_docs(db: Session = Depends(get_db)):
    rows = db.query(models.KnowledgeDocument).all()
    return {"documents": [dict(id=d.id, title=d.title, category=d.category, content=d.content) for d in rows]}

@app.get("/api/transactions/invoices")
def list_invoices(db: Session = Depends(get_db), limit: int = 200):
    rows = db.query(models.Invoice).limit(limit).all()
    return {"invoices": [dict(id=r.id, invoice_id=r.invoice_id, invoice_no=r.invoice_no, vendor=r.vendor,
                               gstin=r.gstin, date=r.date, taxable_value=r.taxable_value, tax=r.tax,
                               total=r.total, payment_status=r.payment_status) for r in rows]}
# ---------------------------------------------------------------------------
# UPLOAD ENDPOINT
# ---------------------------------------------------------------------------
import io
import pandas as pd

# Expected column sets per source (minimum required columns; extras are silently ignored)
_REQUIRED_COLS = {
    "invoices": {"invoice_no", "vendor", "gstin", "date", "total"},
    "gstr1":    {"invoice_no", "gstin", "customer", "total", "date"},
    "gstr2b":   {"invoice_no", "supplier_gstin", "supplier_name", "invoice_date", "taxable_value"},
    "tally":    {"invoice_no", "party", "gstin", "date", "amount"},
    "bank":     {"txn_id", "date", "reference_no", "narration", "party", "amount", "dr_cr"},
}

_SOURCE_MODEL = {
    "invoices": models.Invoice,
    "gstr1":    models.Gstr1Record,
    "gstr2b":   models.Gstr2bRecord,
    "tally":    models.TallyRecord,
    "bank":     models.BankTransaction,
}


@app.post("/api/upload")
async def upload_csv(
    file: UploadFile = File(...),
    source: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV for one source (invoices | gstr1 | gstr2b | tally | bank).
    Replaces all rows for that source, then triggers a full reconciliation run
    so results are immediately fresh.
    """
    if source not in _REQUIRED_COLS:
        raise HTTPException(
            400,
            f"Unknown source '{source}'. Must be one of: {', '.join(_REQUIRED_COLS)}",
        )

    content = await file.read()
    filename_lower = (file.filename or "").lower()

    try:
        if filename_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str)
        else:
            # CSV: try UTF-8 with BOM first (common from Excel "Save as CSV")
            try:
                text = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = content.decode("latin-1")
            df = pd.read_csv(io.StringIO(text), dtype=str)
    except Exception as exc:
        raise HTTPException(400, f"Could not parse file: {exc}")

    # Normalise column names (strip whitespace)
    df.columns = [c.strip() for c in df.columns]
    df = df.fillna("")
    reader = df.to_dict(orient="records")
    if not reader:
        raise HTTPException(400, "Uploaded file is empty or has no data rows.")

    # Column validation
    uploaded_cols = set(reader[0].keys())
    required = _REQUIRED_COLS[source]
    missing_cols = required - uploaded_cols
    if missing_cols:
        raise HTTPException(
            422,
            f"Missing required columns for source '{source}': {sorted(missing_cols)}. "
            f"Got: {sorted(uploaded_cols)}",
        )

    model = _SOURCE_MODEL[source]
    db.query(model).delete()
    db.commit()

    errors = []
    inserted = 0
    for i, row in enumerate(reader, start=2):   # row 1 = header
        # strip extra whitespace from every cell
        clean = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
        try:
            # Only pass columns that the model actually has
            model_cols = {c.name for c in model.__table__.columns if c.name != "id"}
            filtered = {k: v for k, v in clean.items() if k in model_cols}
            db.add(model(**filtered))
            inserted += 1
        except Exception as exc:
            errors.append({"row": i, "error": str(exc)})

    db.commit()

    audit_svc.write_audit(
        db, actor="user", action="DATA_UPLOADED", entity_type="upload",
        entity_id=source, new_status="REPLACED",
        metadata={"filename": file.filename, "rows_inserted": inserted,
                  "rows_errored": len(errors)},
    )

    return {
        "source": source,
        "filename": file.filename,
        "rows_inserted": inserted,
        "rows_errored": len(errors),
        "errors": errors[:20],   # cap to avoid huge payloads
        "message": (
            f"Uploaded {inserted} rows into '{source}'. "
            + (f"{len(errors)} row(s) failed validation." if errors else "No errors.")
            + " Run reconciliation to refresh results."
        ),
    }
