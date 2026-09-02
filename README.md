
# AI Finance Controller

A working prototype of an AI-assisted finance reconciliation controller. It closes one real
finance-operations loop end to end:

**reconciliation → exception → AI investigation → human approval → audit log**

over a synthetic batch of GST/Tally/Bank/Invoice records, and reports real, measured
performance — nothing on the dashboard is a literal constant in the code.

## 0. The one rule that matters

> **Deterministic code does financial logic. AI never does.**

Amount comparison, GSTIN matching, invoice-number normalization, date tolerance, duplicate
detection, and status classification are pure Python (`backend/app/services/reconciliation.py`,
`normalization.py`). AI (`ai_agent.py`) is only used for exception investigation, root-cause
narrative, evidence retrieval (RAG), and recommendation text — and it can never write to
financial records or self-approve its own recommendation.

## 1. Architecture

```
Synthetic Data (6 sources)
        ↓
   Normalization Layer        ← deterministic  (normalization.py)
        ↓
 Deterministic Reconciliation ← deterministic  (reconciliation.py, 5-level matching hierarchy)
        ↓
 MATCHED / MATCHED_WITH_TOLERANCE / PARTIAL_MATCH / MISMATCH / MISSING / DUPLICATE / AMBIGUOUS / REVIEW_REQUIRED
        ↓
     Exceptions
        ↓
  AI Investigation Agent      ← AI (RAG + reasoning), read-only tools  (ai_agent.py, rag.py)
        ↓
   Root Cause + Evidence + Recommendation + Confidence
        ↓
   Human Review (Approve / Reject / Pending)
        ↓
      Audit Log
```

Everywhere this diagram's boundary is crossed in code, there's a comment marking it
`# deterministic` or `# AI` so it's auditable at a glance.

### Backend layout

```
backend/
  app/
    main.py                 FastAPI app, full API surface
    models.py                SQLAlchemy schema (14 tables)
    database.py               SQLite by default, swap via DATABASE_URL
    services/
      data_generator.py       synthetic data + ground truth (18 baked-in edge cases)
      normalization.py        deterministic normalization + NormalizationWarning trail
      reconciliation.py       deterministic 5-level matching hierarchy + tolerance engine
      evaluation.py           real metrics computed from an actual run
      anomaly.py               z-score/IQR (+ optional IsolationForest) outlier detection
      ai_agent.py               AI investigation state machine, Demo + OpenAI providers
      rag.py / knowledge_seed.py   TF-IDF retrieval over seeded finance policy docs
      ingestion.py              loads synthetic CSVs into SQLite
      audit.py                  audit log writer
  tests/                      14 tests incl. one true end-to-end test
  data/                       generated CSVs (invoices, gstr1, gstr2b, gstr3b, tally, bank,
                               ground_truth) — ground_truth.csv is NEVER read by reconciliation.py
frontend/
  src/
    pages/                    Dashboard, Reconciliation, Investigation Workspace, Anomalies,
                               Human Reviews, Audit Logs, Knowledge Base, Transactions, Settings
    components/                Layout, StatusBadge, Toast, ConfirmDialog, EmptyState, Spinner
    api/client.ts               typed axios client, one function per endpoint
```

## 2. Running it locally — zero external services

Requires Python 3.10+ and Node 18+. No API keys, no Postgres, no Redis needed.

```bash
# 1. Generate the synthetic dataset (6 sources + ground truth)
cd backend
python3 app/services/data_generator.py

# 2. Install backend deps and run tests
pip install -r requirements.txt   # or see the pip install line below
python3 -m pytest app/tests/ -v

# 3. Start the API (SQLite, auto-created on first run)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. In a second terminal: frontend
cd frontend
npm install
npm run dev            # proxies /api and /health to localhost:8000
```

Open `http://localhost:5173`. Click **Run Reconciliation** on the Dashboard — everything else
follows from that one real run.

If `backend/requirements.txt` isn't present in your checkout, install directly:
```bash
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic python-multipart scikit-learn numpy pandas python-dateutil
```

### Enabling the real AI provider (optional)

By default every investigation runs on the rule-based **Demo AI Provider** — no network calls,
never breaks on flaky wifi. To use a real model instead, set an environment variable before
starting the backend:

```bash
export OPENAI_API_KEY=sk-...
```

The UI always labels which provider produced each investigation. If the OpenAI call fails for
any reason (no network, bad key, rate limit), the agent automatically falls back to the Demo AI
Provider so the demo never breaks.

## 3. Demo script

1. **Dashboard** — empty state, all-zero. Click **Run Reconciliation** — watch ~100 records
   process live in well under a second.
2. Dashboard updates with a real match rate, resolution rate, and accuracy-vs-ground-truth
   number, plus a live status-breakdown chart.
3. **Reconciliation** page — filter to `MISMATCH`, pick one exception, click **Investigate →**.
4. **Investigation Workspace** — watch the agent's stage-by-stage status
   (Understand → Collect → RAG search → Analyze → Root Cause → Recommendation → Confidence Check
   → Human Review), then see the cited policy document, evidence trail (each item tagged
   FOUND_EVIDENCE / INFERENCE / UNKNOWN), confidence, and risk level.
5. Click **Approve** or **Reject** — the review state flips immediately and an audit log entry
   appears in **Audit Logs** with actor, reason, and timestamp.
6. Open the evaluation numbers on the Dashboard again — accuracy against ground truth,
   resolution rate, exception count, throughput — all still traceable to the one real run.
7. Narrate, one sentence each: *"this classification was deterministic code; this explanation
   was the AI, grounded in retrieved policy; this decision was a human."*

## 4. What's real vs. what's out of scope

**Tier 1 (must-have) — done and demo-solid:** synthetic data + ground truth, normalization,
deterministic reconciliation with all 8 statuses, evaluation engine with confusion matrix,
full FastAPI surface, dashboard + reconciliation table on real API data.

**Tier 2 (should-have) — done:** exception queue, AI investigation agent (plain-Python state
machine — see note below), structured JSON output with tagged evidence, RAG-backed policy
citations, human approval workflow, audit log.

**Tier 3 (nice-to-have) — implemented at reduced scope:** z-score/IQR anomaly detection with
optional IsolationForest compositing is included. Full Postgres/pgvector/Supabase and a
Redis-backed async job queue were **not** built — the spec explicitly marks these optional, and
the synchronous SQLite path meets the "zero external services" requirement on its own. Swapping
in Postgres only requires changing `DATABASE_URL`; the schema is written to be portable.

**LangGraph vs. plain state machine:** the AI investigation agent is implemented as a plain
Python function with the exact same node names LangGraph would use
(`Understand Exception → Collect Related Records → Search Finance Knowledge (RAG) → Analyze
Evidence → Identify Root Cause → Generate Recommendation → Confidence Check → Human Review`).
The spec treats this as an equally valid fallback — the graph shape matters more than the
runtime framework, and this keeps the demo dependency-free.

## 5. Known limitations (honesty over polish)

- **GSTR-2B ITC eligibility isn't cross-checked as its own matching dimension.** The `itc_mismatch`
  edge case (GSTR-2B marks ITC ineligible on an otherwise-clean invoice) is correctly retrieved
  and explained by the AI investigation agent once flagged, but the *deterministic* matching
  hierarchy currently classifies these as MATCHED rather than PARTIAL_MATCH, because it compares
  invoice/Tally/Bank amounts and doesn't yet treat `itc_eligible` as a classification input. This
  is the main source of the ~3% gap between 100% and the measured 96.97% accuracy against ground
  truth. Documented rather than hidden, per the "no fabricated numbers" principle — a real fix
  would add ITC eligibility as an explicit Level in the matching hierarchy.
- **GSTR-3B summary variance** is generated as an edge case and stored, but is not yet surfaced
  as its own exception type in the queue (it has no invoice-level key to join to). It's visible
  via the `gstr3b_records` table and ground truth, but doesn't yet appear as a UI exception card.
- **Ambiguous bank-settlement detection** (multiple invoices, same vendor/amount, one shared
  generic bank narration) is handled by comparing normalized vendor+amount candidates. It's
  deliberately conservative — it will not always catch every conceivable ambiguity pattern
  outside the specific edge case the generator constructs.
- **Anomaly detection** requires at least 4 transactions for a given vendor to compute a
  meaningful distribution; vendors with fewer transactions are skipped rather than flagged on
  insufficient data.
- **OpenAI real-mode** is implemented and wired but untested against a live key in this
  environment (sandboxed network does not reach `api.openai.com`); the demo path (no key) is
  the one that's been fully exercised end to end.

## 6. Testing

```bash
cd backend
python3 -m pytest app/tests/ -v
```

14 tests: 5 normalization, 6 reconciliation (exact match, tolerance, mismatch, missing,
duplicate, invoice-number-variant), 1 evaluation-metrics, 1 "never reads ground truth"
guardrail, and 1 true end-to-end test (synthetic data → reconciliation → evaluation →
API-shaped output), which also asserts accuracy stays above 80% and every required status
appears in a real run.

## 7. Security notes

- The AI agent's tools (`get_gstr_record`, `get_tally_record`, `get_bank_transaction`,
  `get_invoice`, `find_related_transactions`, `run_reconciliation`, `get_anomaly_details`,
  `search_finance_knowledge`) are all read-only. `create_review` is the only write path, and it
  can only ever create a `PENDING` review — the agent cannot call anything that sets `APPROVED`.
- No API keys are ever sent to or stored in the frontend bundle; `OPENAI_API_KEY` is read
  server-side only.
- The global exception handler strips stack traces from all API error responses.
=======
# AI Financial Controller

An AI-powered *finance reconciliation agent** that reconciles financial records across multiple sources, investigates exceptions, and reports measurable resolution performance.

Built for the **Razorpay AI Buildathon — AI Finance Controller** track.

---

## 🎯 Problem

Finance teams still spend significant time manually reconciling records across systems such as:

* GSTR-2B
* Tally/accounting systems
* Bank statements

The challenge is not simply generating an answer — it is **verifying large batches of financial records accurately and knowing when the system should not make a decision**.

This project focuses on closing one finance-ops loop:

> **Multi-source financial reconciliation**

The system processes a batch of 100+ synthetic records, identifies matches and discrepancies, investigates exceptions, and reports its accuracy and unresolved cases.

---

## 🚀 What the Agent Does

```text
GSTR-2B ──┐
          │
Tally ────┼──→ Normalize → Match → Investigate → Resolve
          │                                      │
Bank ─────┘                                      ▼
                                           ┌─────┴─────┐
                                           │           │
                                        Resolved   Unresolved
                                           │           │
                                           └─────┬─────┘
                                                 ▼
                                          Batch Evaluation
```

### Core capabilities

* Multi-source data ingestion
* Data normalization
* Deterministic record matching
* Fuzzy/partial matching
* Duplicate detection
* Amount and date discrepancy detection
* AI-powered exception investigation
* Evidence-based resolution
* Confidence scoring
* Unresolved exception reporting
* Batch-level performance metrics
* Ground-truth evaluation

---

## 📊 Synthetic Dataset

The prototype uses synthetic financial data so that no real company or customer information is exposed.

### Dataset

| Source       | Records |
| ------------ | ------: |
| GSTR-2B      |     120 |
| Tally        |     125 |
| Bank         |     120 |
| Ground Truth |     120 |

The dataset intentionally contains different reconciliation scenarios:

| Scenario        | Records |
| --------------- | ------: |
| Exact Match     |      80 |
| Partial Match   |      12 |
| Amount Mismatch |      12 |
| Missing GST     |       7 |
| Duplicate       |       5 |
| Ambiguous       |       4 |
| **Total**       | **120** |

The `ground_truth.csv` file is used **only for evaluation** and is not exposed to the agent during reconciliation.

---

## 🧠 Reconciliation Strategy

The system follows a layered approach rather than sending every record directly to an LLM.

### 1. Deterministic Matching

Records are first matched using reliable financial identifiers:

* Invoice number
* GSTIN
* Amount
* Vendor
* Transaction date

Clear matches are resolved without using an LLM.

### 2. Exception Detection

Records that cannot be confidently matched are classified as:

* Partial match
* Amount mismatch
* Missing record
* Duplicate
* Ambiguous match

### 3. AI Investigation

Exceptions are passed to the AI agent.

The agent can:

* Retrieve related financial records
* Compare source values
* Search relevant financial knowledge
* Analyze discrepancies
* Determine whether sufficient evidence exists
* Provide an explanation
* Recommend resolution or leave the case unresolved

### 4. Safe Failure

The agent does **not** force a decision when evidence is insufficient.

Instead:

```text
Insufficient evidence
        ↓
UNRESOLVED
        ↓
Human review
```

This makes the system more trustworthy for financial workflows.

---

## 📈 Evaluation

The system evaluates the complete batch rather than relying on cherry-picked examples.

Example output:

```text
Batch Size:              120

Records Processed:       120
Exact Matches:             XX
AI Resolved:               XX
Unresolved:                 XX

Resolution Rate:           XX%
Accuracy:                  XX%
Processing Time:           XX seconds
Throughput:                XX records/sec
```

### Exception report

Every unresolved case is reported with:

* Invoice ID
* Source records
* Difference
* Detected issue
* Evidence
* Confidence
* Reason for unresolved status

Example:

```text
INV-0051

Issue:
Amount mismatch

GSTR-2B:       ₹18,500
Tally:         ₹18,500
Bank:          ₹17,900

Difference:    ₹600

AI Finding:
Possible settlement adjustment.

Confidence:
84%

Status:
REQUIRES REVIEW
```

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │   Synthetic Data    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
           GSTR-2B           Tally             Bank
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Data Normalization  │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Reconciliation      │
                    │ Engine              │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                 Matched              Exceptions
                                          │
                                          ▼
                               ┌──────────────────┐
                               │ LangGraph Agent  │
                               └────────┬─────────┘
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                       Tools           RAG       Anomaly Detection
                         │              │              │
                         └──────────────┼──────────────┘
                                        ▼
                                AI Investigation
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                          Resolved            Unresolved
                              │                   │
                              └─────────┬─────────┘
                                        ▼
                                  Evaluation
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                      Accuracy      Throughput     Exceptions
```

---

## 🛠️ Tech Stack

### Backend

* Python
* FastAPI

### Data Processing

* Pandas
* NumPy

### AI / Agents

* OpenAI API
* LangGraph
* RAG

### Database

* PostgreSQL
* pgvector
* Supabase

### Matching & Detection

* Deterministic matching
* Fuzzy matching
* Rule-based validation
* Anomaly detection
* Scikit-learn

### Infrastructure

* Redis
* Background processing

---

## 📁 Project Structure

```text
AI_Financial_Controller/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── agents/
│   │   ├── reconciliation/
│   │   ├── rag/
│   │   ├── models/
│   │   └── services/
│   │
│   ├── requirements.txt
│   └── main.py
│
├── frontend/
│   └── ...
│
├── data/
│   ├── gstr2b.csv
│   ├── tally.csv
│   ├── bank.csv
│   └── ground_truth.csv
│
├── evaluation/
│   ├── metrics.py
│   └── reports/
│
├── README.md
├── .gitignore
└── requirements.txt
```

---

## 🔄 Example Workflow

### Input

Three sources contain:

```text
GSTR-2B
INV-0051 → ₹18,500

Tally
INV-0051 → ₹18,500

Bank
INV-0051 → ₹17,900
```

### Reconciliation

```text
Invoice identified
        ↓
GST record found
        ↓
Tally record found
        ↓
Bank transaction found
        ↓
Amount difference detected
        ↓
AI investigation
```

### Agent decision

```text
Difference: ₹600

Possible settlement adjustment.

Confidence: 84%

Status: Review required
```

The agent records the decision and includes the case in the batch evaluation.

---

## 🔐 Data & Privacy

This repository uses **synthetic financial data only**.

No real:

* Customer information
* GST records
* Bank transactions
* Company financial records

are required for the prototype.

API keys and credentials should never be committed to the repository.

Use environment variables:

```env
OPENAI_API_KEY=your_key
DATABASE_URL=your_database_url
REDIS_URL=your_redis_url
```

---

## ⚙️ Local Setup

### Clone the repository

```bash
git clone <your-repository-url>
cd AI_Financial_Controller
```

### Create virtual environment

```bash
python -m venv venv
```

Activate it:

**Windows**

```bash
venv\Scripts\activate
```

**Linux/macOS**

```bash
source venv/bin/activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

### Configure environment variables

Create a `.env` file:

```env
OPENAI_API_KEY=
DATABASE_URL=
REDIS_URL=
```

### Start FastAPI

```bash
uvicorn backend.main:app --reload
```

---

## 🧪 Evaluation Philosophy

The project is designed around three principles:

### 1. Throughput

Can the agent process a meaningful batch rather than a single example?

### 2. Measured Accuracy

Does the agent's output agree with a known ground truth?

### 3. Honest Exceptions

Does the system know when it **cannot confidently resolve a financial discrepancy**?

A successful system is not one that claims to resolve 100% of cases.

A successful system is one that can clearly distinguish:

```text
CONFIDENTLY RESOLVED
        vs
REQUIRES HUMAN REVIEW
```
---

## 🎯 Goal

The goal is to demonstrate an AI agent that can take a repetitive finance-ops workflow from:

**Raw financial records → reconciliation → investigation → resolution → measurable evaluation**

while maintaining an explicit exception path for cases where automation should stop.

---

## 👤 Project

**AI Financial Controller**

Built for the **Razorpay AI Buildathon — AI Finance Controller Track**.
>>>>>>> f680f21f973242cfaea5147ef60a5ea771816497
