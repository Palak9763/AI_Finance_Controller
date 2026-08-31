import os
import sys
import csv
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.services import normalization as norm
from app.services import reconciliation as recon
from app.services import evaluation as ev

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def load_csv(name):
    with open(os.path.join(DATA_DIR, name), newline="") as f:
        return list(csv.DictReader(f))


# --- Normalization tests -----------------------------------------------
def test_normalize_invoice_number_variants():
    assert norm.normalize_invoice_number("INV-001") == "INV001"
    assert norm.normalize_invoice_number("INV/001") == "INV001"
    assert norm.normalize_invoice_number("INV 001") == "INV001"
    assert norm.normalize_invoice_number("inv-001") == "INV001"


def test_normalize_vendor_name_strips_suffix_and_casefolds():
    assert norm.normalize_vendor_name("Shree Balaji Traders Pvt Ltd") == "Shree Balaji Traders"
    assert norm.normalize_vendor_name("OM ENTERPRISES") == "Om Enterprises"


def test_normalize_gstin_validates_format():
    valid, ok = norm.normalize_gstin("27aaacb1234f1z5")
    assert valid == "27AAACB1234F1Z5"
    assert ok is True
    _, ok2 = norm.normalize_gstin("INVALIDGSTIN123")
    assert ok2 is False


def test_normalize_amount_strips_symbols_returns_decimal():
    assert norm.normalize_amount("₹1,234.50") == Decimal("1234.50")
    assert norm.normalize_amount("1234.50") == Decimal("1234.50")
    assert isinstance(norm.normalize_amount("100"), Decimal)


def test_normalize_date_multiple_formats():
    assert norm.normalize_date("2025-06-01") == "2025-06-01"
    assert norm.normalize_date("01-06-2025") == "2025-06-01"
    assert norm.normalize_date("01/06/2025") is not None


# --- Reconciliation engine tests ----------------------------------------
def _minimal_sources(invoice_no="INV-001", vendor="Acme Corp", gstin="27AAACB1234F1Z5",
                      taxable=1000, total=1180, tally_total=None, bank_total=None, date="2025-06-01",
                      bank_date=None):
    tally_total = tally_total if tally_total is not None else total
    bank_total = bank_total if bank_total is not None else total
    bank_date = bank_date or date
    invoices = [dict(invoice_id="II-1", invoice_no=invoice_no, vendor=vendor, gstin=gstin, date=date,
                      taxable_value=str(taxable), tax=str(total - taxable), total=str(total), payment_status="PAID")]
    gstr1 = [dict(invoice_no=invoice_no, gstin=gstin, customer=vendor, taxable_amt=str(taxable),
                  cgst="0", sgst="0", igst="0", total=str(total), date=date)]
    gstr2b = [dict(invoice_no=invoice_no, supplier_gstin=gstin, supplier_name=vendor, invoice_date=date,
                   taxable_value=str(taxable), cgst="0", sgst="0", igst="0", itc_eligible="YES")]
    tally = [dict(voucher_id="V-1", invoice_no=invoice_no, party=vendor, gstin=gstin, date=date,
                  ledger="Purchase", amount=str(tally_total), payment_status="PAID")]
    bank = [dict(txn_id="T-1", date=bank_date, reference_no=invoice_no,
                 narration=f"NEFT PAYMENT {invoice_no} {vendor.upper()}", party=vendor, amount=str(bank_total),
                 dr_cr="DR", payment_ref=invoice_no)]
    return invoices, gstr1, gstr2b, tally, bank


def test_exact_match_classified_matched():
    invoices, g1, g2b, tally, bank = _minimal_sources()
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    assert len(results) == 1
    assert results[0].status == "MATCHED"


def test_tolerance_based_matching():
    # bank amount off by 50 (within absolute tolerance of 100)
    invoices, g1, g2b, tally, bank = _minimal_sources(total=1180, bank_total=1130)
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    assert results[0].status == "MATCHED_WITH_TOLERANCE"


def test_amount_mismatch_outside_tolerance():
    invoices, g1, g2b, tally, bank = _minimal_sources(total=1180, tally_total=1500, bank_total=1500)
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    assert results[0].status == "MISMATCH"


def test_missing_tally_detection():
    invoices, g1, g2b, tally, bank = _minimal_sources()
    results, _ = recon.reconcile(invoices, g1, g2b, [], bank)
    assert results[0].status == "MISSING"


def test_duplicate_detection():
    invoices, g1, g2b, tally, bank = _minimal_sources()
    invoices.append(dict(invoices[0]))  # duplicate invoice entry
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    assert results[0].status == "DUPLICATE"


def test_invoice_number_format_variant_still_matches():
    invoices, g1, g2b, tally, bank = _minimal_sources(invoice_no="INV-0055")
    tally[0]["invoice_no"] = "INV/0055"  # formatting variant
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    assert results[0].status == "MATCHED"


def test_never_reads_ground_truth():
    """The reconcile() function signature must not accept ground truth at all."""
    import inspect
    sig = inspect.signature(recon.reconcile)
    assert "ground_truth" not in sig.parameters


# --- Evaluation engine tests ---------------------------------------------
def test_evaluation_metrics_computation():
    invoices, g1, g2b, tally, bank = _minimal_sources()
    results, _ = recon.reconcile(invoices, g1, g2b, tally, bank)
    gt = [dict(invoice_no="INV-001", vendor="Acme Corp", edge_case="exact_match", status_expected="MATCHED")]
    metrics = ev.compute_evaluation(results, gt, processing_time_ms=10.0)
    assert metrics["total_records"] == 1
    assert metrics["accuracy_against_ground_truth"] == 100.0
    assert metrics["match_rate"] == 100.0
    assert "confusion_matrix" in metrics


# --- End-to-end test: synthetic data -> reconciliation -> evaluation -> API shape ---
def test_end_to_end_synthetic_dataset():
    invoices = load_csv("invoices.csv")
    gstr1 = load_csv("gstr1.csv")
    gstr2b = load_csv("gstr2b.csv")
    tally = load_csv("tally.csv")
    bank = load_csv("bank.csv")
    gt = load_csv("ground_truth.csv")

    assert len(invoices) >= 90
    assert len(gt) >= 90

    results, normres = recon.reconcile(invoices, gstr1, gstr2b, tally, bank)
    assert len(results) > 50
    assert len(normres.warnings) > 0

    metrics = ev.compute_evaluation(results, gt, processing_time_ms=25.0)
    assert metrics["total_records"] == len(results)
    assert metrics["accuracy_against_ground_truth"] > 80.0  # real, non-trivial, sane
    assert metrics["match_rate"] > 0
    assert set(metrics["status_breakdown"].keys()) == set(recon.STATUSES)

    statuses_seen = {r.status for r in results}
    # at least these edge-case categories should appear given the generator's design
    for expected_status in ["MATCHED", "MATCHED_WITH_TOLERANCE", "MISMATCH", "MISSING", "DUPLICATE", "AMBIGUOUS"]:
        assert expected_status in statuses_seen, f"{expected_status} missing from results"
