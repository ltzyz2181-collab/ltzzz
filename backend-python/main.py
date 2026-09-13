"""
LTZZZ multi-model roundtable (FastAPI template).
Keys via env only. No fund custody.
"""
import os
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

SYSTEM = (
    "你是 LTZZZ AGI 共管理协议下的顾问席。"
    "无服务器所有权，无资金托管权。"
    "只做分析与简短建议；禁止要求转账、索要密钥、宣称接管后台。"
)

app = FastAPI(title="ltzzz-roundtable", version="0.1.0")
origins = [o.strip() for o in os.getenv("CORS_ORIGIN", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RoundIn(BaseModel):
    text: str = Field(..., min_length=1)
    seats: List[str] = Field(default_factory=lambda: ["gpt", "claude"])


async def openai_compat(base: str, key: str, model: str, text: str) -> dict:
    if not key:
        return {"ok": False, "text": "未配置 API Key"}
    url = base.rstrip("/") + "/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": text},
        ],
        "temperature": 0.4,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
        )
        j = r.json()
        if r.status_code >= 400:
            return {"ok": False, "text": str(j)[:500]}
        content = j.get("choices", [{}])[0].get("message", {}).get("content", str(j)[:300])
        return {"ok": True, "text": content}


async def anthropic_call(text: str) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        return {"ok": False, "text": "未配置 API Key"}
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 800,
                "system": SYSTEM,
                "messages": [{"role": "user", "content": text}],
            },
        )
        j = r.json()
        if r.status_code >= 400:
            return {"ok": False, "text": str(j)[:500]}
        parts = j.get("content") or []
        content = "".join(p.get("text", "") for p in parts) or str(j)[:300]
        return {"ok": True, "text": content}


async def run_seat(seat: str, text: str) -> dict:
    if seat == "gpt":
        return await openai_compat(
            "https://api.openai.com/v1",
            os.getenv("OPENAI_API_KEY", ""),
            os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            text,
        )
    if seat == "deepseek":
        return await openai_compat(
            "https://api.deepseek.com/v1",
            os.getenv("DEEPSEEK_API_KEY", ""),
            os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            text,
        )
    if seat == "doubao":
        return await openai_compat(
            os.getenv("DOUBAO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
            os.getenv("DOUBAO_API_KEY", ""),
            os.getenv("DOUBAO_MODEL", ""),
            text,
        )
    if seat == "grok":
        return await openai_compat(
            "https://api.x.ai/v1",
            os.getenv("XAI_API_KEY", ""),
            os.getenv("XAI_MODEL", "grok-3"),
            text,
        )
    if seat == "claude":
        return await anthropic_call(text)
    return {"ok": False, "text": "unknown seat"}


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "ltzzz-roundtable-py",
        "protocol": "AGI-CO-MANAGEMENT v0.1",
        "custody": False,
        "seats_configured": {
            "gpt": bool(os.getenv("OPENAI_API_KEY")),
            "claude": bool(os.getenv("ANTHROPIC_API_KEY")),
            "deepseek": bool(os.getenv("DEEPSEEK_API_KEY")),
            "doubao": bool(os.getenv("DOUBAO_API_KEY")),
            "grok": bool(os.getenv("XAI_API_KEY")),
        },
    }


@app.post("/round")
async def round_table(body: RoundIn, x_lab_token: Optional[str] = Header(default=None)):
    expected = os.getenv("LAB_TOKEN") or ""
    if expected and x_lab_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")
    replies = []
    for seat in body.seats:
        out = await run_seat(seat, body.text)
        replies.append({"seat": seat, **out})
    return {
        "protocol": "AGI-CO-MANAGEMENT v0.1",
        "note": "顾问席回复；无资金动作",
        "replies": replies,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8787")))
