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
    FOOD_NOT_FOUND(HttpStatus.NOT_FOUND, "음식을 찾을 수 없습니다."),
    MEAL_RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "식단 기록을 찾을 수 없습니다."),
    DIET_GOAL_NOT_FOUND(HttpStatus.NOT_FOUND, "식단 목표를 찾을 수 없습니다."),
    QUIZ_NOT_FOUND(HttpStatus.NOT_FOUND, "오늘의 퀴즈가 없습니다."),
    QUIZ_ALREADY_ATTEMPTED(HttpStatus.CONFLICT, "오늘의 퀴즈는 이미 풀었습니다."),
    // Signup: the wording avoids saying the email is already registered (decision EMAIL-2).
    EMAIL_UNAVAILABLE(HttpStatus.CONFLICT, "사용할 수 없는 이메일입니다. 다른 이메일을 입력해 주세요."),
    NICKNAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요."),
    DATA_CONFLICT(HttpStatus.CONFLICT, "다른 데이터와 충돌하여 처리할 수 없습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String message;
}
