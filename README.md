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
