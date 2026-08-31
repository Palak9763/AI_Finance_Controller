"""Short synthetic policy docs seeding the RAG knowledge base."""

DOCS = [
    dict(title="Bank Fee Deduction Policy", category="bank_policy", content=(
        "Outward NEFT/RTGS/IMPS payments processed through our primary current account may be net "
        "of a bank service charge. Standard bank charges range from INR 20 to INR 100 per transaction "
        "depending on the transfer mode and value slab. When a settled bank amount is less than the "
        "invoice total by a small amount (typically under INR 150) and the narration mentions 'BANK "
        "CHARGES', 'LESS CHARGES', or similar, this should be treated as a bank fee deduction, not a "
        "payment discrepancy. Such variances are auto-eligible for MATCHED_WITH_TOLERANCE status and do "
        "not require vendor follow-up."
    )),
    dict(title="Reconciliation Tolerance Policy", category="reconciliation_policy", content=(
        "The finance team's standard reconciliation tolerance is an absolute amount difference of INR "
        "100 OR a percentage difference of 0.5%, whichever condition is met first. Settlement dates that "
        "fall within 3 calendar days of the invoice date are considered normal processing lag and do not "
        "constitute a discrepancy. Any amount difference exceeding both thresholds must be investigated "
        "and cannot be auto-matched under any circumstance."
    )),
    dict(title="Duplicate Invoice Policy", category="duplicate_policy", content=(
        "A duplicate is flagged when the same normalized invoice number appears more than once within "
        "the same vendor and GSTIN across the invoices or Tally ledger source. Duplicates must never be "
        "auto-resolved by the system. The standard resolution path is: (1) confirm with the originating "
        "department whether the duplicate entry represents a genuine re-upload or a real double booking, "
        "(2) if double booking, reverse the duplicate Tally voucher, (3) if a genuine correction, retain "
        "only the latest version and archive the earlier one with a note."
    )),
    dict(title="GST Input Tax Credit (ITC) Eligibility Policy", category="gst_policy", content=(
        "Input Tax Credit claimed in Tally must reconcile against GSTR-2B on a month-on-month basis. "
        "ITC marked 'NOT ELIGIBLE' in GSTR-2B (for example due to a vendor's own non-filing, a blocked "
        "credit category under Section 17(5), or a mismatched GSTIN) must not be claimed in Tally even if "
        "the underlying invoice otherwise reconciles cleanly. Any invoice showing a GSTR-2B ITC ineligible "
        "flag alongside a matched Tally/bank trail should be routed to PARTIAL_MATCH pending finance review, "
        "since the commercial transaction is valid but the tax credit treatment needs correction."
    )),
    dict(title="Approval Thresholds and Escalation Policy", category="approval_policy", content=(
        "AI-generated investigation findings are advisory only and can never self-approve a resolution. "
        "Any exception with AI confidence below 0.6, or classified as HIGH risk, or involving an amount "
        "above INR 100,000, must be escalated to a senior finance reviewer rather than a junior approver. "
        "All approvals and rejections must be logged with actor identity, timestamp, and a stated reason "
        "in the audit trail, regardless of the amount involved."
    )),
    dict(title="Vendor Name Normalization SOP", category="finance_sop", content=(
        "Vendor names frequently appear with inconsistent legal suffixes (Pvt Ltd, Ltd, LLP), casing, or "
        "spacing across GSTR filings, Tally masters, and bank narrations. Before treating two records as "
        "different vendors, normalize both names by stripping legal suffixes, collapsing whitespace, and "
        "case-folding. A vendor alias map should be maintained and logged whenever two raw name strings "
        "are treated as the same canonical vendor, so the mapping remains auditable."
    )),
    dict(title="Missing Record Investigation SOP", category="finance_sop", content=(
        "When an invoice exists in source GST filings but has no corresponding Tally ledger voucher, first "
        "check whether the invoice was booked under a different voucher type or a different accounting "
        "period. When an invoice and Tally entry exist but no bank settlement is found, check the payment "
        "status field: if UNPAID, this is expected and not an error; if marked PAID, escalate immediately "
        "as a potential unrecorded or misapplied payment."
    )),
    dict(title="GSTR-3B Summary Variance Policy", category="gst_policy", content=(
        "GSTR-3B is a summary-level return and will not tie out exactly to the sum of invoice-level GSTR-1 "
        "and GSTR-2B records in every period, due to timing differences, credit notes, and prior-period "
        "adjustments. A variance under 2% between the GSTR-3B declared eligible ITC and the GSTR-2B-derived "
        "total is considered normal. Variances above 2% must be reviewed by the GST compliance owner before "
        "the return is treated as reconciled."
    )),
]
