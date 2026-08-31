"""
Synthetic data generator for the AI Finance Controller.

Generates 6 cross-referenced sources (GSTR-1, GSTR-2B, GSTR-3B, Tally, Bank,
Invoices) plus a ground_truth.csv that captures the INTENDED classification
for every invoice-level record. The reconciliation engine must NEVER read
ground_truth.csv -- it is consumed only by the evaluation module, after the
pipeline has already produced its own classifications.

Every one of the 18 required edge cases is deliberately baked in and tagged
with an `edge_case` label in ground truth so it's auditable.
"""
import random
import csv
import os
from datetime import date, timedelta
from decimal import Decimal

random.seed(42)

VENDORS = [
    ("Shree Balaji Traders", "27AAACB1234F1Z5"),
    ("Om Enterprises", "07AAACO5678G1Z2"),
    ("Kumar & Sons", "29AAACK9012H1Z8"),
    ("Global Tech Solutions", "36AAACG3456I1Z1"),
    ("Sunrise Distributors", "19AAACS7890J1Z4"),
    ("Pinnacle Industries", "24AAACP2345K1Z7"),
    ("Nova Logistics", "33AAACN6789L1Z0"),
    ("Everest Suppliers", "06AAACE0123M1Z3"),
    ("Silverline Corp", "27AAACS4567N1Z6"),
    ("Ashoka Metals", "09AAACA8901O1Z9"),
]

VENDOR_ALIASES = {
    "Shree Balaji Traders": ["Shree Balaji Traders Pvt Ltd", "SHREE BALAJI TRADERS", "Shree Balaji Traders Pvt. Ltd."],
    "Om Enterprises": ["Om Enterprises Ltd", "OM ENTERPRISES", "Om Enterprise"],
    "Global Tech Solutions": ["Global Tech Solutions Pvt Ltd", "GLOBALTECH SOLUTIONS"],
}

BASE_DATE = date(2025, 6, 1)


def d(days_offset):
    return BASE_DATE + timedelta(days=days_offset)


def money(x):
    return str(Decimal(str(x)).quantize(Decimal("0.01")))


def gst_split(taxable, rate=18):
    """Split into CGST/SGST (intra-state) for simplicity."""
    tax = round(taxable * rate / 100, 2)
    half = round(tax / 2, 2)
    return half, half, 0.0, round(taxable + tax, 2)


class Records:
    def __init__(self):
        self.gstr1 = []
        self.gstr2b = []
        self.gstr3b = []
        self.tally = []
        self.bank = []
        self.invoices = []
        self.ground_truth = []
        self._inv_counter = 100

    def next_invoice_no(self):
        self._inv_counter += 1
        return f"INV-{self._inv_counter:04d}"


def build_dataset():
    R = Records()

    def add_case(edge_case, vendor_idx, taxable, invoice_no=None, date_offset=0,
                 status_expected="MATCHED", variant_fn=None):
        vendor, gstin = VENDORS[vendor_idx % len(VENDORS)]
        invoice_no = invoice_no or R.next_invoice_no()
        cgst, sgst, igst, total = gst_split(taxable)
        inv_date = d(date_offset)

        record = dict(
            invoice_no=invoice_no, vendor=vendor, gstin=gstin,
            taxable=taxable, cgst=cgst, sgst=sgst, igst=igst, total=total,
            date=inv_date, edge_case=edge_case, status_expected=status_expected,
        )
        if variant_fn:
            variant_fn(record)
        return record

    def emit(rec, sources=("gstr1", "gstr2b", "tally", "bank", "invoice")):
        """Emit a clean record identically into the requested sources."""
        if "gstr1" in sources:
            R.gstr1.append(dict(
                invoice_no=rec["invoice_no"], gstin=rec["gstin"], customer=rec["vendor"],
                taxable_amt=money(rec["taxable"]), cgst=money(rec["cgst"]), sgst=money(rec["sgst"]),
                igst=money(rec["igst"]), total=money(rec["total"]), date=rec["date"].isoformat(),
            ))
        if "gstr2b" in sources:
            R.gstr2b.append(dict(
                supplier_gstin=rec["gstin"], supplier_name=rec["vendor"], invoice_no=rec["invoice_no"],
                invoice_date=rec["date"].isoformat(), taxable_value=money(rec["taxable"]),
                cgst=money(rec["cgst"]), sgst=money(rec["sgst"]), igst=money(rec["igst"]),
                itc_eligible=rec.get("itc_eligible", "YES"),
            ))
        if "tally" in sources:
            R.tally.append(dict(
                voucher_id=f"V-{rec['invoice_no']}", invoice_no=rec.get("tally_invoice_no", rec["invoice_no"]),
                party=rec.get("tally_vendor", rec["vendor"]), gstin=rec["gstin"], date=rec["date"].isoformat(),
                ledger="Purchase", amount=money(rec.get("tally_amount", rec["total"])),
                payment_status=rec.get("payment_status", "PAID"),
            ))
        if "bank" in sources:
            R.bank.append(dict(
                txn_id=f"TXN-{rec['invoice_no']}", date=(rec["date"] + timedelta(days=rec.get("bank_delay", 0))).isoformat(),
                reference_no=rec.get("bank_ref", rec["invoice_no"]),
                narration=rec.get("narration", f"NEFT PAYMENT {rec.get('bank_ref', rec['invoice_no'])} {rec['vendor'].upper()}"),
                party=rec["vendor"], amount=money(rec.get("bank_amount", rec["total"])), dr_cr="DR",
                payment_ref=rec.get("bank_ref", rec["invoice_no"]),
            ))
        if "invoice" in sources:
            R.invoices.append(dict(
                invoice_id=f"II-{rec['invoice_no']}", invoice_no=rec["invoice_no"], vendor=rec["vendor"],
                gstin=rec["gstin"], date=rec["date"].isoformat(), taxable_value=money(rec["taxable"]),
                tax=money(rec["cgst"] + rec["sgst"] + rec["igst"]), total=money(rec["total"]),
                payment_status=rec.get("payment_status", "PAID"),
            ))
        R.ground_truth.append(dict(
            invoice_no=rec["invoice_no"], vendor=rec["vendor"], edge_case=rec["edge_case"],
            status_expected=rec["status_expected"],
        ))

    idx = 0

    # 1-2: bulk of EXACT MATCHES (60-70%) --------------------------------
    for i in range(46):
        rec = add_case("exact_match", idx % 10, taxable=round(random.uniform(5000, 80000), 2),
                        date_offset=random.randint(0, 60))
        emit(rec)
        idx += 1

    # 2: AMOUNT MISMATCH --------------------------------------------------
    for i in range(4):
        base_taxable = round(random.uniform(10000, 50000), 2)
        rec = add_case("amount_mismatch", idx % 10, taxable=base_taxable, date_offset=random.randint(0, 60),
                        status_expected="MISMATCH",
                        variant_fn=lambda r: r.update(tally_amount=round(r["total"] * 1.15, 2),
                                                       bank_amount=round(r["total"] * 1.15, 2)))
        emit(rec)
        idx += 1

    # 3: MISSING TALLY RECORD ---------------------------------------------
    for i in range(4):
        rec = add_case("missing_tally", idx % 10, taxable=round(random.uniform(5000, 30000), 2),
                        date_offset=random.randint(0, 60), status_expected="MISSING")
        emit(rec, sources=("gstr1", "gstr2b", "bank", "invoice"))
        idx += 1

    # 4: MISSING BANK TXN ---------------------------------------------------
    for i in range(4):
        rec = add_case("missing_bank", idx % 10, taxable=round(random.uniform(5000, 30000), 2),
                        date_offset=random.randint(0, 60), status_expected="MISSING",
                        variant_fn=lambda r: r.update(payment_status="UNPAID"))
        emit(rec, sources=("gstr1", "gstr2b", "tally", "invoice"))
        idx += 1

    # 5: DUPLICATE INVOICE (same invoice appears twice in invoices source) -
    for i in range(3):
        rec = add_case("duplicate_invoice", idx % 10, taxable=round(random.uniform(5000, 20000), 2),
                        date_offset=random.randint(0, 60), status_expected="DUPLICATE")
        emit(rec)
        # duplicate entry, slightly different invoice_id
        dup = dict(rec)
        R.invoices.append(dict(
            invoice_id=f"II-{rec['invoice_no']}-DUP", invoice_no=rec["invoice_no"], vendor=rec["vendor"],
            gstin=rec["gstin"], date=rec["date"].isoformat(), taxable_value=money(rec["taxable"]),
            tax=money(rec["cgst"] + rec["sgst"] + rec["igst"]), total=money(rec["total"]),
            payment_status="PAID",
        ))
        idx += 1

    # 6: DUPLICATE TALLY ENTRY ----------------------------------------------
    for i in range(2):
        rec = add_case("duplicate_tally", idx % 10, taxable=round(random.uniform(5000, 20000), 2),
                        date_offset=random.randint(0, 60), status_expected="DUPLICATE")
        emit(rec)
        R.tally.append(dict(
            voucher_id=f"V-{rec['invoice_no']}-DUP2", invoice_no=rec["invoice_no"], party=rec["vendor"],
            gstin=rec["gstin"], date=rec["date"].isoformat(), ledger="Purchase",
            amount=money(rec["total"]), payment_status="PAID",
        ))
        idx += 1

    # 7: INVOICE NUMBER FORMATTING VARIANTS ---------------------------------
    variants = ["INV/{}", "INV {}", "inv-{}"]
    for i in range(3):
        num = R._inv_counter + 1
        R._inv_counter += 1
        canon = f"INV-{num:04d}"
        rec = add_case("invoice_format_variant", idx % 10, taxable=round(random.uniform(5000, 20000), 2),
                        invoice_no=canon, date_offset=random.randint(0, 60),
                        status_expected="MATCHED",
                        variant_fn=lambda r, v=variants[i]: r.update(
                            tally_invoice_no=v.format(f"{num:04d}")))
        emit(rec)
        idx += 1

    # 8: VENDOR NAME VARIANTS -------------------------------------------------
    alias_vendors = list(VENDOR_ALIASES.keys())
    for i in range(3):
        v_name = alias_vendors[i % len(alias_vendors)]
        v_idx = [v[0] for v in VENDORS].index(v_name)
        alias = VENDOR_ALIASES[v_name][i % len(VENDOR_ALIASES[v_name])]
        rec = add_case("vendor_name_variant", v_idx, taxable=round(random.uniform(5000, 20000), 2),
                        date_offset=random.randint(0, 60), status_expected="MATCHED",
                        variant_fn=lambda r, a=alias: r.update(tally_vendor=a))
        emit(rec)
        idx += 1

    # 9: SMALL BANK FEE DEDUCTION ----------------------------------------------
    for i in range(4):
        rec = add_case("bank_fee_deduction", idx % 10, taxable=round(random.uniform(8000, 40000), 2),
                        date_offset=random.randint(0, 60), status_expected="MATCHED_WITH_TOLERANCE",
                        variant_fn=lambda r: r.update(
                            bank_amount=round(r["total"] - random.choice([25, 50, 75]), 2),
                            narration=f"NEFT PAYMENT LESS BANK CHARGES {r['invoice_no']} {r['vendor'].upper()}"))
        emit(rec)
        idx += 1

    # 10: DATE DIFF WITHIN TOLERANCE (<=3 days) --------------------------------
    for i in range(4):
        rec = add_case("date_within_tolerance", idx % 10, taxable=round(random.uniform(5000, 30000), 2),
                        date_offset=random.randint(0, 60), status_expected="MATCHED_WITH_TOLERANCE",
                        variant_fn=lambda r: r.update(bank_delay=2))
        emit(rec)
        idx += 1

    # 11: DATE DIFF OUTSIDE TOLERANCE (>3 days) --------------------------------
    for i in range(3):
        rec = add_case("date_outside_tolerance", idx % 10, taxable=round(random.uniform(5000, 30000), 2),
                        date_offset=random.randint(0, 60), status_expected="PARTIAL_MATCH",
                        variant_fn=lambda r: r.update(bank_delay=12))
        emit(rec)
        idx += 1

    # 12: GSTIN MISMATCH ----------------------------------------------------------
    for i in range(3):
        wrong_gstin = VENDORS[(idx + 1) % 10][1]
        rec = add_case("gstin_mismatch", idx % 10, taxable=round(random.uniform(5000, 30000), 2),
                        date_offset=random.randint(0, 60), status_expected="MISMATCH")
        emit(rec)
        # corrupt GSTIN only in Tally
        R.tally[-1]["gstin"] = wrong_gstin
        idx += 1

    # 13: SAME VENDOR MULTIPLE INVOICES (should each match independently) -----
    v_idx_multi = idx % 10
    for i in range(3):
        rec = add_case("same_vendor_multi_invoice", v_idx_multi, taxable=round(random.uniform(5000, 20000), 2),
                        date_offset=10 + i * 5, status_expected="MATCHED")
        emit(rec)
    idx += 1

    # 14: SAME AMOUNT, DIFFERENT INVOICE (tests matching doesn't confuse them) -
    shared_amt = 15000.00
    for i in range(2):
        rec = add_case("same_amount_diff_invoice", idx % 10, taxable=shared_amt,
                        date_offset=random.randint(0, 60), status_expected="MATCHED")
        emit(rec)
        idx += 1

    # 15: MULTIPLE PLAUSIBLE MATCHES (true ambiguity) ---------------------------
    for i in range(3):
        vendor, gstin = VENDORS[idx % 10]
        amt = round(random.uniform(10000, 20000), 2)
        base_date_off = random.randint(0, 50)
        inv1 = R.next_invoice_no()
        inv2 = R.next_invoice_no()
        cgst, sgst, igst, total = gst_split(amt)
        # Two invoices, same vendor, same amount, dates 1 day apart -> ambiguous vs bank txn with generic narration
        for inv in (inv1, inv2):
            R.gstr1.append(dict(invoice_no=inv, gstin=gstin, customer=vendor, taxable_amt=money(amt),
                                 cgst=money(cgst), sgst=money(sgst), igst=money(igst), total=money(total),
                                 date=d(base_date_off).isoformat()))
            R.gstr2b.append(dict(supplier_gstin=gstin, supplier_name=vendor, invoice_no=inv,
                                  invoice_date=d(base_date_off).isoformat(), taxable_value=money(amt),
                                  cgst=money(cgst), sgst=money(sgst), igst=money(igst), itc_eligible="YES"))
            R.tally.append(dict(voucher_id=f"V-{inv}", invoice_no=inv, party=vendor, gstin=gstin,
                                 date=d(base_date_off).isoformat(), ledger="Purchase", amount=money(total),
                                 payment_status="PAID"))
            R.invoices.append(dict(invoice_id=f"II-{inv}", invoice_no=inv, vendor=vendor, gstin=gstin,
                                    date=d(base_date_off).isoformat(), taxable_value=money(amt),
                                    tax=money(cgst + sgst + igst), total=money(total), payment_status="PAID"))
            R.ground_truth.append(dict(invoice_no=inv, vendor=vendor, edge_case="multiple_plausible_matches",
                                        status_expected="AMBIGUOUS"))
        # ONE generic bank txn that could match either invoice (no ref number in narration)
        R.bank.append(dict(txn_id=f"TXN-AMBIG-{i}", date=d(base_date_off + 1).isoformat(),
                            reference_no="NA", narration=f"NEFT PAYMENT {vendor.upper()}",
                            party=vendor, amount=money(total), dr_cr="DR", payment_ref="NA"))
        idx += 1

    # 16: UNKNOWN / INVALID VENDOR --------------------------------------------------
    for i in range(2):
        inv = R.next_invoice_no()
        amt = round(random.uniform(5000, 15000), 2)
        cgst, sgst, igst, total = gst_split(amt)
        R.invoices.append(dict(invoice_id=f"II-{inv}", invoice_no=inv, vendor="Unregistered Vendor XYZ",
                                gstin="INVALIDGSTIN123", date=d(random.randint(0, 60)).isoformat(),
                                taxable_value=money(amt), tax=money(cgst + sgst + igst), total=money(total),
                                payment_status="UNPAID"))
        R.ground_truth.append(dict(invoice_no=inv, vendor="Unregistered Vendor XYZ",
                                    edge_case="unknown_invalid_vendor", status_expected="REVIEW_REQUIRED"))
        idx += 1

    # 17: GSTR-2B vs TALLY ITC MISMATCH ------------------------------------------------
    for i in range(3):
        rec = add_case("itc_mismatch", idx % 10, taxable=round(random.uniform(10000, 40000), 2),
                        date_offset=random.randint(0, 60), status_expected="PARTIAL_MATCH",
                        variant_fn=lambda r: r.update(itc_eligible="NO"))
        emit(rec)
        idx += 1

    # 18: GSTR-3B SUMMARY VARIANCE (control totals, not invoice level) -----------------
    total_outward = sum(float(r["taxable_amt"]) for r in R.gstr1)
    total_itc_2b = sum(float(r["taxable_value"]) for r in R.gstr2b)
    R.gstr3b.append(dict(
        period="2025-06", outward_taxable_supplies=money(total_outward),
        tax_liability=money(total_outward * 0.18),
        eligible_itc=money(total_itc_2b * 0.18 * 0.95),  # deliberate 5% variance
        itc_claimed=money(total_itc_2b * 0.18),
        tax_payable=money(total_outward * 0.18 * 0.9),
    ))
    R.ground_truth.append(dict(invoice_no="GSTR3B-SUMMARY", vendor="ALL", edge_case="gstr3b_summary_variance",
                                status_expected="REVIEW_REQUIRED"))

    return R


def write_csvs(R, out_dir):
    os.makedirs(out_dir, exist_ok=True)

    def w(name, rows):
        if not rows:
            return
        path = os.path.join(out_dir, name)
        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    w("gstr1.csv", R.gstr1)
    w("gstr2b.csv", R.gstr2b)
    w("gstr3b.csv", R.gstr3b)
    w("tally.csv", R.tally)
    w("bank.csv", R.bank)
    w("invoices.csv", R.invoices)
    w("ground_truth.csv", R.ground_truth)

    counts = dict(
        gstr1=len(R.gstr1), gstr2b=len(R.gstr2b), gstr3b=len(R.gstr3b),
        tally=len(R.tally), bank=len(R.bank), invoices=len(R.invoices),
        ground_truth=len(R.ground_truth),
    )
    return counts


if __name__ == "__main__":
    R = build_dataset()
    counts = write_csvs(R, os.path.join(os.path.dirname(__file__), "..", "..", "data"))
    print("Generated:", counts)
