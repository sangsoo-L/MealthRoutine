package com.healthlab.mealthroutine.backend.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.healthlab.mealthroutine.backend.common.security.SecurityErrorResponder;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * One WWW-Authenticate rule for every error code, on both paths that write errors: the security filter
 * (SecurityErrorResponder) and controllers/services (GlobalExceptionHandler). Decision AUTH2-3. No Spring context.
 */
class WwwAuthenticateRuleTests {

    private static final String NONE = "";

    /** Every 401 code must be listed here. A new 401 code without a decided header fails the first test. */
    private static final Map<ErrorCode, String> UNAUTHORIZED_HEADERS = Map.of(
            ErrorCode.LOGIN_REQUIRED, "Bearer",
            ErrorCode.TOKEN_EXPIRED, "Bearer error=\"invalid_token\"",
            ErrorCode.INVALID_TOKEN, "Bearer error=\"invalid_token\"",
            ErrorCode.LOGIN_FAILED, NONE); // the only 401 without one: a wrong email/password, not a Bearer problem

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
    private final SecurityErrorResponder responder = new SecurityErrorResponder(JsonMapper.builder().build());

    @Test
    void every401CodeHasADecidedHeader() {
        Set<ErrorCode> unauthorized = Arrays.stream(ErrorCode.values())
                .filter(code -> code.getStatus() == HttpStatus.UNAUTHORIZED)
                .collect(Collectors.toSet());

        assertThat(unauthorized).isEqualTo(UNAUTHORIZED_HEADERS.keySet());
    }

    @Test
    void bothPathsGiveTheSameHeaderForEveryCode() throws Exception {
        for (ErrorCode code : ErrorCode.values()) {
            String expected = UNAUTHORIZED_HEADERS.getOrDefault(code, NONE);

            String fromHandler = handler.handleBusiness(new BusinessException(code))
                    .getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE);
            MockHttpServletResponse response = new MockHttpServletResponse();
            responder.write(response, code);
            String fromFilter = response.getHeader(HttpHeaders.WWW_AUTHENTICATE);

            assertThat(fromHandler == null ? NONE : fromHandler).as("handler %s", code).isEqualTo(expected);
            assertThat(fromFilter == null ? NONE : fromFilter).as("filter %s", code).isEqualTo(expected);
        }
    }
}
