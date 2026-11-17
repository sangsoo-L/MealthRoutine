package com.healthlab.mealthroutine.backend.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Real commits against mealthroutine_test: no mocks and no test-level @Transactional.
 * Rows written here are deleted after each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SignupCommitTests {

    private static final String EMAIL = "commit-check@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("delete p from user_profiles p join users u on u.user_id = p.user_id where u.email = ?", EMAIL);
        jdbcTemplate.update("delete from users where email = ?", EMAIL);
    }

    @Test
    void signupCommitsUserAndProfile() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + EMAIL + "\",\"password\":\"Passw0rd!\",\"username\":\"홍길동\","
                                + "\"nickname\":\"commitcheck\",\"isAgreedTerm\":true}"))
                .andExpect(status().isCreated());

        Integer joined = jdbcTemplate.queryForObject(
                "select count(*) from users u join user_profiles p on p.user_id = u.user_id"
                        + " where u.email = ? and p.display_name = 'commitcheck'",
                Integer.class, EMAIL);
        assertThat(joined).isEqualTo(1);
    }

    /** Checks the message format assumption in isDuplicateEmail against the real MySQL error. */
    @Test
    void realMysqlDuplicateEmailIsRecognized() {
        jdbcTemplate.update("insert into users (email, username, is_agreed_term) values (?, '홍길동', true)", EMAIL);

        Throwable error = catchThrowable(() -> transactionTemplate.executeWithoutResult(status ->
                userRepository.saveAndFlush(User.createLocal(EMAIL, "김철수", "hash"))));

        assertThat(error).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(AuthService.isDuplicateEmail(error)).isTrue();
    }
}
