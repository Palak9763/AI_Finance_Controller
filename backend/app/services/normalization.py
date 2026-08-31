"""
Normalization layer. Deterministic, pure functions, no AI.

Every normalization decision that changes a value emits a NormalizationWarning
(source, field, original, normalized, rule applied). These become evidence for
the AI investigator later and are never silently discarded.
"""
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional, List

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
LEGAL_SUFFIXES = [
    r"\bpvt\.?\s*ltd\.?\b", r"\bltd\.?\b", r"\blimited\b", r"\bllp\b",
    r"\binc\.?\b", r"\bcorp(oration)?\.?\b", r"\bco\.?\b",
]

DATE_FORMATS = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%b %d, %Y"]


@dataclass
class NormalizationWarning:
    source: str
    record_key: str
    field: str
    original: str
    normalized: str
    rule: str


class NormalizationResult:
    def __init__(self):
        self.warnings: List[NormalizationWarning] = []
        self.vendor_alias_map: dict = {}

    def warn(self, source, record_key, field_name, original, normalized, rule):
        if str(original) != str(normalized):
            self.warnings.append(NormalizationWarning(source, record_key, field_name, str(original), str(normalized), rule))


def normalize_invoice_number(raw: str) -> str:
    """INV-001 / INV/001 / INV 001 / inv-001 -> INV001"""
    if raw is None:
        return ""
    s = re.sub(r"[\s\-/_.]", "", str(raw)).upper()
    return s


def normalize_vendor_name(raw: str) -> str:
    if raw is None:
        return ""
    s = raw.strip().lower()
    for suf in LEGAL_SUFFIXES:
        s = re.sub(suf, "", s)
    s = re.sub(r"[^\w\s&]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.title()


def normalize_gstin(raw: str) -> (str, bool):
    """Returns (normalized, is_valid). Invalid GSTIN is flagged, never dropped."""
    if raw is None:
        return "", False
    s = str(raw).strip().upper()
    valid = bool(GSTIN_RE.match(s))
    return s, valid


def normalize_amount(raw) -> Optional[Decimal]:
    """Strip currency symbols/commas -> Decimal. Never float."""
    if raw is None or raw == "":
        return None
    s = str(raw)
    s = re.sub(r"[₹$,\s]", "", s)
    s = s.replace("Rs.", "").replace("INR", "")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def normalize_date(raw: str) -> Optional[str]:
    """Parse multiple formats -> ISO-8601 string, or None if unparseable."""
    if raw is None or raw == "":
        return None
    s = str(raw).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s).date().isoformat()
    except ValueError:
        return None


def extract_reference_from_narration(narration: str) -> Optional[str]:
    """Regex/heuristic extraction of embedded invoice/reference numbers from bank narration."""
    if not narration:
        return None
    m = re.search(r"\b(INV[-/\s]?\d{3,6})\b", narration, re.IGNORECASE)
    if m:
        return normalize_invoice_number(m.group(1))
    m = re.search(r"\b(TXN-INV-\d{3,6})\b", narration, re.IGNORECASE)
    if m:
        return normalize_invoice_number(m.group(1).replace("TXN-", ""))
    return None


def build_vendor_alias_map(names: List[str]) -> dict:
    """Group raw vendor name strings that normalize to the same canonical form."""
    alias_map = {}
    for n in names:
        canon = normalize_vendor_name(n)
        alias_map.setdefault(canon, set()).add(n)
    return {k: sorted(v) for k, v in alias_map.items()}
