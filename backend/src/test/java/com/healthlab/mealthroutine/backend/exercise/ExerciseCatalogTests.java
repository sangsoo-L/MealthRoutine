package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptStatementFailedException;
import org.springframework.jdbc.datasource.init.ScriptUtils;
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

    @Autowired
    private DataSource dataSource;

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
            expectNoRecordModes(id);
        }
    }

    @Test
    void numbersInTheAllowedListAreNotReadAsRecordModes() throws Exception {
        // PR review: a JSON number (or a string of digits) must not be taken as a position in the enum list
        // (1 would otherwise become REPS). Every one of these rows has to send both fields as null.
        String[] allowed = {"[1]", "[0]", "[\"1\"]", "[\"0\"]", "[\"reps\", 2]", "[\"reps\", \"2\"]", "[1.0]",
            "[true]", "[null]", "[[\"reps\"]]", "[{\"mode\":\"reps\"}]", "\"reps\"", "{\"reps\":true}", "[\"REPS\"]",
            "[\" reps\"]", "[\"weight\"]"};
        for (int i = 0; i < allowed.length; i++) {
            jdbcTemplate.update(INSERT, 3201L + i, "잘못된 목록 " + i, "reps", allowed[i]);
        }
        for (int i = 0; i < allowed.length; i++) {
            expectNoRecordModes(3201L + i);
        }
        // The same rows next to a good one: only the good one keeps its record modes.
        jdbcTemplate.update(INSERT, 3299L, "올바른 목록", "reps", "[\"reps\", \"time_reps\"]");
        mockMvc.perform(get("/api/v1/exercises/3299"))
                .andExpect(jsonPath("$.data.defaultRecordMode").value("reps"))
                .andExpect(jsonPath("$.data.allowedRecordModes[1]").value("time_reps"));
    }

    /** Both fields are present in the response and null (not just missing). */
    private void expectNoRecordModes(long id) throws Exception {
        mockMvc.perform(get("/api/v1/exercises/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exerciseId").value(id))
                .andExpect(jsonPath("$.data.defaultRecordMode").value(nullValue()))
                .andExpect(jsonPath("$.data.allowedRecordModes").value(nullValue()));
    }

    @Test
    void seedLoadsWithTheFrontendIdsAndCanBeRunAgain() throws Exception {
        assertThat(countExercises()).isZero(); // the test DB keeps no exercises between tests
        runSeed(false);
        runSeed(false); // a second run updates the same rows instead of adding new ones

        JsonNode frontend = JsonMapper.builder().build().readTree(Files.readString(FRONTEND_SEED, StandardCharsets.UTF_8));
        Map<Long, String> expected = new HashMap<>();
        frontend.forEach(row -> expected.put(row.get("exercise_id").asLong(), row.get("name").asString()));
        assertThat(expected).hasSize(105);

        assertThat(countExercises()).isEqualTo(105);
        Map<Long, String> loaded = jdbcTemplate.queryForList("select exercise_id, name from exercises").stream()
                .collect(Collectors.toMap(r -> ((Number) r.get("exercise_id")).longValue(), r -> (String) r.get("name")));
        assertThat(loaded).isEqualTo(expected);

        List<String> missingModes = jdbcTemplate.queryForList("select name from exercises"
                + " where default_record_mode is null or allowed_record_modes is null", String.class);
        assertThat(missingModes).isEmpty();

        // id 2 is "원암 덤벨 로우" in the frontend seed: weight + reps.
        mockMvc.perform(get("/api/v1/exercises/2"))
                .andExpect(jsonPath("$.data.name").value(expected.get(2L)))
                .andExpect(jsonPath("$.data.exerciseEquipment").value("덤벨"))
                .andExpect(jsonPath("$.data.defaultRecordMode").value("weight_reps"))
                .andExpect(jsonPath("$.data.allowedRecordModes[0]").value("weight_reps"));
    }

    @Test
    void oldExerciseInUseBlocksTheSeedAndNothingChanges() throws Exception {
        // PR review: the old seed's 1번 푸시업, favorited and recorded. Applying the seed would turn both into 밴드 로우.
        insertOldPushUp();
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (3301, 'old', true)");
        jdbcTemplate.update("insert into preference_exercises (exercise_id, user_id) values (1, 3301)");
        jdbcTemplate.update("insert into workout_sessions (workout_session_id, user_id, started_at, status)"
                + " values (3301, 3301, '2026-01-10 10:00:00', 'completed')");
        jdbcTemplate.update("insert into workout_session_exercises (workout_session_id, exercise_id) values (3301, 1)");

        assertThatThrownBy(() -> runSeed(false))
                .isInstanceOf(ScriptStatementFailedException.class)
                .hasStackTraceContaining("seed_blocked__existing_exercises_conflict");
        // A tool that keeps going after an error (continueOnError) still inserts nothing.
        runSeed(true);

        assertThat(countExercises()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("select name from exercises where exercise_id = 1", String.class))
                .isEqualTo("푸시업");
        String token = "Bearer " + jwtTokenProvider.createAccessToken(3301L, UserRole.USER, Instant.now());
        mockMvc.perform(get("/api/v1/users/me/favorite-exercises").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(jsonPath("$.data[0].exerciseId").value(1))
                .andExpect(jsonPath("$.data[0].name").value("푸시업"));
        mockMvc.perform(get("/api/v1/workout-sessions/3301").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(jsonPath("$.data.exercises[0].exerciseName").value("푸시업"));
    }

    @Test
    void oldExerciseNobodyUsesIsReplaced() throws Exception {
        insertOldPushUp();
        runSeed(false);
        assertThat(countExercises()).isEqualTo(105);
        assertThat(jdbcTemplate.queryForObject("select name from exercises where exercise_id = 1", String.class))
                .isEqualTo("밴드 로우");
    }

    @Test
    void exerciseOutsideTheSeedBlocksTheSeed() {
        // Not referenced, but the frontend catalog has no such exercise, so it would break the exercise screens.
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (3401, '예전 운동', 'beginner', '하체', 'body')");
        assertThatThrownBy(() -> runSeed(false)).isInstanceOf(ScriptStatementFailedException.class);
        runSeed(true);
        assertThat(countExercises()).isEqualTo(1);
    }

    private void insertOldPushUp() {
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (1, '푸시업', 'beginner', '가슴', 'body')");
    }

    private int countExercises() {
        Integer count = jdbcTemplate.queryForObject("select count(*) from exercises", Integer.class);
        return count == null ? 0 : count;
    }

    /**
     * Runs the whole seed file on the test transaction's connection, statement by statement like the mysql client.
     * continueOnError mimics a console that keeps running after a failed statement.
     */
    private void runSeed(boolean continueOnError) {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        ScriptUtils.executeSqlScript(connection, new EncodedResource(new FileSystemResource(SEED_SQL), StandardCharsets.UTF_8),
                continueOnError, false, ScriptUtils.DEFAULT_COMMENT_PREFIX, ScriptUtils.DEFAULT_STATEMENT_SEPARATOR,
                ScriptUtils.DEFAULT_BLOCK_COMMENT_START_DELIMITER, ScriptUtils.DEFAULT_BLOCK_COMMENT_END_DELIMITER);
    }
}
