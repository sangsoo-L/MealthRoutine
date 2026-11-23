package com.healthlab.mealthroutine.backend.common;

import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    /**
     * Extra details sent as the failure response's {@code data} (PIN7-3, e.g. remainingAttempts). Null for almost
     * every error, and then the response has no {@code data} key, exactly as before.
     */
    private final Object data;

    public BusinessException(ErrorCode errorCode) {
        this(errorCode, null);
    }

    public BusinessException(ErrorCode errorCode, Object data) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.data = data;
    }
}
