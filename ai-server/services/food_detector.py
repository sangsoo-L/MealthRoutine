
"""밀스루틴 자체 학습 YOLOv3 음식 인식 서비스."""

import sys
from functools import lru_cache
from pathlib import Path
from threading import Lock

import cv2
import numpy as np
import torch


# ai-server/food_model
MODEL_DIR = Path(__file__).resolve().parents[1] / "food_model"

CFG_PATH = MODEL_DIR / "cfg" / "yolov3-spp-403cls.cfg"
WEIGHTS_PATH = MODEL_DIR / "weights" / "best_403food_e200b150v2.pt"
NAMES_PATH = MODEL_DIR / "data" / "403food_ko.names"

IMAGE_SIZE = 320
CONF_THRESHOLD = 0.3
IOU_THRESHOLD = 0.5

# 학습 데이터에 포함된 음식 외 클래스
EXCLUDED_CLASSES = {"00000000", "test1", "test3", "spoon"}


class FoodDetector:
    def __init__(self):
        for path in (CFG_PATH, WEIGHTS_PATH, NAMES_PATH):
            if not path.is_file():
                raise FileNotFoundError(f"모델 파일이 없습니다: {path}")

        # 강사님 YOLO 코드는 from utils... 형태로 import함.
        # 기존 소스 수정 없이 food_model 내부 모듈을 읽도록 설정.
        if str(MODEL_DIR) not in sys.path:
            sys.path.insert(0, str(MODEL_DIR))

        from models import Darknet
        from utils.datasets import letterbox
        from utils.utils import non_max_suppression

        self.letterbox = letterbox
        self.non_max_suppression = non_max_suppression
        self.device = torch.device("cpu")
        self.lock = Lock()

        # 모델은 최초 호출 시 한 번만 로딩
        self.model = Darknet(str(CFG_PATH), IMAGE_SIZE)

        # 신뢰할 수 있는 강사님 체크포인트에만 허용
        checkpoint = torch.load(
            str(WEIGHTS_PATH),
            map_location=self.device,
            weights_only=False,
        )

        state = (
            checkpoint["model"]
            if isinstance(checkpoint, dict) and "model" in checkpoint
            else checkpoint
        )

        if isinstance(state, torch.nn.Module):
            state = state.state_dict()

        self.model.load_state_dict(state, strict=False)
        self.model.to(self.device).eval()

        del checkpoint, state

        with open(NAMES_PATH, encoding="utf-8-sig") as f:
            self.names = [
                line.strip()
                for line in f
                if line.strip()
            ]

    def predict(self, image_bytes: bytes) -> list[dict]:
        """이미지 바이트를 분석해 음식명과 신뢰도 반환."""

        # 이미지 디코딩
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(array, cv2.IMREAD_COLOR)

        if image is None:
            raise ValueError("이미지를 읽을 수 없습니다.")

        # 강사님 detect.py와 동일한 전처리
        processed = self.letterbox(
            image,
            new_shape=IMAGE_SIZE,
        )[0]

        processed = processed[:, :, ::-1].transpose(2, 0, 1)
        processed = np.ascontiguousarray(processed)

        tensor = torch.from_numpy(processed)
        tensor = tensor.to(self.device).float() / 255.0

        if tensor.ndimension() == 3:
            tensor = tensor.unsqueeze(0)

        # 구형 YOLO 내부 상태 변경에 대비해 동시 추론 보호
        with self.lock:
            with torch.no_grad():
                predictions = self.model(tensor)[0]

                detections = self.non_max_suppression(
                    predictions,
                    CONF_THRESHOLD,
                    IOU_THRESHOLD,
                    multi_label=False,
                    classes=None,
                    agnostic=False,
                )

                results = []

                for det in detections:
                    if det is None:
                        continue

                    for *_, conf, cls in det:
                        class_id = int(cls.item())

                        if not 0 <= class_id < len(self.names):
                            continue

                        food_name = self.names[class_id]

                        if food_name in EXCLUDED_CLASSES:
                            continue

                        results.append({
                            "name": food_name,
                            "confidence": round(float(conf.item()), 4),
                        })

        results.sort(
            key=lambda item: item["confidence"],
            reverse=True,
        )

        # 기존 밀스루틴 음식 후보 규격에 맞춰 최대 3개
        return results[:3]


@lru_cache(maxsize=1)
def get_food_detector() -> FoodDetector:
    """프로세스에서 모델 인스턴스 재사용."""
    return FoodDetector()
