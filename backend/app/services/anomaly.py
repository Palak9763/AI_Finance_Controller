"""
Anomaly detection. Deterministic/statistical (z-score + IQR on amount per
vendor), optionally composited with IsolationForest. This NEVER overrides a
reconciliation status -- a transaction can be MATCHED and still anomalous.
"""
import statistics
from decimal import Decimal
from collections import defaultdict

try:
    from sklearn.ensemble import IsolationForest
    import numpy as np
    HAVE_SKLEARN = True
except ImportError:
    HAVE_SKLEARN = False


def _to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def detect_anomalies(results):
    """
    results: list of ReconciliationResultRow-like objects with vendor, invoices_amount/total, status.
    Returns list of dicts: invoice_no, vendor, amount, expected_range, anomaly_score, reason, risk_level.
    """
    by_vendor = defaultdict(list)
    for r in results:
        amt = _to_float(r.invoices_amount or r.tally_amount or r.bank_amount)
        if amt is not None:
            by_vendor[r.vendor].append((r, amt))

    anomalies = []
    for vendor, pairs in by_vendor.items():
        amounts = [a for _, a in pairs]
        if len(amounts) < 4:
            continue
        mean = statistics.mean(amounts)
        stdev = statistics.pstdev(amounts) or 1.0
        sorted_amt = sorted(amounts)
        q1 = sorted_amt[len(sorted_amt) // 4]
        q3 = sorted_amt[(3 * len(sorted_amt)) // 4]
        iqr = (q3 - q1) or 1.0
        low_bound = q1 - 1.5 * iqr
        high_bound = q3 + 1.5 * iqr

        vendor_amounts_arr = None
        iso_scores = {}
        if HAVE_SKLEARN and len(amounts) >= 6:
            arr = np.array(amounts).reshape(-1, 1)
            try:
                clf = IsolationForest(contamination="auto", random_state=42)
                clf.fit(arr)
                scores = clf.decision_function(arr)
                for (r, a), s in zip(pairs, scores):
                    iso_scores[id(r)] = float(s)
            except Exception:
                pass

        for r, amt in pairs:
            z = (amt - mean) / stdev
            is_outlier_iqr = amt < low_bound or amt > high_bound
            is_outlier_z = abs(z) > 2.5
            if not (is_outlier_iqr or is_outlier_z):
                continue
            composite_score = round(min(1.0, (abs(z) / 4) + (0.3 if is_outlier_iqr else 0)), 3)
            if id(r) in iso_scores:

                iso_contrib = max(0.0, 0.5 - iso_scores[id(r)])
                composite_score = round(min(1.0, composite_score * 0.6 + iso_contrib * 0.4), 3)

            risk = "HIGH" if composite_score > 0.75 else ("MEDIUM" if composite_score > 0.45 else "LOW")
            reason = (f"Amount {amt:,.2f} is {'above' if amt > mean else 'below'} the typical range for "
                      f"vendor '{vendor}' (mean {mean:,.2f}, z-score {z:.2f}).")
            anomalies.append(dict(
                invoice_no=r.invoice_no, vendor=vendor, amount=amt,
                expected_range_low=round(max(low_bound, 0), 2), expected_range_high=round(high_bound, 2),
                anomaly_score=composite_score, reason=reason, risk_level=risk,
                reconciliation_status=r.status,
            ))
    anomalies.sort(key=lambda a: -a["anomaly_score"])
    return anomalies
