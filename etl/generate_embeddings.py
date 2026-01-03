#!/usr/bin/env python3
"""
Generate embeddings for gold summaries and write a local RAG index.
This runs on demand (local) or from publish_data_gcs.py (CI) when OPENAI_API_KEY is set.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict

import requests
import time


DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"


def format_currency(amount):
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return "$0"
    if abs(value) >= 1e9:
        return f"${value / 1e9:.2f}B"
    if abs(value) >= 1e6:
        return f"${value / 1e6:.1f}M"
    return f"${value:,.0f}"


def format_money_flow_summary(data):
    revenue = data.get("revenue", {})
    expenditure = data.get("expenditure", {})
    balance = data.get("balance", {})
    top_revenue = revenue.get("topGroups", [])[:5]
    top_expense = expenditure.get("topGroups", [])[:5]

    lines = [
        f"MONEY FLOW DATA ({data.get('year')}):",
        f"Total Revenue: {format_currency(revenue.get('total', 0))}",
        f"Total Expenditure: {format_currency(expenditure.get('total', 0))}",
        f"Balance: {'Surplus' if balance.get('isSurplus') else 'Deficit'} of {format_currency(abs(balance.get('amount', 0)))}",
        "",
        "Top Revenue Sources:",
    ]
    for item in top_revenue:
        lines.append(f"- {item.get('label')}: {format_currency(item.get('amount', 0))} ({item.get('percentage', 0):.1f}%)")

    lines.append("")
    lines.append("Top Expenditure Categories:")
    for item in top_expense:
        lines.append(f"- {item.get('label')}: {format_currency(item.get('amount', 0))} ({item.get('percentage', 0):.1f}%)")

    return "\n".join(lines)


def format_capital_summary(data):
    top_wards = data.get("topWards", [])[:5]
    categories = data.get("categoryBreakdown", [])[:5]

    lines = [
        f"CAPITAL PROJECTS ({data.get('year')}):",
        f"Total Investment: {format_currency(data.get('totalInvestment', 0))}",
        f"Ward-Specific: {format_currency(data.get('wardSpecificInvestment', 0))} across {data.get('wardCount', 0)} wards",
        f"City-Wide: {format_currency(data.get('cityWideInvestment', 0))} ({data.get('cityWideProjectCount', 0)} projects)",
        "",
        "Top Wards by Investment:",
    ]
    for ward in top_wards:
        lines.append(
            f"- Ward {ward.get('ward_number')} ({ward.get('ward_name')}): "
            f"{format_currency(ward.get('totalAmount', 0))}, {ward.get('projectCount', 0)} projects"
        )

    lines.append("")
    lines.append("Top Categories:")
    for category in categories:
        lines.append(
            f"- {category.get('name')}: {format_currency(category.get('totalAmount', 0))} "
            f"({category.get('projectCount', 0)} projects)"
        )

    return "\n".join(lines)


def format_council_summary(data, label):
    metadata = data.get("metadata", {})
    categories = data.get("decision_categories", [])[:6]
    recent = data.get("recent_decisions", [])[:5]
    lobbying = data.get("lobbying_summary", {})

    lines = [
        f"COUNCIL DECISIONS ({label}):",
        f"Total Motions: {metadata.get('total_motions', 0)}",
        f"Passed: {metadata.get('motions_passed', 0)}",
        f"Failed: {metadata.get('motions_failed', 0)}",
        f"Pass Rate: {metadata.get('pass_rate', 0)}%",
        "",
        "Top Decision Categories:",
    ]
    for category in categories:
        lines.append(
            f"- {category.get('label')}: {category.get('total_motions', 0)} motions, "
            f"{category.get('pass_rate', 0):.1f}% pass rate"
        )

    lines.append("")
    lines.append("Recent Decisions:")
    for item in recent:
        lines.append(
            f"- {item.get('motion_title')} ({item.get('vote_outcome')}, "
            f"{item.get('vote_margin_percent')}% yes votes)"
        )

    if lobbying:
        lines.append("")
        lines.append("Lobbying Activity:")
        lines.append(f"- Active Registrations: {lobbying.get('active_registrations', 0)}")
        lines.append(f"- Recent Communications: {lobbying.get('recent_communications', 0)}")
        top_subjects = lobbying.get("top_subjects", [])
        if top_subjects:
            lines.append(f"- Top Subjects: {', '.join(top_subjects[:3])}")

    return "\n".join(lines)


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def collect_gold_chunks(gold_dir: Path) -> List[Dict]:
    chunks = []

    money_flow_dir = gold_dir / "money-flow"
    if money_flow_dir.exists():
        for path in sorted(money_flow_dir.glob("*.json")):
            if path.name in ("index.json", "trends.json"):
                continue
            data = load_json(path)
            year = data.get("year")
            chunks.append({
                "id": f"money-flow-{year}",
                "text": format_money_flow_summary(data),
                "metadata": {
                    "source": f"gold/money-flow/{path.name}",
                    "type": "money-flow",
                    "year": year
                }
            })

        trends_path = money_flow_dir / "trends.json"
        if trends_path.exists():
            trends = load_json(trends_path)
            chunks.append({
                "id": "money-flow-trends",
                "text": "MONEY FLOW TRENDS:\n" + json.dumps(trends, indent=2),
                "metadata": {
                    "source": "gold/money-flow/trends.json",
                    "type": "money-flow-trends",
                    "year": trends.get("latestYear")
                }
            })

    capital_dir = gold_dir / "capital"
    if capital_dir.exists():
        for path in sorted(capital_dir.glob("*.json")):
            if path.name in ("index.json", "trends.json"):
                continue
            data = load_json(path)
            year = data.get("year")
            chunks.append({
                "id": f"capital-{year}",
                "text": format_capital_summary(data),
                "metadata": {
                    "source": f"gold/capital/{path.name}",
                    "type": "capital",
                    "year": year
                }
            })

        trends_path = capital_dir / "trends.json"
        if trends_path.exists():
            trends = load_json(trends_path)
            chunks.append({
                "id": "capital-trends",
                "text": "CAPITAL TRENDS:\n" + json.dumps(trends, indent=2),
                "metadata": {
                    "source": "gold/capital/trends.json",
                    "type": "capital-trends",
                    "year": trends.get("latestYear")
                }
            })

    council_dir = gold_dir / "council-decisions"
    if council_dir.exists():
        summary_path = council_dir / "summary.json"
        if summary_path.exists():
            summary = load_json(summary_path)
            chunks.append({
                "id": "council-summary",
                "text": format_council_summary(summary, "Rolling Summary"),
                "metadata": {
                    "source": "gold/council-decisions/summary.json",
                    "type": "council-summary",
                    "year": summary.get("metadata", {}).get("year")
                }
            })

        for path in sorted(council_dir.glob("*.json")):
            if path.name in ("index.json", "summary.json"):
                continue
            data = load_json(path)
            year = data.get("metadata", {}).get("year")
            chunks.append({
                "id": f"council-{year}",
                "text": format_council_summary(data, f"{year}"),
                "metadata": {
                    "source": f"gold/council-decisions/{path.name}",
                    "type": "council",
                    "year": year
                }
            })

        trends_path = council_dir / "trends.json"
        if trends_path.exists():
            trends = load_json(trends_path)
            chunks.append({
                "id": "council-trends",
                "text": "COUNCIL TRENDS:\n" + json.dumps(trends, indent=2),
                "metadata": {
                    "source": "gold/council-decisions/trends.json",
                    "type": "council-trends",
                    "year": trends.get("latestYear")
                }
            })

    return chunks


def generate_embeddings(chunks: List[Dict], api_key: str, model: str, max_retries: int = 3):
    url = "https://api.openai.com/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    batch_size = 100
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start:start + batch_size]
        payload = {
            "model": model,
            "input": [item["text"] for item in batch]
        }
        for attempt in range(max_retries):
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=60)
                response.raise_for_status()
                result = response.json()
                embeddings = result.get("data", [])

                for item, embedding in zip(batch, embeddings):
                    item["embedding"] = embedding.get("embedding", [])
                break
            except requests.RequestException:
                if attempt >= max_retries - 1:
                    raise
                time.sleep(1 + attempt)


def generate_gold_embeddings(gold_dir: Path, output_path: Path = None):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required to generate embeddings.")

    model = os.environ.get("OPENAI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)

    chunks = collect_gold_chunks(gold_dir)
    if not chunks:
        raise RuntimeError("No gold chunks found to embed.")

    generate_embeddings(chunks, api_key, model)

    dimensions = len(chunks[0].get("embedding", [])) if chunks else 0
    payload = {
        "version": "1.0",
        "model": model,
        "dimensions": dimensions,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(chunks),
        "chunks": chunks
    }

    output_path = output_path or (gold_dir / "rag" / "index.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    return output_path


if __name__ == "__main__":
    config_path = Path("etl/config.yaml")
    gold_path = Path("data/gold")
    if config_path.exists():
        from config_loader import load_config
        config = load_config()
        storage = config.get("storage", {})
        gold_path = Path(storage.get("gold_dir", "data/gold"))

    output = generate_gold_embeddings(gold_path)
    print(f"Wrote embeddings index: {output}")
