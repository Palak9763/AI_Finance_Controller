import csv
import os
from .. import models

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def _load_csv(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def load_ground_truth():
    return _load_csv("ground_truth.csv")


def ingest_all(db):
    """Idempotent full reload of source tables from the synthetic data CSVs."""
    db.query(models.Invoice).delete()
    db.query(models.Gstr1Record).delete()
    db.query(models.Gstr2bRecord).delete()
    db.query(models.Gstr3bRecord).delete()
    db.query(models.TallyRecord).delete()
    db.query(models.BankTransaction).delete()
    db.commit()

    for r in _load_csv("invoices.csv"):
        db.add(models.Invoice(**r))
    for r in _load_csv("gstr1.csv"):
        db.add(models.Gstr1Record(**r))
    for r in _load_csv("gstr2b.csv"):
        db.add(models.Gstr2bRecord(**r))
    for r in _load_csv("gstr3b.csv"):
        db.add(models.Gstr3bRecord(**r))
    for r in _load_csv("tally.csv"):
        db.add(models.TallyRecord(**r))
    for r in _load_csv("bank.csv"):
        db.add(models.BankTransaction(**r))
    db.commit()

    return dict(
        invoices=db.query(models.Invoice).count(),
        gstr1=db.query(models.Gstr1Record).count(),
        gstr2b=db.query(models.Gstr2bRecord).count(),
        gstr3b=db.query(models.Gstr3bRecord).count(),
        tally=db.query(models.TallyRecord).count(),
        bank=db.query(models.BankTransaction).count(),
    )


def rows_as_dicts(db, model, exclude=("id",)):
    rows = db.query(model).all()
    out = []
    for r in rows:
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns if c.name not in exclude}
        out.append(d)
    return out
