
"""
음식 사진 분석 API.

[현재 내부 API]
POST /internal/ai/food-analyses

[주의]
- /internal/ai/... 는 FastAPI 내부 임시 경로
- /api/v1/ai/... 는 기획서의 외부 API 기준안
- 최종 경로 및 요청/응답 계약은 Spring Boot 담당자와 협의

[현재 구현]
- JPG, PNG 파일 수신
- 최대 10MB 파일 검증 (임시 제한)
- Pillow를 통한 실제 이미지 형식 검사
- 테스트용 음식 후보 3개 반환

[미구현]
- 실제 AI 모델 추론
- 음식 DB 조회 및 food_id 매핑
- 분석 작업 이력 DB 저장
- 사용자 인증 및 내부 서비스 간 인증

Mock 후보 및 신뢰도는 실제 사진 분석 결과가 아니다.
외부 공개 배포 전 접근 통제와 파일 검증 정책을 재검토한다.
"""

from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from schemas.food import FoodAnalysisResponse, FoodCandidate


router = APIRouter(
    prefix="/internal/ai",
    tags=["AI Food - Mock"],
)

MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
}


@router.post(
    "/food-analyses",
    response_model=FoodAnalysisResponse,
    summary="음식 사진 분석 테스트",
    description="이미지를 검증한 후 임시 음식 후보 3개를 반환합니다.",
)
async def analyze_food(
    file: UploadFile = File(...),
) -> FoodAnalysisResponse:

    try:
        # 1. 파일의 MIME 타입 검증.
        # 확장자나 MIME 타입만 신뢰하지 않고 실제 내용도 확인한다.
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail="JPG 또는 PNG 이미지만 업로드할 수 있습니다.",
            )

        # 2. 파일 크기 검증.
        # 무제한 읽기를 방지하기 위해 최대 크기 + 1바이트만 읽는다.
        content = await file.read(MAX_FILE_SIZE + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="비어 있는 파일입니다.",
            )

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="이미지 크기는 10MB 이하여야 합니다.",
            )

        # 3. 실제 이미지 데이터 검증.
        try:
            with Image.open(BytesIO(content)) as image:
                image_format = image.format
                image.verify()

            if image_format != ALLOWED_TYPES[file.content_type]:
                raise HTTPException(
                    status_code=415,
                    detail="파일 형식과 실제 이미지 형식이 일치하지 않습니다.",
                )

        except (UnidentifiedImageError, OSError, ValueError):
            raise HTTPException(
                status_code=400,
                detail="올바른 이미지 파일이 아닙니다.",
            )

        # 4. 개발용 임시 분석 결과 반환.
        # 사진의 실제 내용과 관계없이 동일한 후보를 반환한다.
        # 실제 모델 연동 시 이 부분을 교체한다.
        return FoodAnalysisResponse(
            source="mock",
            status="review_required",
            candidates=[
                FoodCandidate(
                    candidate_food_name="김치볶음밥",
                    confidence_score=0.75,
                ),
                FoodCandidate(
                    candidate_food_name="볶음밥",
                    confidence_score=0.18,
                ),
                FoodCandidate(
                    candidate_food_name="비빔밥",
                    confidence_score=0.07,
                ),
            ],
            note="개발용 임시 결과이며 실제 이미지 인식 결과가 아닙니다.",
        )

    finally:
        await file.close()
