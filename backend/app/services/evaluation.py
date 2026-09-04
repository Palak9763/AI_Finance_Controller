"""
Evaluation engine. Computes metrics from an ACTUAL pipeline run, never fabricated.
Consumes ground_truth.csv -- the reconciliation engine itself never sees it.
"""
import time
from collections import defaultdict
from typing import List, Dict
from .normalization import normalize_invoice_number
from .reconciliation import STATUSES

def compute_evaluation(results: List, ground_truth_rows: List[dict], processing_time_ms: float) -> dict:
    total = len(results)
    status_counts = defaultdict(int)
    for r in results:
        status_counts[r.status] += 1

    resolved_statuses = {"MATCHED", "MATCHED_WITH_TOLERANCE"}
    exception_statuses = {"PARTIAL_MATCH", "MISMATCH", "MISSING", "DUPLICATE", "AMBIGUOUS", "REVIEW_REQUIRED"}

    resolved = sum(status_counts[s] for s in resolved_statuses)
    exceptions = sum(status_counts[s] for s in exception_statuses)

    match_rate = round((status_counts["MATCHED"] + status_counts["MATCHED_WITH_TOLERANCE"]) / total * 100, 2) if total else 0.0
    resolution_rate = round(resolved / total * 100, 2) if total else 0.0
    exception_rate = round(exceptions / total * 100, 2) if total else 0.0

    # --- accuracy against ground truth (join on normalized invoice_no) ---
    gt_by_key = {}
    for row in ground_truth_rows:
        key = normalize_invoice_number(row.get("invoice_no", ""))
        gt_by_key[key] = row.get("status_expected", "")

    confusion: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    correct = 0
    compared = 0
    for r in results:
        key = normalize_invoice_number(r.invoice_no.replace("BANK:", ""))
        expected = gt_by_key.get(key)
        if expected is None:
            continue
        compared += 1
        confusion[expected][r.status] += 1
        if expected == r.status:
            correct += 1

    accuracy = round(correct / compared * 100, 2) if compared else 0.0

    throughput = round(total / (processing_time_ms / 1000), 2) if processing_time_ms > 0 else 0.0

    return dict(
        total_records=total,
        matched=status_counts["MATCHED"],
        matched_with_tolerance=status_counts["MATCHED_WITH_TOLERANCE"],
        partial=status_counts["PARTIAL_MATCH"],
        mismatch=status_counts["MISMATCH"],
        missing=status_counts["MISSING"],
        duplicate=status_counts["DUPLICATE"],
        ambiguous=status_counts["AMBIGUOUS"],
        review_required=status_counts["REVIEW_REQUIRED"],
        resolved_records=resolved,
        exception_records=exceptions,
        match_rate=match_rate,
        resolution_rate=resolution_rate,
        exception_rate=exception_rate,
        accuracy_against_ground_truth=accuracy,
        ground_truth_compared=compared,
        processing_time_ms=round(processing_time_ms, 2),
        throughput_records_per_second=throughput,
        confusion_matrix={k: dict(v) for k, v in confusion.items()},
        status_breakdown={s: status_counts[s] for s in STATUSES},
    )
