package com.healthlab.mealthroutine.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Same DB failure as AuthDbFailureMockMvcTests, but on a real server (random port, real HTTP), where the
 * servlet container forwards the error to /error (ERROR dispatch). Checks that this ends as HTTP 500 and is
 * not blocked as 401 by the security rules.
 * <p>
 * The account lookup is a mock, so no rows are written (the server runs on another thread, so a test
 * transaction could not roll anything back anyway).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AuthDbFailureServerTests {

    private static final String PATH = "/api/v1/exercise-goals";

    @LocalServerPort
    private int port;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private AuthUserLookup authUserLookup;

    @Test
    void dbFailureIsHttp500OnARealServer() throws Exception {
        given(authUserLookup.find(anyLong())).willThrow(new DataAccessResourceFailureException("test: db down"));
        String token = jwtTokenProvider.createAccessToken(1L, UserRole.USER, Instant.now());
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + PATH))
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response;
        try (HttpClient client = HttpClient.newHttpClient()) {
            response = client.send(request, HttpResponse.BodyHandlers.ofString());
        }

        assertThat(response.statusCode()).isEqualTo(500);
        assertThat(response.body()).doesNotContain("INVALID_TOKEN").doesNotContain("LOGIN_REQUIRED");
        // Spring Boot's /error handler writes "status" and "path". Seeing them shows the ERROR dispatch reached
        // /error and was allowed through.
        assertThat(response.body()).contains("\"status\":500").contains("\"path\":\"" + PATH + "\"");
        // The account was looked up once. This proves one DB lookup only; see the handoff note for what it does
        // and does not show about the filter on the ERROR dispatch.
        verify(authUserLookup, times(1)).find(1L);
    }
}
