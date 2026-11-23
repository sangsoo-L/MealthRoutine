package com.healthlab.mealthroutine.backend.common;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiResponse<T>(boolean success, String message, T data, String errorCode) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, "요청 성공", data, null);
    }

    public static ApiResponse<Void> ok() {
        return ok(null);
    }

    public static ApiResponse<Void> fail(ErrorCode errorCode) {
        return new ApiResponse<>(false, errorCode.getMessage(), null, errorCode.name());
    }

    /** A failure with details in {@code data} (PIN7-3). With null data it is the same as {@link #fail(ErrorCode)}. */
    public static ApiResponse<Object> fail(ErrorCode errorCode, Object data) {
        return new ApiResponse<>(false, errorCode.getMessage(), data, errorCode.name());
    }
}
