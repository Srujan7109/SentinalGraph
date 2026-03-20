from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn
import logging

from rule import run_receive_forward_rule


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="SentinelGraph — AI & Rule Engine",
    description="FastAPI intelligence layer: stateful rule evaluation for Money Mule detection.",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Transaction(BaseModel):
    tx_id: str = Field(..., description="UUID string")
    sender_id: str = Field(..., description="e.g. 'ACC_1045'")
    receiver_id: str = Field(..., description="e.g. 'ACC_9921'")
    amount: float = Field(..., description="e.g. 500.00")
    timestamp: str = Field(..., description="ISO 8601 format, e.g. '2026-03-17T14:30:00Z'")
    device_id: str = Field(..., description="e.g. 'DEV_ABC123'")


class AnalyzeRequest(BaseModel):
    transactions: List[Transaction]


class AnalyzeResponse(BaseModel):
    status: str
    flagged_accounts: List[str]



@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    summary="Run the Stateful Rule Engine on a batch of transactions",
)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    if not request.transactions:
        raise HTTPException(status_code=400, detail="Transaction list must not be empty.")

    logger.info(f"Received batch of {len(request.transactions)} transactions for analysis.")

    tx_dicts = [tx.model_dump() for tx in request.transactions]

    flagged = run_receive_forward_rule(tx_dicts)

    logger.info(f"Rule engine complete. Flagged accounts: {flagged}")

    return AnalyzeResponse(
        status="processed",
        flagged_accounts=flagged,
    )




@app.get("/health", summary="Health check")
def health():
    return {"status": "ok", "service": "backend-python"}



if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )