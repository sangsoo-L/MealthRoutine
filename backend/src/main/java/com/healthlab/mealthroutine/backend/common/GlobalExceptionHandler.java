package com.healthlab.mealthroutine.backend.common;

import com.healthlab.mealthroutine.backend.common.security.SecurityErrorResponder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        return respond(e.getErrorCode());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConflict(DataIntegrityViolationException e) {
        log.warn("Data integrity violation", e);
        return respond(ErrorCode.DATA_CONFLICT);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception e) {
        log.error("Unexpected error", e);
        return respond(ErrorCode.INTERNAL_ERROR);
    }

    // Spring's own errors (bad JSON, validation, unknown path, wrong method) use the team response format too.
    @Override
    protected ResponseEntity<Object> createResponseEntity(
            Object body, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ErrorCode errorCode = ErrorCode.INTERNAL_ERROR;
        if (status.isSameCodeAs(HttpStatus.NOT_FOUND)) {
            errorCode = ErrorCode.NOT_FOUND;
        } else if (status.is4xxClientError()) {
            errorCode = ErrorCode.INVALID_REQUEST;
        }
        return new ResponseEntity<>(ApiResponse.fail(errorCode), headers, status);
    }

    // A 401 from a controller or service gets the same WWW-Authenticate as one from the security filter.
    private ResponseEntity<ApiResponse<Void>> respond(ErrorCode errorCode) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(errorCode.getStatus());
        SecurityErrorResponder.wwwAuthenticateFor(errorCode)
                .ifPresent(value -> builder.header(HttpHeaders.WWW_AUTHENTICATE, value));
        return builder.body(ApiResponse.fail(errorCode));
    }
}
