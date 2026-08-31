from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.sql import func
from .database import Base

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True)
    invoice_id = Column(String)
    invoice_no = Column(String, index=True)
    vendor = Column(String)
    gstin = Column(String)
    date = Column(String)
    taxable_value = Column(String)
    tax = Column(String)
    total = Column(String)
    payment_status = Column(String)

class Gstr1Record(Base):
    __tablename__ = "gstr1_records"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, index=True)
    gstin = Column(String)
    customer = Column(String)
    taxable_amt = Column(String)
    cgst = Column(String)
    sgst = Column(String)
    igst = Column(String)
    total = Column(String)
    date = Column(String)

class Gstr2bRecord(Base):
    __tablename__ = "gstr2b_records"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, index=True)
    supplier_gstin = Column(String)
    supplier_name = Column(String)
    invoice_date = Column(String)
    taxable_value = Column(String)
    cgst = Column(String)
    sgst = Column(String)
    igst = Column(String)
    itc_eligible = Column(String)

class Gstr3bRecord(Base):
    __tablename__ = "gstr3b_records"
    id = Column(Integer, primary_key=True)
    period = Column(String)
    outward_taxable_supplies = Column(String)
    tax_liability = Column(String)
    eligible_itc = Column(String)
    itc_claimed = Column(String)
    tax_payable = Column(String)

class TallyRecord(Base):
    __tablename__ = "tally_records"
    id = Column(Integer, primary_key=True)
    voucher_id = Column(String)
    invoice_no = Column(String, index=True)
    party = Column(String)
    gstin = Column(String)
    date = Column(String)
    ledger = Column(String)
    amount = Column(String)
    payment_status = Column(String)

class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id = Column(Integer, primary_key=True)
    txn_id = Column(String)
    date = Column(String)
    reference_no = Column(String)
    narration = Column(String)
    party = Column(String)
    amount = Column(String)
    dr_cr = Column(String)
    payment_ref = Column(String)

class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"
    id = Column(Integer, primary_key=True)
    run_at = Column(DateTime(timezone=True), server_default=func.now())
    processing_time_ms = Column(Float)
    evaluation_json = Column(JSON)
    normalization_warning_count = Column(Integer)

class ReconciliationResultRow(Base):
    __tablename__ = "reconciliation_results"
    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("reconciliation_runs.id"))
    invoice_no = Column(String, index=True)
    vendor = Column(String)
    gstin = Column(String)
    date = Column(String)
    invoices_amount = Column(String)
    gstr1_amount = Column(String)
    gstr2b_amount = Column(String)
    tally_amount = Column(String)
    bank_amount = Column(String)
    status = Column(String, index=True)
    match_level = Column(Integer)
    absolute_difference = Column(String)
    percentage_difference = Column(String)
    evidence = Column(JSON)
    ai_insight = Column(String, default=None)

class ReconciliationMatch(Base):
    __tablename__ = "reconciliation_matches"
    id = Column(Integer, primary_key=True)
    result_id = Column(Integer, ForeignKey("reconciliation_results.id"))
    source = Column(String)
    source_record_id = Column(String)

class Exception_(Base):
    __tablename__ = "exceptions"
    id = Column(Integer, primary_key=True)
    result_id = Column(Integer, ForeignKey("reconciliation_results.id"))
    invoice_no = Column(String, index=True)
    vendor = Column(String)
    status = Column(String)
    severity = Column(String)  # LOW/MEDIUM/HIGH heuristic from amount+status
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    investigation_status = Column(String, default="NOT_STARTED")  # NOT_STARTED/IN_PROGRESS/DONE

class Anomaly(Base):
    __tablename__ = "anomalies"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, index=True)
    vendor = Column(String)
    amount = Column(Float)
    expected_range_low = Column(Float)
    expected_range_high = Column(Float)
    anomaly_score = Column(Float)
    reason = Column(String)
    risk_level = Column(String)
    reconciliation_status = Column(String)

class Investigation(Base):
    __tablename__ = "investigations"
    id = Column(Integer, primary_key=True)
    exception_id = Column(Integer, ForeignKey("exceptions.id"))
    case_id = Column(String)
    provider = Column(String)  # "Demo AI Provider" | "OpenAI Agent"
    status = Column(String, default="RUNNING")  # RUNNING/COMPLETE
    stages_json = Column(JSON)
    summary = Column(Text)
    root_cause = Column(Text)
    evidence_json = Column(JSON)
    recommendation = Column(Text)
    confidence = Column(Float)
    risk_level = Column(String)
    requires_human_review = Column(Boolean, default=True)
    retrieved_docs_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True)
    exception_id = Column(Integer, ForeignKey("exceptions.id"))
    investigation_id = Column(Integer, ForeignKey("investigations.id"), nullable=True)
    status = Column(String, default="PENDING")  # PENDING/APPROVED/REJECTED
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True), nullable=True)
    reason = Column(String, default=None)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    actor = Column(String)
    action = Column(String)
    entity_type = Column(String)
    entity_id = Column(String)
    previous_status = Column(String, default=None)
    new_status = Column(String, default=None)
    ai_recommendation = Column(Text, default=None)
    human_decision = Column(String, default=None)
    reason = Column(String, default=None)
    audit_metadata = Column(JSON, default=None)

class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    id = Column(Integer, primary_key=True)
    title = Column(String)
    category = Column(String)
    content = Column(Text)

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id"))
    chunk_text = Column(Text)
    chunk_index = Column(Integer)
