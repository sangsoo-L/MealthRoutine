package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserHealthPreferenceRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Profile and foods-to-avoid change together or not at all (PROFILE4-3). No test-level @Transactional: the request
 * commits or rolls back on its own, like on a real server. Rows are committed before each test and deleted after it.
 * The second save (user_health_preferences) is made to fail; the first (user_profiles) must be undone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserProfileAtomicityTests {

    private static final long WITH_PROFILE = 9501L;
    private static final long WITHOUT_PROFILE = 9502L;
    private static final LocalDateTime OLD = LocalDateTime.of(2020, 1, 1, 0, 0);
    private static final String BOTH_TABLES =
            "{\"displayName\":\"바뀐닉\",\"exerciseLevel\":\"advanced\",\"dietaryPreferences\":[\"오이\"]}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoSpyBean
    private UserHealthPreferenceRepository preferenceRepository;

    @BeforeEach
    void insertCommittedRows() {
        for (long id : new long[] {WITH_PROFILE, WITHOUT_PROFILE}) {
            jdbcTemplate.update("insert into users (user_id, username, password_hash, account_status, is_agreed_term)"
                    + " values (?, 'atomic', 'x', 'active', true)", id);
        }
        jdbcTemplate.update("insert into user_profiles (user_id, display_name, updated_at) values (?, '원래닉', ?)",
                WITH_PROFILE, OLD);
        doThrow(new IllegalStateException("simulated DB failure")).when(preferenceRepository).saveAndFlush(any());
    }

    @AfterEach
    void deleteRows() {
        for (long id : new long[] {WITH_PROFILE, WITHOUT_PROFILE}) {
            jdbcTemplate.update("delete from user_health_preferences where user_id = ?", id);
            jdbcTemplate.update("delete from user_profiles where user_id = ?", id);
            jdbcTemplate.update("delete from users where user_id = ?", id);
        }
    }

    @Test
    void aFailedFoodsSaveUndoesTheProfileChange() throws Exception {
        patchProfile(WITH_PROFILE)
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.errorCode").value("INTERNAL_ERROR"));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "select display_name, exercise_level, updated_at from user_profiles where user_id = ?", WITH_PROFILE);
        assertThat(row.get("display_name")).isEqualTo("원래닉");
        assertThat(row.get("exercise_level")).isEqualTo("undecided");
        assertThat(row.get("updated_at")).isEqualTo(OLD);
        assertThat(count("user_health_preferences", WITH_PROFILE)).isZero();
    }

    @Test
    void aFailedFoodsSaveUndoesTheNewProfileRow() throws Exception {
        patchProfile(WITHOUT_PROFILE).andExpect(status().isInternalServerError());

        assertThat(count("user_profiles", WITHOUT_PROFILE)).isZero();
        assertThat(count("user_health_preferences", WITHOUT_PROFILE)).isZero();
    }

    private org.springframework.test.web.servlet.ResultActions patchProfile(long id) throws Exception {
        return mockMvc.perform(patch("/api/v1/users/me/profile")
                .header(HttpHeaders.AUTHORIZATION,
                        "Bearer " + jwtTokenProvider.createAccessToken(id, UserRole.USER, Instant.now()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(BOTH_TABLES));
    }

    private int count(String table, long id) {
        return jdbcTemplate.queryForObject("select count(*) from " + table + " where user_id = ?", Integer.class, id);
    }
}
