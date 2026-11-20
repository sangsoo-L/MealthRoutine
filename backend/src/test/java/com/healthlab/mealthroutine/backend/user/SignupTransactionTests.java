package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.repository.UserProfileRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * No test-level @Transactional here, so a failed profile save really rolls back the user row,
 * which the rolled-back SignupApiTests cannot show. The real two-table commit is in SignupCommitTests.
 * Rows written here are deleted after each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SignupTransactionTests {

    private static final String EMAIL = "tx-check@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private UserProfileRepository userProfileRepository;

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("delete p from user_profiles p join users u on u.user_id = p.user_id where u.email = ?", EMAIL);
        jdbcTemplate.update("delete from users where email = ?", EMAIL);
    }

    @Test
    void profileFailureRollsBackTheUserRow() throws Exception {
        given(userProfileRepository.existsByDisplayName(anyString())).willReturn(false);
        given(userProfileRepository.saveAndFlush(any())).willThrow(new IllegalStateException("profile save failed"));

        mockMvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json()))
                .andExpect(status().isInternalServerError());

        assertThat(countUsers()).isZero();
    }

    private int countUsers() {
        Integer count = jdbcTemplate.queryForObject("select count(*) from users where email = ?", Integer.class, EMAIL);
        return count == null ? 0 : count;
    }

    private static String json() {
        return "{\"email\":\"" + EMAIL + "\",\"password\":\"Passw0rd!\",\"username\":\"홍길동\","
                + "\"nickname\":\"txcheck\",\"isAgreedTerm\":true}";
    }
}
