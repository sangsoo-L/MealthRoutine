package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /api/v1/auth/signup against the mealthroutine_test DB. Every test rolls back.
 * The service flushes inside the request, so the rows checked here were really sent to MySQL
 * (commit and rollback themselves are covered by SignupTransactionTests).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SignupApiTests {

    private static final String SIGNUP = "/api/v1/auth/signup";
    private static final String ERROR_CODE = "$.errorCode";
    private static final String PASSWORD = "Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void signupSavesUserAndProfileWithHashedPassword() throws Exception {
        String body = signup("new@example.com", PASSWORD, "홍길동", "길동이", "true")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.userId").isNumber())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(PASSWORD).doesNotContain("password");
        long userId = ((Number) JsonPath.read(body, "$.data.userId")).longValue();

        Map<String, Object> user = jdbcTemplate.queryForMap(
                "select email, username, password_hash, account_status, user_role, is_agreed_term from users where user_id = ?",
                userId);
        assertThat(user.get("email")).isEqualTo("new@example.com");
        assertThat(user.get("username")).isEqualTo("홍길동");
        String hash = (String) user.get("password_hash");
        assertThat(hash).isNotEqualTo(PASSWORD).startsWith("$2");
        assertThat(passwordEncoder.matches(PASSWORD, hash)).isTrue();
        // DB defaults were used, not values sent by JPA.
        assertThat(user.get("account_status")).isEqualTo("active");
        assertThat(user.get("user_role")).isEqualTo("user");
        assertThat(user.get("is_agreed_term")).isEqualTo(true);

        Map<String, Object> profile = jdbcTemplate.queryForMap(
                "select display_name, exercise_level from user_profiles where user_id = ?", userId);
        assertThat(profile.get("display_name")).isEqualTo("길동이");
        assertThat(profile.get("exercise_level")).isEqualTo("undecided");

        Integer identities = jdbcTemplate.queryForObject(
                "select count(*) from user_auth_identities where user_id = ?", Integer.class, userId);
        assertThat(identities).isZero(); // IDENT-1
    }

    @Test
    void emailIsTrimmedAndLowercased() throws Exception {
        signup("  Mixed.Case@Example.COM ", PASSWORD, "Gil Dong", "gildong", "true").andExpect(status().isCreated());

        assertThat(countUsers("mixed.case@example.com")).isEqualTo(1);
    }

    @Test
    void sameEmailWithDifferentCaseIsRejected() throws Exception {
        signup("dup@example.com", PASSWORD, "홍길동", "first", "true").andExpect(status().isCreated());

        signup(" DUP@Example.com", PASSWORD, "김철수", "second", "true")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("EMAIL_UNAVAILABLE"));
        assertThat(countUsers("dup@example.com")).isEqualTo(1);
    }

    @Test
    void sameNicknameIgnoringCaseIsRejected() throws Exception {
        signup("one@example.com", PASSWORD, "홍길동", "Runner1", "true").andExpect(status().isCreated());

        signup("two@example.com", PASSWORD, "김철수", "runner1", "true")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("NICKNAME_ALREADY_EXISTS"));
        assertThat(countUsers("two@example.com")).isZero();
    }

    @Test
    void termsMustBeAccepted() throws Exception {
        signup("terms@example.com", PASSWORD, "홍길동", "terms1", "false")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));
        signup("terms@example.com", PASSWORD, "홍길동", "terms1", null).andExpect(status().isBadRequest());
        assertThat(countUsers("terms@example.com")).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Passw0rd",          // no symbol
            "Password!",         // no digit
            "12345678!",         // no letter
            "Pa0!",              // too short
            "Pa0!aaa",           // 7 characters
            "비밀번호Passw0rd!",    // non-ASCII (PW-2)
            "Pass w0rd!",        // space
    })
    void badPasswordsAreRejected(String password) throws Exception {
        signup("pw@example.com", password, "홍길동", "pwtest", "true").andExpect(status().isBadRequest());
    }

    @Test
    void passwordLengthBoundaries() throws Exception {
        String max = "Aa1!" + "a".repeat(60); // 64 characters
        signup("pw64@example.com", max, "홍길동", "pw64", "true").andExpect(status().isCreated());
        signup("pw65@example.com", max + "a", "홍길동", "pw65", "true").andExpect(status().isBadRequest());
        signup("pw8@example.com", "Aa1!aaaa", "홍길동", "pw8", "true").andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"가나다라마바사아자차", "홍길", "Al", "Mary Jane Watson", "Abcdefghijabcdefghijabcdefghij"})
    void validRealNames(String username) throws Exception {
        signup("name@example.com", PASSWORD, username, "namecheck", "true").andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "홍",                                  // 1 Korean character
            "가나다라마바사아자차카",                     // 11 Korean characters
            "A",                                   // 1 letter
            "Abcdefghijabcdefghijabcdefghijk",     // 31 letters
            "홍Gil",                                // mixed Korean and English
            "Gil2",                                 // digit
            "Gil-Dong",                             // symbol
            "Gil  Dong",                            // double space
            " Gil",                                 // leading space
    })
    void invalidRealNames(String username) throws Exception {
        signup("name@example.com", PASSWORD, username, "namecheck", "true").andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"가나다라마바사아", "길동1", "길동Run", "ab", "abcdefghij123456"})
    void validNicknames(String nickname) throws Exception {
        signup("nick@example.com", PASSWORD, "홍길동", nickname, "true").andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"가", "가나다라마바사아자", "a", "abcdefghij1234567", "길동 1", "gil_dong", "길동!"})
    void invalidNicknames(String nickname) throws Exception {
        signup("nick@example.com", PASSWORD, "홍길동", nickname, "true").andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-an-email", "a@", "@example.com", ""})
    void invalidEmailsAreRejected(String email) throws Exception {
        signup(email, PASSWORD, "홍길동", "mailcheck", "true").andExpect(status().isBadRequest());
    }

    private int countUsers(String email) {
        Integer count = jdbcTemplate.queryForObject("select count(*) from users where email = ?", Integer.class, email);
        return count == null ? 0 : count;
    }

    private ResultActions signup(String email, String password, String username, String nickname, String agreed)
            throws Exception {
        String agreedField = agreed == null ? "" : ",\"isAgreedTerm\":" + agreed;
        String json = "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"username\":\"" + username
                + "\",\"nickname\":\"" + nickname + "\"" + agreedField + "}";
        return mockMvc.perform(post(SIGNUP).contentType(MediaType.APPLICATION_JSON).content(json));
    }
}
