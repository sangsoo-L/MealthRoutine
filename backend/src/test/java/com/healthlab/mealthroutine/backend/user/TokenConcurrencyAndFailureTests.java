package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import org.mockito.Mockito;
import org.mockito.stubbing.Answer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * No test-level @Transactional: each request commits or rolls back on its own, like on a real server.
 * The user row is committed before each test and deleted after it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TokenConcurrencyAndFailureTests {

    private static final String REFRESH = "/api/v1/auth/token/refresh";
    private static final String LOGOUT = "/api/v1/auth/logout";
    private static final String COOKIE = "refresh_token";
    private static final long USER_ID = 9301L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private UserRepository userRepository;

    @MockitoSpyBean
    private JwtTokenProvider jwtTokenProvider;

    private String token;
    private LocalDateTime expiry;

    @BeforeEach
    void insertCommittedUser() {
        token = RefreshTokens.generate();
        expiry = LocalDateTime.now().plusDays(3).truncatedTo(ChronoUnit.SECONDS);
        jdbcTemplate.update("insert into users (user_id, username, account_status, is_agreed_term,"
                + " refresh_token_hash, refresh_token_expires_at) values (?, 'refresh-race', 'active', true, ?, ?)",
                USER_ID, RefreshTokens.hash(token), expiry);
    }

    @AfterEach
    void deleteUser() {
        jdbcTemplate.update("delete from users where user_id = ?", USER_ID);
    }

    /**
     * Both requests must have read the old hash before either updates: each waits at the barrier right after the
     * real lookup. This forces the race on the UPDATE; it does not mean the two SQL statements run at the same instant.
     */
    @Test
    void twoRefreshesWithTheSameCookieLetExactlyOneWin() throws Exception {
        CyclicBarrier bothLookedUp = new CyclicBarrier(2);
        // The spy wraps a Spring Data proxy (an interface), so callRealMethod() is not possible. Its default answer
        // forwards to the real repository, so that runs the real query.
        Answer<?> realQuery = Mockito.mockingDetails(userRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            Object found = realQuery.answer(invocation);
            bothLookedUp.await(10, TimeUnit.SECONDS);
            return found;
        }).when(userRepository).findByRefreshTokenHash(anyString());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<MockHttpServletResponse> responses = new ArrayList<>();
        try {
            List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> mockMvc.perform(refresh(token)).andReturn().getResponse()));
            }
            for (Future<MockHttpServletResponse> future : futures) {
                responses.add(future.get(30, TimeUnit.SECONDS)); // rethrows any error, including a broken barrier
            }
        } finally {
            pool.shutdownNow();
        }

        List<Integer> statuses = responses.stream().map(MockHttpServletResponse::getStatus).sorted().toList();
        assertThat(statuses).containsExactly(200, 401);
        MockHttpServletResponse winner = responses.stream().filter(r -> r.getStatus() == 200).findFirst().orElseThrow();
        MockHttpServletResponse loser = responses.stream().filter(r -> r.getStatus() == 401).findFirst().orElseThrow();
        assertThat(loser.getContentAsString()).contains("REFRESH_INVALID");
        // The loser sets no cookie, so whichever response the browser handles last, the winner's cookie stays.
        assertThat(loser.getHeader(HttpHeaders.SET_COOKIE)).isNull();
        assertThat(storedHash()).isEqualTo(RefreshTokens.hash(winner.getCookie(COOKIE).getValue()));
    }

    @Test
    void accessTokenFailureRollsBackTheRotation() throws Exception {
        doThrow(new IllegalStateException("token failed"))
                .when(jwtTokenProvider).createAccessToken(any(), any(), any());

        mockMvc.perform(refresh(token))
                .andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        Map<String, Object> row = row();
        assertThat(row.get("refresh_token_hash")).isEqualTo(RefreshTokens.hash(token));
        assertThat((LocalDateTime) row.get("refresh_token_expires_at")).isEqualTo(expiry);
    }

    @Test
    void aDbFailureDuringLogoutIsAServerErrorNotNoContent() throws Exception {
        doThrow(new DataAccessResourceFailureException("db down")).when(userRepository).clearRefreshToken(anyString());

        mockMvc.perform(post(LOGOUT).header("X-Requested-With", "XMLHttpRequest").cookie(new Cookie(COOKIE, token)))
                .andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
        assertThat(storedHash()).isEqualTo(RefreshTokens.hash(token));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder refresh(String cookie) {
        return post(REFRESH).header("X-Requested-With", "XMLHttpRequest").cookie(new Cookie(COOKIE, cookie));
    }

    private String storedHash() {
        return jdbcTemplate.queryForObject("select refresh_token_hash from users where user_id = ?", String.class, USER_ID);
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap(
                "select refresh_token_hash, refresh_token_expires_at from users where user_id = ?", USER_ID);
    }
}
