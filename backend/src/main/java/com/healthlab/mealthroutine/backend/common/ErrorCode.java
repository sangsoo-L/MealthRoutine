package com.healthlab.mealthroutine.backend.common;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    LOGIN_REQUIRED(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 경로를 찾을 수 없습니다."),
    EXERCISE_NOT_FOUND(HttpStatus.NOT_FOUND, "운동을 찾을 수 없습니다."),
    ROUTINE_NOT_FOUND(HttpStatus.NOT_FOUND, "운동 루틴을 찾을 수 없습니다."),
    SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "운동 기록을 찾을 수 없습니다."),
    EXERCISE_GOAL_NOT_FOUND(HttpStatus.NOT_FOUND, "운동 목표를 찾을 수 없습니다."),
    INVALID_SESSION_STATUS(HttpStatus.CONFLICT, "이미 종료된 운동 기록입니다."),
    DATA_CONFLICT(HttpStatus.CONFLICT, "다른 데이터와 충돌하여 처리할 수 없습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String message;
}
