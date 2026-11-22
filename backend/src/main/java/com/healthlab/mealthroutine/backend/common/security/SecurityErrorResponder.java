package com.healthlab.mealthroutine.backend.common.security;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes auth errors in the team response format. Errors in the security filters happen before any controller,
 * so GlobalExceptionHandler cannot format them.
 */
@Component
@RequiredArgsConstructor
public class SecurityErrorResponder {

    // RFC 6750: a 401 for Bearer auth says so in WWW-Authenticate; a rejected token adds error="invalid_token".
    private static final String BEARER = "Bearer";
    private static final String BEARER_INVALID_TOKEN = "Bearer error=\"invalid_token\"";

    private final JsonMapper jsonMapper;

    /**
     * The WWW-Authenticate value for an error, shared with GlobalExceptionHandler so every 401 follows one rule.
     * LOGIN_FAILED gets none on purpose (decision AUTH2-3): it is a wrong email or password in the login body,
     * and sending a Bearer token would not fix it. This knowingly does not meet the RFC 9110 rule that a 401
     * carries a challenge. The rule is by error code, not URL: a bad token sent to the login URL still gets one.
     */
    public static Optional<String> wwwAuthenticateFor(ErrorCode errorCode) {
        if (errorCode.getStatus().value() != HttpServletResponse.SC_UNAUTHORIZED || errorCode == ErrorCode.LOGIN_FAILED) {
            return Optional.empty();
        }
        boolean tokenRejected = errorCode == ErrorCode.TOKEN_EXPIRED || errorCode == ErrorCode.INVALID_TOKEN;
        return Optional.of(tokenRejected ? BEARER_INVALID_TOKEN : BEARER);
    }

    public void write(HttpServletResponse response, ErrorCode errorCode) throws IOException {
        wwwAuthenticateFor(errorCode).ifPresent(value -> response.setHeader(HttpHeaders.WWW_AUTHENTICATE, value));
        response.setStatus(errorCode.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(jsonMapper.writeValueAsString(ApiResponse.fail(errorCode)));
    }
}
