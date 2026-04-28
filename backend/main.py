"""Entrypoint for hosts (e.g. Render) that run `python main.py` by default."""
import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
    )
