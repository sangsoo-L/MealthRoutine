
"""
음식 사진 분석 API의 응답 모델.

[현재 상태]
- 개발용 Mock 응답
- 실제 음식 인식 모델 미연동
- 후보의 신뢰도는 테스트용 임의 수치

[향후 연동]
- 서춘호 팀원의 음식 인식 모델 연결
- Spring Boot 음식 DB의 food_id 매칭
- 사용자 음식 선택 및 수정은 Spring Boot에서 처리
"""

from typing import Literal

from pydantic import BaseModel, Field


class FoodCandidate(BaseModel):
    """음식 인식 후보 하나의 정보."""

    candidate_food_name: str
    confidence_score: float = Field(ge=0, le=1)

    # 실제 음식 DB 연동 전까지는 None.
    suggested_food_id: int | None = None


class FoodAnalysisResponse(BaseModel):
    """음식 사진 분석 결과."""

    source: Literal["mock"]
    status: Literal["review_required"]
    candidates: list[FoodCandidate]
    note: str
