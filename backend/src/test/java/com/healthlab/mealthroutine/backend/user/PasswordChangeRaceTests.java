package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Races with a password change and a DB failure (PWCHG6-2, LOGIN6-1). No test-level @Transactional: each request
 * commits or rolls back on its own, like on a real server. The user row is committed before each test and
 * deleted after it. The order is forced by pausing a request inside a repository spy, never by sleeping.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasswordChangeRaceTests {

    private static final String OLD_PASSWORD = "Passw0rd!";
    private static final String NEW_A = "NewPassw0rd#A";
    private static final String NEW_B = "NewPassw0rd#B";
    private static long nextId = 9640L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoSpyBean
    private UserRepository userRepository;

    private long userId;
    private String email;
    private String oldHash;
    private ExecutorService pool;

    @BeforeEach
    void insertCommittedUser() {
        userId = nextId++; // the attempt limiter counts per user for the whole run
        email = "race" + userId + "@example.com";
        oldHash = passwordEncoder.encode(OLD_PASSWORD);
        jdbcTemplate.update("insert into users (user_id, email, username, password_hash, account_status,"
                + " is_agreed_term) values (?, ?, '경합', ?, 'active', true)", userId, email, oldHash);
        pool = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete from users where user_id = ?", userId);
    }

    /**
     * Both requests pass the current-password check, then wait for each other right before the conditional UPDATE.
     * Without the "and password_hash = old" condition both would answer 204.
     */
    @Test
    void twoChangesAtOnceLetExactlyOneWin() throws Exception {
        CyclicBarrier bothVerified = new CyclicBarrier(2);
        Answer<?> real = realAnswer();
        doAnswer(invocation -> {
            bothVerified.await(10, TimeUnit.SECONDS);
            return real.answer(invocation);
        }).when(userRepository).changePassword(anyLong(), anyString(), anyString());

        Future<MockHttpServletResponse> first = pool.submit(() -> perform(change(NEW_A)));
        Future<MockHttpServletResponse> second = pool.submit(() -> perform(change(NEW_B)));
        List<MockHttpServletResponse> responses = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));

        List<Integer> statuses = new ArrayList<>(responses.stream().map(MockHttpServletResponse::getStatus).toList());
        statuses.sort(null);
        assertThat(statuses).containsExactly(204, 400);
        String winner = responses.get(0).getStatus() == 204 ? NEW_A : NEW_B;
        assertThat(passwordEncoder.matches(winner, hash())).isTrue();
        MockHttpServletResponse loser = responses.get(0).getStatus() == 400 ? responses.get(0) : responses.get(1);
        assertThat(loser.getContentAsString()).contains("CURRENT_PASSWORD_MISMATCH");
        assertThat(loser.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    /** A login that verified the old password, then a password change commits, then the login tries to save. */
    @Test
    void aLoginThatCheckedTheOldPasswordCannotSaveAfterTheChange() throws Exception {
        CountDownLatch loginVerified = new CountDownLatch(1);
        CountDownLatch changeDone = new CountDownLatch(1);
        Answer<?> real = realAnswer();
        doAnswer(invocation -> {
            loginVerified.countDown();
            assertThat(changeDone.await(10, TimeUnit.SECONDS)).isTrue();
            return real.answer(invocation);
        }).when(userRepository).saveLogin(anyLong(), anyString(), anyString(), any());

        Future<MockHttpServletResponse> login = pool.submit(() -> perform(login(OLD_PASSWORD)));
        assertThat(loginVerified.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(perform(change(NEW_A)).getStatus()).isEqualTo(204);
        changeDone.countDown();

        MockHttpServletResponse loginResponse = login.get(30, TimeUnit.SECONDS);
        assertThat(loginResponse.getStatus()).isEqualTo(401);
        assertThat(loginResponse.getHeader(HttpHeaders.SET_COOKIE)).isNull();
        Map<String, Object> row = row();
        assertThat(passwordEncoder.matches(NEW_A, (String) row.get("password_hash"))).isTrue();
        assertThat(row.get("refresh_token_hash")).isNull();
    }

    /** A refresh that found the user by its cookie, then a password change commits, then the refresh tries to rotate. */
    @Test
    void aRefreshThatStartedBeforeTheChangeFails() throws Exception {
        String cookie = perform(login(OLD_PASSWORD)).getCookie("refresh_token").getValue();

        CountDownLatch refreshLookedUp = new CountDownLatch(1);
        CountDownLatch changeDone = new CountDownLatch(1);
        Answer<?> real = realAnswer();
        doAnswer(invocation -> {
            Object found = real.answer(invocation);
            refreshLookedUp.countDown();
            assertThat(changeDone.await(10, TimeUnit.SECONDS)).isTrue();
            return found;
        }).when(userRepository).findByRefreshTokenHash(anyString());

        Future<MockHttpServletResponse> refresh = pool.submit(() -> perform(post("/api/v1/auth/token/refresh")
                .header("X-Requested-With", "XMLHttpRequest").cookie(new Cookie("refresh_token", cookie))));
        assertThat(refreshLookedUp.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(perform(change(NEW_A)).getStatus()).isEqualTo(204);
        changeDone.countDown();

        MockHttpServletResponse refreshResponse = refresh.get(30, TimeUnit.SECONDS);
        assertThat(refreshResponse.getStatus()).isEqualTo(401);
        assertThat(refreshResponse.getContentAsString()).contains("REFRESH_INVALID");
        assertThat(row().get("refresh_token_hash")).isNull();
    }

    /**
     * The same race for a login that restores a pending-deletion account. Such an account cannot call the password
     * API (the filter blocks it), so the change is made with SQL, as a future reset-by-email would.
     */
    @Test
    void aRestoringLoginCannotSaveAfterThePasswordChanged() throws Exception {
        jdbcTemplate.update("update users set account_status = 'pending_deletion', deleted_at = ? where user_id = ?",
                java.time.LocalDateTime.now().minusDays(1), userId);
        CountDownLatch loginVerified = new CountDownLatch(1);
        CountDownLatch changeDone = new CountDownLatch(1);
        Answer<?> real = realAnswer();
        doAnswer(invocation -> {
            loginVerified.countDown();
            assertThat(changeDone.await(10, TimeUnit.SECONDS)).isTrue();
            return real.answer(invocation);
        }).when(userRepository).saveLoginRestoringAccount(anyLong(), anyString(), anyString(), any(), any(), any());

        Future<MockHttpServletResponse> login = pool.submit(() -> perform(login(OLD_PASSWORD)));
        assertThat(loginVerified.await(10, TimeUnit.SECONDS)).isTrue();
        jdbcTemplate.update("update users set password_hash = ? where user_id = ?", passwordEncoder.encode(NEW_A), userId);
        changeDone.countDown();

        assertThat(login.get(30, TimeUnit.SECONDS).getStatus()).isEqualTo(401);
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select account_status, refresh_token_hash from users where user_id = ?", userId);
        assertThat(row.get("account_status")).isEqualTo("pending_deletion");
        assertThat(row.get("refresh_token_hash")).isNull();
    }

    @Test
    void aDbFailureChangesNothingAndKeepsTheCookie() throws Exception {
        jdbcTemplate.update("update users set refresh_token_hash = 'keep' where user_id = ?", userId);
        doThrow(new IllegalStateException("simulated DB failure"))
                .when(userRepository).changePassword(anyLong(), anyString(), anyString());

        MockHttpServletResponse response = perform(change(NEW_A));

        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(response.getContentAsString()).contains("INTERNAL_ERROR");
        assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).isNull();
        assertThat(hash()).isEqualTo(oldHash);
        assertThat(row().get("refresh_token_hash")).isEqualTo("keep");
    }

    // ---------- helpers ----------

    /** The spy wraps a Spring Data proxy, so callRealMethod() is not possible; its default answer runs the real one. */
    private Answer<?> realAnswer() {
        return Mockito.mockingDetails(userRepository).getMockCreationSettings().getDefaultAnswer();
    }

    private MockHttpServletRequestBuilder change(String newPassword) {
        return patch("/api/v1/users/me/password")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now()))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + OLD_PASSWORD + "\",\"newPassword\":\"" + newPassword + "\"}");
    }

    private MockHttpServletRequestBuilder login(String password) {
        return post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    private MockHttpServletResponse perform(MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("select password_hash, refresh_token_hash from users where user_id = ?", userId);
    }

    private String hash() {
        return (String) row().get("password_hash");
    }
}
