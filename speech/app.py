"""Run: python -m uvicorn app:app --app-dir speech --host 127.0.0.1 --port 8765."""
import hmac
import os
from contextlib import asynccontextmanager
from email.parser import BytesParser
from email.policy import default
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from engine import Engine, MAX_BYTES

engine = None
busy = Lock()


@asynccontextmanager
async def lifespan(app):
    global engine
    engine = await run_in_threadpool(Engine, os.getenv("LUMA_ASR_MODEL", "paraformer"),
                                   os.getenv("LUMA_ASR_DEVICE", "cpu"))
    yield
    engine = None


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"ready": engine is not None, "model": engine.name if engine else None}


@app.post("/v1/audio/transcriptions")
async def transcribe(request: Request):
    token = os.getenv("LUMA_ASR_TOKEN", "")
    if token:
        if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + token):
            raise HTTPException(401, "unauthorized")
    elif not request.client or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(403, "loopback_only_without_token")
    if engine is None:
        raise HTTPException(503, "model_not_ready")
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data;") or len(content_type) > 200:
        raise HTTPException(415, "multipart_required")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BYTES + 16384:
            raise HTTPException(413, "audio_too_large")
        data.extend(chunk)
    message = BytesParser(policy=default).parsebytes(
        ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + data)
    parts = list(message.iter_parts())
    if not 1 <= len(parts) <= 6:
        raise HTTPException(400, "invalid_fields")
    fields = {}
    for part in parts:
        name = part.get_param("name", header="content-disposition")
        if name in fields or name not in {"file", "model", "language", "response_format", "hotwords"}:
            raise HTTPException(400, "invalid_fields")
        fields[name] = part.get_payload(decode=True) or b""
    if any(len(value) > 12000 for name, value in fields.items() if name != "file"):
        raise HTTPException(400, "field_too_large")
    if fields.get("model", b"").decode(errors="replace") != engine.name:
        raise HTTPException(400, "configured_model_mismatch")
    if not busy.acquire(blocking=False):
        raise HTTPException(429, "asr_busy")
    try:
        text = await run_in_threadpool(engine.transcribe, fields.get("file", b""),
                                      fields.get("hotwords", b"{}").decode(errors="replace"),
                                      fields.get("language", b"zh").decode(errors="replace"))
        if not text:
            raise HTTPException(422, "voice_no_speech")
        return {"text": text}
    except ValueError:
        raise HTTPException(400, "invalid_audio_or_model_input") from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "asr_failed") from None
    finally:
        busy.release()
