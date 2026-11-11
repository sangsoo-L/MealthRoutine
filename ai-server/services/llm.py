"""외부 LLM 호출을 위한 공통 서비스 (아직 기존 Mock API와 연결하지 않음).

[담당 범위]
- FastAPI 내부에서 외부 LLM을 호출하고, 응답을 Pydantic으로 검증한다.
- 사용자 인증, 음식·운동 DB 조회, 결과 저장은 Spring Boot 담당이다.

[현재 단계]
- 호출할 제공업체·모델·API 키가 아직 확정되지 않았다.
- 기본값은 비활성화이며, 설정 전에는 절대로 외부 API를 호출하지 않는다.
- 표준 Chat Completions 형식의 *호환 API*에만 실제 HTTP 호출을 지원한다.
  Claude/Gemini 고유 API 등은 추후 별도 구현이 필요할 수 있다.
- 기존 운동·식단·음식 사진 Mock 라우터는 수정하거나 교체하지 않는다.

[보안 주의]
- API 키와 사용자 입력/응답을 로그에 남기지 않는다.
- LLM 응답을 신뢰하지 않는다. 반드시 응답 스키마와 DB 식별자를 검증한다.
- 건강·영양·알레르기 관련 추천 결과는 추가 검증 없이 확정하지 않는다.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, TypeVar
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from pydantic import BaseModel, ValidationError


OutputModel = TypeVar("OutputModel", bound=BaseModel)
MAX_RESPONSE_BYTES = 1_048_576  # 비정상적으로 큰 응답 방지: 1 MiB


class LLMError(Exception):
    """LLM 서비스 관련 오류의 공통 부모 클래스."""


class LLMConfigurationError(LLMError):
    """LLM 제공업체·API 키·URL·모델 설정 오류."""


class LLMRequestError(LLMError):
    """LLM HTTP 호출 실패 또는 응답 지연."""


class LLMResponseError(LLMError):
    """LLM 응답 JSON 구조나 Pydantic 검증 실패."""


@dataclass(frozen=True)
class LLMSettings:
    """환경변수 기반 LLM 설정. 값 자체를 코드에 하드코딩하지 않는다."""

    provider: str
    api_url: str
    api_key: str
    model: str
    timeout_seconds: float

    @classmethod
    def from_env(cls) -> "LLMSettings":
        # provider를 명시적으로 활성화하기 전까지는 기존 Mock API만 사용한다.
        raw_timeout = os.getenv("LLM_TIMEOUT_SECONDS", "30")
        try:
            timeout_seconds = float(raw_timeout)
        except ValueError as exc:
            raise LLMConfigurationError("LLM_TIMEOUT_SECONDS는 숫자여야 합니다.") from exc

        return cls(
            provider=os.getenv("LLM_PROVIDER", "disabled").strip().lower(),
            api_url=os.getenv("LLM_API_URL", "").strip(),
            api_key=os.getenv("LLM_API_KEY", "").strip(),
            model=os.getenv("LLM_MODEL", "").strip(),
            timeout_seconds=timeout_seconds,
        )

    def validate(self) -> None:
        if self.provider == "disabled":
            raise LLMConfigurationError(
                "LLM이 비활성화되어 있습니다. 제공업체 확정 후 LLM_PROVIDER를 설정하세요."
            )
        if self.provider != "openai_compatible":
            raise LLMConfigurationError(
                "현재는 openai_compatible 방식만 지원합니다."
            )
        if not (self.api_url and self.api_key and self.model):
            raise LLMConfigurationError(
                "LLM_API_URL, LLM_API_KEY, LLM_MODEL 설정이 필요합니다."
            )
        if not 1 <= self.timeout_seconds <= 120:
            raise LLMConfigurationError(
                "LLM_TIMEOUT_SECONDS는 1~120초 범위여야 합니다."
            )

        parsed = urlparse(self.api_url)
        local_http = parsed.scheme == "http" and parsed.hostname in {
            "localhost", "127.0.0.1"
        }
        # API 키가 평문 네트워크 구간으로 전송되지 않도록 외부 HTTP 주소는 거부.
        if not parsed.hostname or (parsed.scheme != "https" and not local_http):
            raise LLMConfigurationError(
                "LLM_API_URL은 HTTPS 주소여야 합니다(로컬 HTTP 테스트만 예외)."
            )
        if parsed.username or parsed.password or parsed.fragment:
            raise LLMConfigurationError("LLM_API_URL에 인증정보나 fragment를 포함하지 마세요.")


class LLMClient(Protocol):
    """향후 제공업체별 구현체가 공통으로 따를 인터페이스."""

    async def generate_json(
        self,
        *,
        system_prompt: str,
        input_data: Mapping[str, Any],
        response_model: type[OutputModel],
    ) -> OutputModel:
        """LLM에 JSON 생성을 요청하고 스키마 검증된 결과를 반환한다."""
        ...


class OpenAICompatibleLLMClient:
    """Chat Completions 호환 HTTP API용 최소 구현.

    주의: 명칭은 *호환 통신 형식*을 의미하며, 특정 업체를 확정한 것이 아니다.
    일부 제공업체는 별도의 response_format·헤더·인증 규칙을 요구할 수 있다.
    """

    def __init__(self, settings: LLMSettings) -> None:
        settings.validate()
        self._settings = settings

    async def generate_json(
        self,
        *,
        system_prompt: str,
        input_data: Mapping[str, Any],
        response_model: type[OutputModel],
    ) -> OutputModel:
        if not system_prompt.strip():
            raise ValueError("system_prompt는 비어 있을 수 없습니다.")

        # 입력값은 문자열 연결 대신 JSON으로 직렬화해서 명확히 전달한다.
        # 데이터에 포함된 지시문이 보안상 안전하다는 뜻은 아니므로 별도 검증 필요.
        try:
            user_content = json.dumps(
                dict(input_data), ensure_ascii=False, allow_nan=False
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("input_data는 JSON으로 표현할 수 있어야 합니다.") from exc

        payload = {
            "model": self._settings.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                    + "\n반드시 JSON 객체 하나만 반환하고 마크다운 코드블록은 사용하지 마세요.",
                },
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.2,
        }

        # 동기 HTTP 라이브러리를 별도 스레드로 실행하여 FastAPI 이벤트 루프 차단 방지.
        response_text = await asyncio.to_thread(self._post, payload)
        try:
            outer = json.loads(response_text)
            content = outer["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("content가 문자열이 아닙니다.")
            generated = json.loads(content)
            if not isinstance(generated, dict):
                raise TypeError("생성 결과가 JSON 객체가 아닙니다.")
            return response_model.model_validate(generated)
        except (json.JSONDecodeError, KeyError, IndexError, TypeError, ValidationError) as exc:
            # 원문 응답은 개인정보나 민감 정보가 포함될 수 있으므로 오류에 붙이지 않는다.
            raise LLMResponseError("LLM 응답이 예상 JSON 형식과 일치하지 않습니다.") from exc

    def _post(self, payload: dict[str, Any]) -> str:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            self._settings.api_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self._settings.api_key}",
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._settings.timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
        except HTTPError as exc:
            # 인증 토큰·서버 오류 응답 본문은 노출하지 않는다.
            raise LLMRequestError(f"LLM API HTTP 오류: {exc.code}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise LLMRequestError("LLM API에 연결하지 못했거나 시간 초과되었습니다.") from exc

        if len(raw) > MAX_RESPONSE_BYTES:
            raise LLMResponseError("LLM API 응답 크기가 제한을 초과했습니다.")
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise LLMResponseError("LLM 응답을 UTF-8로 읽을 수 없습니다.") from exc


def create_llm_client() -> LLMClient:
    """설정된 제공업체로 LLM 클라이언트를 구성한다.

    TODO: 실제 제공업체 선택 후 고유 API가 필요하면 전용 구현체를 추가한다.
    TODO: 운동·식단 추천 응답 스키마는 담당자 간 최종 규격 확정 후 연결한다.
    TODO: 서버 간 통합 시 HTTP 오류/타임아웃을 내부 서비스 오류로 변환한다.
    """
    return OpenAICompatibleLLMClient(LLMSettings.from_env())
