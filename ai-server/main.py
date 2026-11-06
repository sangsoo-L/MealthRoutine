
from fastapi import FastAPI

app = FastAPI(
    title="MealthRoutine AI Server",
    description="밀스루틴 AI 백엔드 API",
    version="0.1.0",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
