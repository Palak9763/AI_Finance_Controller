from pydantic import BaseModel
from typing import Optional, List, Any, Dict


class ReviewAction(BaseModel):
    actor: Optional[str] = "finance_reviewer"
    reason: Optional[str] = None


class InvestigateRequest(BaseModel):
    provider: Optional[str] = None  # force "Demo AI Provider" or "OpenAI Agent"; default auto-detect
