from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Transaction(BaseModel):
    sender: str
    receiver: str
    amount: float

@app.get("/")
def health():
    return {"status": "AI Layer Online"}

@app.post("/analyze")
def analyze(tx: Transaction):
    is_suspicious = tx.amount > 10000
    return {
        "risk_score": 0.95 if is_suspicious else 0.1,
        "flag": is_suspicious,
        "message": "High Value Transaction Detected" if is_suspicious else "Normal"
    }