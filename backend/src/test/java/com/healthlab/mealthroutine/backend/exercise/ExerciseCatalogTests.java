package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The exercise catalog matches the frontend seed: same exercise ids, and each exercise says how it can be recorded
 * (defaultRecordMode / allowedRecordModes, catalog codes). Runs on the mealthroutine_test MySQL DB; every test rolls back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExerciseCatalogTests {

    private static final Path SEED_SQL = Path.of("../database/seed/001_insert_exercises.sql");
    private static final Path FRONTEND_SEED = Path.of("../frontend/src/exercise/seed/exercises.json");
    private static final String INSERT = "insert into exercises (exercise_id, name, default_record_mode,"
            + " allowed_record_modes) values (?, ?, ?, ?)";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void recordModesAreSentInSearchDetailAndFavorites() throws Exception {
        jdbcTemplate.update(INSERT, 3101L, "기록 방식 운동", "weight_reps", "[\"weight_reps\", \"reps\"]");
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (3101, 'catalog', true)");

        mockMvc.perform(get("/api/v1/exercises/3101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.defaultRecordMode").value("weight_reps"))
                .andExpect(jsonPath("$.data.allowedRecordModes[0]").value("weight_reps"))
                .andExpect(jsonPath("$.data.allowedRecordModes[1]").value("reps"));
        mockMvc.perform(get("/api/v1/exercises").param("keyword", "기록 방식 운동"))
                .andExpect(jsonPath("$.data.content[0].defaultRecordMode").value("weight_reps"))
                .andExpect(jsonPath("$.data.content[0].allowedRecordModes.length()").value(2));

        String token = "Bearer " + jwtTokenProvider.createAccessToken(3101L, UserRole.USER, Instant.now());
        mockMvc.perform(put("/api/v1/users/me/favorite-exercises/3101").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/users/me/favorite-exercises").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(jsonPath("$.data[0].defaultRecordMode").value("weight_reps"));
    }

    @Test
    void missingOrInconsistentRecordModesAreSentAsNullTogether() throws Exception {
        jdbcTemplate.update(INSERT, 3102L, "기록 방식 없음", null, null);
        jdbcTemplate.update(INSERT, 3103L, "기본값이 목록에 없음", "time", "[\"reps\"]");
        jdbcTemplate.update(INSERT, 3104L, "모르는 코드", "reps", "[\"reps\", \"jump\"]");
        jdbcTemplate.update(INSERT, 3105L, "중복 코드", "reps", "[\"reps\", \"reps\"]");
        jdbcTemplate.update(INSERT, 3106L, "빈 목록", "reps", "[]");
        jdbcTemplate.update(INSERT, 3107L, "목록만 있음", null, "[\"reps\"]");

        for (long id = 3102; id <= 3107; id++) {
            mockMvc.perform(get("/api/v1/exercises/" + id))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.defaultRecordMode").doesNotExist())
                    .andExpect(jsonPath("$.data.allowedRecordModes").doesNotExist());
        }
    }

    @Test
    void seedLoadsWithTheFrontendIdsAndCanBeRunAgain() throws Exception {
        String insert = seedInsertStatement();
        jdbcTemplate.execute(insert);
        jdbcTemplate.execute(insert); // a second run updates the same rows instead of adding new ones

        JsonNode frontend = JsonMapper.builder().build().readTree(Files.readString(FRONTEND_SEED, StandardCharsets.UTF_8));
        Map<Long, String> expected = new HashMap<>();
        frontend.forEach(row -> expected.put(row.get("exercise_id").asLong(), row.get("name").asString()));
        assertThat(expected).hasSize(105);

        Map<Long, String> loaded = jdbcTemplate.queryForList(
                "select exercise_id, name from exercises where exercise_id between 1 and 105").stream()
                .collect(Collectors.toMap(r -> ((Number) r.get("exercise_id")).longValue(), r -> (String) r.get("name")));
        assertThat(loaded).isEqualTo(expected);

        List<String> missingModes = jdbcTemplate.queryForList("select name from exercises where exercise_id"
                + " between 1 and 105 and (default_record_mode is null or allowed_record_modes is null)", String.class);
        assertThat(missingModes).isEmpty();

        // id 2 is "원암 덤벨 로우" in the frontend seed: weight + reps.
        mockMvc.perform(get("/api/v1/exercises/2"))
                .andExpect(jsonPath("$.data.name").value(expected.get(2L)))
                .andExpect(jsonPath("$.data.exerciseEquipment").value("덤벨"))
                .andExpect(jsonPath("$.data.defaultRecordMode").value("weight_reps"))
                .andExpect(jsonPath("$.data.allowedRecordModes[0]").value("weight_reps"));
    }

    /** The seed file's single INSERT statement, without its comment lines and SET NAMES. */
    private static String seedInsertStatement() throws Exception {
        String sql = Files.readString(SEED_SQL, StandardCharsets.UTF_8);
        int start = sql.indexOf("INSERT INTO exercises");
        int end = sql.lastIndexOf(';');
        assertThat(start).isPositive();
        return sql.substring(start, end);
    }
}
