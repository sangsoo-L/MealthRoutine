package com.healthlab.mealthroutine.backend.diet.domain;

public enum RecordStatus { // 삭제 시 행을 지우지 않고 DELETED로 바꿈 (소프트삭제)
    DRAFT, CONFIRMED, DELETED
}
