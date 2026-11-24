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
    // Same requestId sent again with different content. A repeat with the same content is not an error.
    REQUEST_CONFLICT(HttpStatus.CONFLICT, "같은 요청 ID로 다른 내용이 이미 저장되어 있습니다."),
    // expectedRevision differs from the stored revision. Carries data.currentRevision.
    REVISION_MISMATCH(HttpStatus.CONFLICT, "다른 곳에서 먼저 수정했습니다. 최신 내용을 다시 불러와 주세요."),
    FOOD_NOT_FOUND(HttpStatus.NOT_FOUND, "음식을 찾을 수 없습니다."),
    MEAL_RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "식단 기록을 찾을 수 없습니다."),
    DIET_GOAL_NOT_FOUND(HttpStatus.NOT_FOUND, "식단 목표를 찾을 수 없습니다."),
    QUIZ_NOT_FOUND(HttpStatus.NOT_FOUND, "오늘의 퀴즈가 없습니다."),
    QUIZ_ALREADY_ATTEMPTED(HttpStatus.CONFLICT, "오늘의 퀴즈는 이미 풀었습니다."),
    // Signup: the wording avoids saying the email is already registered (decision EMAIL-2).
    EMAIL_UNAVAILABLE(HttpStatus.CONFLICT, "사용할 수 없는 이메일입니다. 다른 이메일을 입력해 주세요."),
    NICKNAME_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요."),
    // Login: one message for unknown email, wrong password, social-only and deleted accounts (LOGIN-MSG-1, LOGIN-6).
    LOGIN_FAILED(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호를 확인해 주세요."),
    ACCOUNT_SUSPENDED(HttpStatus.FORBIDDEN, "정지된 계정입니다. 고객센터에 문의해 주세요."),
    // Access token: expired is separate so the client refreshes only then (decision AUTH2-3).
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "로그인이 만료되었습니다. 다시 로그인해 주세요."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "인증 정보가 올바르지 않습니다. 다시 로그인해 주세요."),
    // Refresh cookie missing, unknown, expired, already rotated, or the account can no longer log in (AUTH3-2).
    REFRESH_INVALID(HttpStatus.UNAUTHORIZED, "로그인이 만료되었습니다. 다시 로그인해 주세요."),
    // Refresh and logout without the X-Requested-With header (AUTH3-5).
    CSRF_REJECTED(HttpStatus.FORBIDDEN, "허용되지 않은 요청입니다."),
    // Account lookup and password change: 5 attempts per minute (ACCT6-4, PWCHG6-1). Sent with Retry-After.
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."),
    // Password change (PWCHG6-1). 400, not 401: the access token is fine, only the typed password is wrong.
    PASSWORD_NOT_SET(HttpStatus.BAD_REQUEST, "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다."),
    CURRENT_PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다."),
    PASSWORD_SAME_AS_CURRENT(HttpStatus.BAD_REQUEST, "현재 비밀번호와 다른 비밀번호를 입력해 주세요."),
    // PIN (PIN7-2): a wrong PIN is 400, not the spec's 401 — the access token is fine, only the typed PIN is wrong.
    // PIN_INVALID carries data.remainingAttempts and PIN_LOCKED carries data.lockedUntil (PIN7-3).
    PIN_INVALID(HttpStatus.BAD_REQUEST, "PIN이 올바르지 않습니다."),
    PIN_LOCKED(HttpStatus.FORBIDDEN, "PIN 입력이 잠겼습니다. 잠시 후 다시 시도해 주세요."),
    PIN_NOT_REGISTERED(HttpStatus.FORBIDDEN, "PIN이 등록되지 않았습니다. PIN을 먼저 등록해 주세요."),
    PIN_ALREADY_SET(HttpStatus.CONFLICT, "이미 PIN이 등록되어 있습니다."),
    // PIN-protected APIs (HEALTH8-11): 403, not 401 — the access token is fine, only the PIN check is missing.
    // PIN_REQUIRED: no X-Pin-Token, a forged one, an access token, or another member's valid PIN token.
    // PIN_EXPIRED: a properly signed PIN token past its expiry, whoever it belongs to.
    PIN_REQUIRED(HttpStatus.FORBIDDEN, "PIN 확인이 필요합니다."),
    PIN_EXPIRED(HttpStatus.FORBIDDEN, "PIN 확인 시간이 지났습니다. PIN을 다시 입력해 주세요."),
    // Another member's record and a missing record get the same 404 (HEALTH8-12).
    MEASUREMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "신체정보 기록을 찾을 수 없습니다."),
    DATA_CONFLICT(HttpStatus.CONFLICT, "다른 데이터와 충돌하여 처리할 수 없습니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다.");

    private final HttpStatus status;
    private final String message;
}
