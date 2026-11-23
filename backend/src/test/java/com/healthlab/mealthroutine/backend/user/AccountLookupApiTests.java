package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /api/v1/auth/account-lookup (FIND-1, ACCT6-1~4) with a movable fixed clock. Every test rolls back.
 * The attempt limiter lives in memory for the whole test run, so every test uses its own client IP.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AccountLookupApiTests {

    private static final String LOOKUP = "/api/v1/auth/account-lookup";
    private static final Instant NOW = Instant.parse("2026-11-23T03:00:00Z");
    private static final String NO_MATCH = "{\"success\":true,\"message\":\"요청 성공\",\"data\":{\"matched\":false}}";
    private static final AtomicInteger IP_COUNTER = new AtomicInteger();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private UserRepository userRepository;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private String ip;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willAnswer(invocation -> now.get());
        given(clock.getZone()).willReturn(ZoneId.of("Asia/Seoul"));
        ip = "10.6.0." + IP_COUNTER.incrementAndGet();
        insertUser(9611L, "gildong@example.com", "홍길동", "active");
        insertUser(9612L, "john@example.com", "John Smith", "active");
        insertUser(9613L, "jose@example.com", "José", "active");
        insertUser(9614L, "suspended@example.com", "정지회원", "suspended");
        insertUser(9615L, "pending@example.com", "탈퇴대기", "pending_deletion");
        insertUser(9616L, "deleted@example.com", "탈퇴회원", "deleted");
        insertUser(9617L, null, "이메일없음", "active");
        clearInvocations(userRepository);
    }

    @Test
    void bothMatchingIsTrueWithoutLogin() throws Exception {
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matched").value(true));
    }

    @Test
    void emailIsTrimmedAndLowercasedAndNameIsTrimmed() throws Exception {
        lookup("{\"email\":\"  GilDong@Example.COM \",\"username\":\"  홍길동 \"}")
                .andExpect(jsonPath("$.data.matched").value(true));
    }

    @Test
    void theNameIsComparedExactlyNotByTheDbRule() throws Exception {
        lookup("{\"email\":\"john@example.com\",\"username\":\"John Smith\"}").andExpect(jsonPath("$.data.matched").value(true));
        lookup("{\"email\":\"john@example.com\",\"username\":\"john smith\"}").andExpect(jsonPath("$.data.matched").value(false));
        // The DB holds "José"; "Jose" passes the name rule (an accent in the request would be a 400) but is a
        // different name. The table's ai_ci rule would call them equal.
        lookup("{\"email\":\"jose@example.com\",\"username\":\"Jose\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matched").value(false));
    }

    @Test
    void everyNonMatchIsTheSameResponse() throws Exception {
        String emailOnly = body("{\"email\":\"gildong@example.com\",\"username\":\"김철수\"}");
        String nameOnly = body("{\"email\":\"nobody@example.com\",\"username\":\"홍길동\"}");
        String neither = body("{\"email\":\"nobody@example.com\",\"username\":\"김철수\"}");

        assertThat(emailOnly).isEqualTo(NO_MATCH);
        assertThat(nameOnly).isEqualTo(NO_MATCH);
        assertThat(neither).isEqualTo(NO_MATCH);
    }

    @Test
    void accountStatusesThatCanMatch() throws Exception {
        lookup("{\"email\":\"suspended@example.com\",\"username\":\"정지회원\"}").andExpect(jsonPath("$.data.matched").value(true));
        lookup("{\"email\":\"pending@example.com\",\"username\":\"탈퇴대기\"}").andExpect(jsonPath("$.data.matched").value(true));
        lookup("{\"email\":\"deleted@example.com\",\"username\":\"탈퇴회원\"}").andExpect(jsonPath("$.data.matched").value(false));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{}", "{\"email\":\"gildong@example.com\"}", "{\"username\":\"홍길동\"}",
        "{\"email\":\"\",\"username\":\"홍길동\"}", "{\"email\":\"gildong@example.com\",\"username\":\"\"}",
        "{\"email\":\"not-an-email\",\"username\":\"홍길동\"}", "{\"email\":\"gildong@example.com\",\"username\":\"홍1\"}",
        "{\"email\":\"gildong@example.com\",\"username\":\"José\"}", "{\"email\":\"gildong@example.com\",\"username\":12}",
        "{\"email\":true,\"username\":\"홍길동\"}", "{\"email\":", "",
    })
    void brokenInputIs400(String json) throws Exception {
        lookup(json).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
    }

    @Test
    void aBadBearerTokenIsStill401() throws Exception {
        mockMvc.perform(post(LOOKUP).with(fromIp()).header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}"))
                .andExpect(status().isUnauthorized()); // AUTH2-5
    }

    // ---------- attempt limit (ACCT6-4) ----------

    @Test
    void theSixthAttemptInAMinuteIs429WithoutReadingTheDb() throws Exception {
        for (int i = 0; i < 5; i++) {
            lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}").andExpect(status().isOk());
        }
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("TOO_MANY_REQUESTS"))
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"))
                .andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
        verify(userRepository, times(5)).findByEmail(anyString());

        // Another IP is not affected.
        ip = "10.6.99." + IP_COUNTER.incrementAndGet();
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}").andExpect(status().isOk());
    }

    @Test
    void theWindowEndsAfterOneMinute() throws Exception {
        for (int i = 0; i < 5; i++) {
            lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}");
        }
        now.set(NOW.plusSeconds(59));
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "1"));
        now.set(NOW.plusSeconds(60));
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}").andExpect(status().isOk());
    }

    @Test
    void brokenRequestsCountToo() throws Exception {
        lookup("{\"email\":").andExpect(status().isBadRequest());
        lookup("{\"email\":1,\"username\":2}").andExpect(status().isBadRequest());
        lookup("{}").andExpect(status().isBadRequest());
        lookup("{\"email\":\"x\",\"username\":\"홍길동\"}").andExpect(status().isBadRequest());
        lookup("").andExpect(status().isBadRequest());

        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}").andExpect(status().isTooManyRequests());
        verify(userRepository, never()).findByEmail(anyString());
    }

    /**
     * "%2D" is "-": Spring sends this path to the same controller, so it must share the same count.
     * post(URI) keeps "%2D" as written; post(String) would encode it again into "%252D", which matches nothing.
     */
    @Test
    void anEncodedPathReachesTheControllerAndSharesTheLimit() throws Exception {
        URI encoded = URI.create("/api/v1/auth/account%2Dlookup");
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post(encoded).with(fromIp()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.matched").value(true));
        }
        mockMvc.perform(post(encoded).with(fromIp()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}"))
                .andExpect(status().isTooManyRequests());
        lookup("{\"email\":\"gildong@example.com\",\"username\":\"홍길동\"}").andExpect(status().isTooManyRequests());
    }

    // ---------- helpers ----------

    private void insertUser(long id, String email, String username, String status) {
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status,"
                + " is_agreed_term) values (?, ?, ?, 'x', ?, true)", id, email, username, status);
    }

    private ResultActions lookup(String json) throws Exception {
        return mockMvc.perform(post(LOOKUP).with(fromIp()).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String body(String json) throws Exception {
        return lookup(json).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor fromIp() {
        String address = ip;
        return request -> {
            request.setRemoteAddr(address);
            return request;
        };
    }
}
