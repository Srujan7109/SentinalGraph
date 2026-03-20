from typing import List, Dict


def run_receive_forward_rule(transactions: List[Dict]) -> List[str]:

    total_received: Dict[str, float] = {}
    for tx in transactions:
        receiver = tx.get("receiver_id")
        amount = float(tx.get("amount", 0.0))
        if receiver:
            total_received[receiver] = total_received.get(receiver, 0.0) + amount

    total_sent: Dict[str, float] = {}
    for tx in transactions:
        sender = tx.get("sender_id")
        amount = float(tx.get("amount", 0.0))
        if sender:
            total_sent[sender] = total_sent.get(sender, 0.0) + amount


    flagged_accounts: List[str] = []

    for account_id, received in total_received.items():
        if received <= 0:
            continue

        sent = total_sent.get(account_id, 0.0)
        forward_ratio = sent / received

        if forward_ratio >= 0.90:
            flagged_accounts.append(account_id)

    return flagged_accounts