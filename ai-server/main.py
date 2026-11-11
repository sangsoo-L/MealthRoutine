
"""
MealthRoutine AI Backend - FastAPI 애플리케이션 진입점

[전체 시스템 구조]
React → Spring Boot → FastAPI → AI 모델 / 외부 LLM

[서버 역할]
- FastAPI: AI 추론, 추천 결과 생성, 요청·응답 데이터 검증
- Spring Boot: 사용자 인증, 권한, 비즈니스 로직, DB 저장
- React: 사용자 인터페이스

[API 경로 관련 주의사항]
기획서의 /api/v1/ai/... 경로는 외부 서비스 API 기준안이다.
FastAPI 내부 경로와 반드시 같을 필요는 없다.

현재 /internal/ai/... 경로는 개발용 임시 규칙이며,
Spring Boot 담당자와 협의한 후 확정해야 한다.
"""

from fastapi import FastAPI

from routers.exercise import router as exercise_router
from routers.diet import router as diet_router
from routers.food import router as food_router
from routers.llm_preview import router as llm_preview_router


app = FastAPI(
    title="MealthRoutine AI Server",
    description="밀스루틴 AI 백엔드 API",
    version="0.1.0",
)

app.include_router(exercise_router)
app.include_router(diet_router)
app.include_router(food_router)
app.include_router(llm_preview_router)

@app.get("/health")
def health_check() -> dict[str, str]:
    """AI 서버의 실행 상태를 확인하는 엔드포인트."""
    return {"status": "ok"}
