#!/usr/bin/env python3
"""Run the local Qwen model as an OpenAI-compatible chat server.

The Node ingest pipeline (ingest/classify-local.ts) already knows how to talk to
any OpenAI-compatible `/v1/chat/completions` endpoint. This script *is* that
endpoint, backed by the weights sitting in `models/qwen2.5-3b/`, so the 3B model
loads exactly once and stays warm across every classification batch.

Usage
-----
    pip install -r ingest/requirements.txt          # torch + transformers
    python3 ingest/serve_qwen.py                     # serves on :8080

Then point the ingest at it and run as usual:

    GV_LOCAL_URL=http://localhost:8080/v1 npm run ingest

Environment overrides
---------------------
    GV_QWEN_MODEL_DIR   path to the weights   (default: ../models/qwen2.5-3b)
    GV_QWEN_HOST        bind host             (default: 127.0.0.1)
    GV_QWEN_PORT        bind port             (default: 8080)
    GV_QWEN_DEVICE      cuda | mps | cpu      (default: auto-detect)
    GV_QWEN_MAX_TOKENS  generation cap        (default: 1536)
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_DEFAULT_MODEL_DIR = _HERE.parent / "models" / "qwen2.5-3b"

MODEL_DIR = Path(os.environ.get("GV_QWEN_MODEL_DIR", str(_DEFAULT_MODEL_DIR)))
HOST = os.environ.get("GV_QWEN_HOST", "127.0.0.1")
PORT = int(os.environ.get("GV_QWEN_PORT", "8080"))
MODEL_NAME = os.environ.get("GV_LOCAL_MODEL", "qwen2.5-3b")
DEFAULT_MAX_TOKENS = int(os.environ.get("GV_QWEN_MAX_TOKENS", "1536"))


def log(msg: str) -> None:
    print(f"[serve_qwen] {msg}", file=sys.stderr, flush=True)


def pick_device(preference: str | None) -> str:
    import torch

    if preference:
        return preference
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Engine:
    """Loads the model once and serializes generation (a single set of weights
    can't be shared by concurrent forward passes safely, so we lock)."""

    def __init__(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if not MODEL_DIR.exists():
            raise SystemExit(
                f"model dir not found: {MODEL_DIR}\n"
                "Set GV_QWEN_MODEL_DIR or place the Qwen weights under models/."
            )

        self.device = pick_device(os.environ.get("GV_QWEN_DEVICE"))
        dtype = torch.float32 if self.device == "cpu" else torch.bfloat16
        log(f"loading {MODEL_DIR.name} on {self.device} ({dtype})…")
        t0 = time.time()

        self.tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
        self.model = AutoModelForCausalLM.from_pretrained(
            str(MODEL_DIR),
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
        ).to(self.device)
        self.model.eval()
        self._lock = threading.Lock()
        log(f"ready in {time.time() - t0:.1f}s")

    def generate(self, messages: list[dict], *, temperature: float, max_tokens: int) -> str:
        import torch

        prompt = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)

        # temperature 0 → deterministic greedy; otherwise sample.
        do_sample = temperature > 0
        gen_kwargs = dict(
            max_new_tokens=max_tokens,
            do_sample=do_sample,
            pad_token_id=self.tokenizer.pad_token_id
            or self.tokenizer.eos_token_id,
        )
        if do_sample:
            gen_kwargs.update(temperature=temperature, top_p=0.8, top_k=20)

        with self._lock, torch.no_grad():
            out = self.model.generate(**inputs, **gen_kwargs)

        # Only decode the newly generated continuation.
        new_tokens = out[0][inputs["input_ids"].shape[1] :]
        return self.tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


ENGINE: Engine | None = None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # quiet the default stderr spam
        pass

    def do_GET(self) -> None:
        if self.path.rstrip("/").endswith("/models"):
            self._send(
                200,
                {"object": "list", "data": [{"id": MODEL_NAME, "object": "model"}]},
            )
        elif self.path.rstrip("/") in ("", "/health", "/healthz"):
            self._send(200, {"status": "ok", "model": MODEL_NAME})
        else:
            self._send(404, {"error": {"message": f"no route {self.path}"}})

    def do_POST(self) -> None:
        if not self.path.rstrip("/").endswith("/chat/completions"):
            self._send(404, {"error": {"message": f"no route {self.path}"}})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError) as e:
            self._send(400, {"error": {"message": f"bad request body: {e}"}})
            return

        messages = req.get("messages") or []
        if not messages:
            self._send(400, {"error": {"message": "messages[] is required"}})
            return

        temperature = float(req.get("temperature", 0) or 0)
        max_tokens = int(req.get("max_tokens") or DEFAULT_MAX_TOKENS)

        # If the caller asked for a JSON object, nudge the model to comply.
        if (req.get("response_format") or {}).get("type") == "json_object":
            messages = messages + [
                {"role": "system", "content": "Respond with a single valid JSON object only."}
            ]

        try:
            assert ENGINE is not None
            text = ENGINE.generate(
                messages, temperature=temperature, max_tokens=max_tokens
            )
        except Exception as e:  # surface generation errors to the Node caller
            log(f"generation error: {e}")
            self._send(500, {"error": {"message": str(e)}})
            return

        self._send(
            200,
            {
                "id": "chatcmpl-local",
                "object": "chat.completion",
                "model": req.get("model") or MODEL_NAME,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": text},
                        "finish_reason": "stop",
                    }
                ],
            },
        )


def main() -> None:
    global ENGINE
    ENGINE = Engine()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on http://{HOST}:{PORT}/v1  (model id: {MODEL_NAME})")
    log(f"point the ingest at it:  GV_LOCAL_URL=http://{HOST}:{PORT}/v1 npm run ingest")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
