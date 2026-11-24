package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.reward.service.WorkoutCheck;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Completed-record upload (POST /workout-sessions/records): the frontend sends one finished workout and it must show
 * up in the stats and the daily workout reward check exactly like a session finished through the old API.
 * Runs against the mealthroutine_test MySQL DB from docker-compose; every test rolls back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class WorkoutRecordUploadTests {

    private static final String ME = "1001";
    private static final String OTHER = "1002";
    private static final String SESSIONS = "/api/v1/workout-sessions";
    private static final String RECORDS = SESSIONS + "/records";
    private static final String ERROR_CODE = "$.errorCode";

    /**
     * 01:00Z to 01:30Z is 10:00 to 10:30 in Korea on 2026-01-10.
     * 스쿼트 weight: 3 sets planned, sets 1 and 3 done (set 2 skipped). 플랭크 time: 2 planned, 1 done with the timer.
     */
    private static final String EXERCISES = """
            [{"exerciseId":2001,"recordType":"weight",
              "setTargets":[{"reps":12,"weightKg":40},{"reps":10,"weightKg":50},{"reps":8,"weightKg":60}],
              "completedSets":[{"setNumber":1,"reps":12,"weightKg":40},{"setNumber":3,"reps":8,"weightKg":60.00}]},
             {"exerciseId":2002,"recordType":"time",
              "setTargets":[{"targetSeconds":30},{"targetSeconds":45}],
              "completedSets":[{"setNumber":1,"durationSeconds":31}]}]""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private WorkoutCheck workoutCheck;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (1001, 'me', true)");
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (1002, 'other', true)");
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (2001, '스쿼트', 'beginner', '하체', 'body')");
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (2002, '플랭크', 'beginner', '코어', 'body')");
    }

    @Test
    void uploadSavesACompletedSessionInKoreanTime() throws Exception {
        String id = sessionId(send(post(RECORDS), ME, record("rec-1", "2026-01-10T01:00:00.000Z",
                "2026-01-10T01:30:00.000Z", EXERCISES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.created").value(true))
                .andExpect(jsonPath("$.data.status").value("completed"))
                .andExpect(jsonPath("$.data.requestId").value("rec-1"))
                .andExpect(jsonPath("$.data.startedAt").value("2026-01-10T10:00:00"))
                .andExpect(jsonPath("$.data.endedAt").value("2026-01-10T10:30:00")));

        perform(get(SESSIONS + "/" + id), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").doesNotExist())
                .andExpect(jsonPath("$.data.exercises.length()").value(2))
                .andExpect(jsonPath("$.data.exercises[0].exerciseName").value("스쿼트"))
                .andExpect(jsonPath("$.data.exercises[0].recordType").value("weight"))
                .andExpect(jsonPath("$.data.exercises[0].setTargets.length()").value(3))
                .andExpect(jsonPath("$.data.exercises[0].setTargets[1].weightKg").value(50))
                .andExpect(jsonPath("$.data.exercises[0].sets.length()").value(2))
                .andExpect(jsonPath("$.data.exercises[0].sets[0].setNumber").value(1))
                .andExpect(jsonPath("$.data.exercises[0].sets[1].setNumber").value(3))
                .andExpect(jsonPath("$.data.exercises[0].sets[1].reps").value(8))
                .andExpect(jsonPath("$.data.exercises[0].sets[1].weightKg").value(60))
                .andExpect(jsonPath("$.data.exercises[1].recordType").value("time"))
                .andExpect(jsonPath("$.data.exercises[1].sets[0].durationSeconds").value(31))
                .andExpect(jsonPath("$.data.exercises[1].sets[0].reps").doesNotExist());
    }

    @Test
    void uploadedRecordCountsInStatsAndTheDailyReward() throws Exception {
        send(post(RECORDS), ME, record("rec-stats", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isCreated());

        // Volume = 12 x 40 + 8 x 60 = 960. Duration = 30 minutes.
        perform(get(SESSIONS + "/summary").param("from", "2026-01-10").param("to", "2026-01-10"), ME)
                .andExpect(jsonPath("$.data.sessionCount").value(1))
                .andExpect(jsonPath("$.data.totalDurationSeconds").value(1800))
                .andExpect(jsonPath("$.data.totalVolumeKg").value(960));

        assertThat(workoutCheck.hasCompletedWorkout(1001L, LocalDate.of(2026, 1, 10))).isTrue();
        assertThat(workoutCheck.hasCompletedWorkout(1001L, LocalDate.of(2026, 1, 9))).isFalse();
    }

    @Test
    void justAfterMidnightInKoreaCountsForTheKoreanDate() throws Exception {
        // 15:30Z on the 9th is 00:30 on the 10th in Korea.
        send(post(RECORDS), ME, record("rec-midnight", "2026-01-09T15:30:00Z", "2026-01-09T15:45:00Z", EXERCISES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.startedAt").value("2026-01-10T00:30:00"));
        assertThat(workoutCheck.hasCompletedWorkout(1001L, LocalDate.of(2026, 1, 10))).isTrue();
        assertThat(workoutCheck.hasCompletedWorkout(1001L, LocalDate.of(2026, 1, 9))).isFalse();
    }

    @Test
    void repeatedUploadReturnsTheFirstSession() throws Exception {
        String first = sessionId(send(post(RECORDS), ME,
                record("rec-repeat", "2026-01-10T01:00:00.000Z", "2026-01-10T01:30:00.000Z", EXERCISES))
                .andExpect(status().isCreated()));

        // Same instant written another way (+09:00, a fraction of a second, 60 instead of 60.00): same record.
        String second = sessionId(send(post(RECORDS), ME, record("rec-repeat", "2026-01-10T10:00:00.400+09:00",
                "2026-01-10T10:30:00+09:00", EXERCISES.replace("60.00", "60")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(false)));

        assertThat(second).isEqualTo(first);
        assertThat(countSessions(ME)).isEqualTo(1);
    }

    @Test
    void sameRequestIdWithDifferentContentIsAConflict() throws Exception {
        send(post(RECORDS), ME, record("rec-x", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isCreated());

        send(post(RECORDS), ME, record("rec-x", "2026-01-10T01:00:00Z", "2026-01-10T01:40:00Z", EXERCISES))
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REQUEST_CONFLICT"));
        send(post(RECORDS), ME, record("rec-x", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z",
                EXERCISES.replace("\"durationSeconds\":31", "\"durationSeconds\":32")))
                .andExpect(status().isConflict());
        assertThat(countSessions(ME)).isEqualTo(1);
    }

    @Test
    void requestIdsAreSeparatePerMember() throws Exception {
        String body = record("rec-shared", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES);
        String mine = sessionId(send(post(RECORDS), ME, body).andExpect(status().isCreated()));
        String theirs = sessionId(send(post(RECORDS), OTHER, body).andExpect(status().isCreated()));
        assertThat(theirs).isNotEqualTo(mine);
        perform(get(SESSIONS + "/" + mine), OTHER).andExpect(status().isForbidden());
    }

    @Test
    void requestIdIsCaseSensitive() throws Exception {
        String upper = sessionId(send(post(RECORDS), ME,
                record("REC-1", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isCreated()));
        String lower = sessionId(send(post(RECORDS), ME,
                record("rec-1", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.requestId").value("rec-1")));
        assertThat(lower).isNotEqualTo(upper);
        assertThat(countSessions(ME)).isEqualTo(2);
    }

    @Test
    void searchCanIncludeExercises() throws Exception {
        send(post(RECORDS), ME, record("rec-list", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isCreated());

        perform(get(SESSIONS).param("from", "2026-01-10").param("to", "2026-01-10"), ME)
                .andExpect(jsonPath("$.data.content[0].exercises").doesNotExist());
        perform(get(SESSIONS).param("from", "2026-01-10").param("to", "2026-01-10")
                .param("status", "completed").param("includeExercises", "true"), ME)
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].exercises.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].exercises[0].setTargets.length()").value(3))
                .andExpect(jsonPath("$.data.content[0].exercises[0].sets[1].setNumber").value(3));
    }

    @Test
    void anExerciseWithNoCompletedSetIsKept() throws Exception {
        send(post(RECORDS), ME, record("rec-partial", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", """
                [{"exerciseId":2001,"recordType":"reps","setTargets":[{"reps":10}],
                  "completedSets":[{"setNumber":1,"reps":10}]},
                 {"exerciseId":2002,"recordType":"time","setTargets":[{"targetSeconds":30}],"completedSets":[]}]"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.exercises[1].setTargets.length()").value(1))
                .andExpect(jsonPath("$.data.exercises[1].sets.length()").value(0));
    }

    @Test
    void timedSetWithoutTheTimerHasNoDuration() throws Exception {
        send(post(RECORDS), ME, record("rec-untimed", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", """
                [{"exerciseId":2002,"recordType":"time","setTargets":[{"targetSeconds":30}],
                  "completedSets":[{"setNumber":1}]}]"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.exercises[0].sets[0].setNumber").value(1))
                .andExpect(jsonPath("$.data.exercises[0].sets[0].durationSeconds").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = {
        // A field the record type does not use, or a missing required one.
        "{\"exerciseId\":2001,\"recordType\":\"weight\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"weightKg\":5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":10,\"weightKg\":5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":10,\"durationSeconds\":5}]}",
        "{\"exerciseId\":2002,\"recordType\":\"time\",\"setTargets\":[{\"targetSeconds\":30}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":3}]}",
        // Set numbers: 1..planned count, strictly increasing, no more sets than planned.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":2,\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":0,\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10},{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":2,\"reps\":10},{\"setNumber\":1,\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10},{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":10},{\"setNumber\":1,\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"reps\":10}]}",
        // Values.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":10.5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":1,\"reps\":0}]}",
        "{\"exerciseId\":2002,\"recordType\":\"time\",\"setTargets\":[{\"targetSeconds\":30}],"
                + "\"completedSets\":[{\"setNumber\":1,\"durationSeconds\":-1}]}",
        "{\"exerciseId\":2002,\"recordType\":\"time\",\"setTargets\":[{\"targetSeconds\":30}],"
                + "\"completedSets\":[{\"setNumber\":1,\"durationSeconds\":86401}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}],"
                + "\"completedSets\":[{\"setNumber\":\"1\",\"reps\":10}]}",
        // Targets follow the routine rules, and both lists are required.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[],\"completedSets\":[]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"setTargets\":[{\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"completedSets\":[{\"setNumber\":1,\"reps\":10}]}",
        "{\"exerciseId\":2001,\"setTargets\":[{\"reps\":10}],\"completedSets\":[{\"setNumber\":1,\"reps\":10}]}"
    })
    void badExercisesAreRejected(String exercise) throws Exception {
        send(post(RECORDS), ME, record("rec-bad", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z",
                "[" + exercise + "]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));
        assertThat(countSessions(ME)).isZero();
    }

    @Test
    void recordNeedsAtLeastOneCompletedSet() throws Exception {
        send(post(RECORDS), ME, record("rec-empty", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", """
                [{"exerciseId":2001,"recordType":"reps","setTargets":[{"reps":10}],"completedSets":[]}]"""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void badTimesAndRequestIdsAreRejected() throws Exception {
        // Ends before it starts.
        send(post(RECORDS), ME, record("rec-t", "2026-01-10T01:30:00Z", "2026-01-10T01:00:00Z", EXERCISES))
                .andExpect(status().isBadRequest());
        // No offset: the server cannot tell which clock it is.
        send(post(RECORDS), ME, record("rec-t", "2026-01-10T10:00:00", "2026-01-10T10:30:00", EXERCISES))
                .andExpect(status().isBadRequest());
        send(post(RECORDS), ME, record("bad id", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isBadRequest());
        send(post(RECORDS), ME, """
                {"startedAt":"2026-01-10T01:00:00Z","endedAt":"2026-01-10T01:30:00Z","exercises":%s}"""
                .formatted(EXERCISES))
                .andExpect(status().isBadRequest());
        assertThat(countSessions(ME)).isZero();
    }

    @Test
    void unknownExerciseAndGuestsAreRefused() throws Exception {
        send(post(RECORDS), ME, record("rec-404", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", """
                [{"exerciseId":999999,"recordType":"reps","setTargets":[{"reps":10}],
                  "completedSets":[{"setNumber":1,"reps":10}]}]"""))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(ERROR_CODE).value("EXERCISE_NOT_FOUND"));
        send(post(RECORDS), null, record("rec-guest", "2026-01-10T01:00:00Z", "2026-01-10T01:30:00Z", EXERCISES))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
    }

    private static String record(String requestId, String startedAt, String endedAt, String exercises) {
        return """
                {"requestId":"%s","startedAt":"%s","endedAt":"%s","exercises":%s}"""
                .formatted(requestId, startedAt, endedAt, exercises);
    }

    private int countSessions(String userId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from workout_sessions where user_id = ?", Integer.class, Long.valueOf(userId));
        return count == null ? 0 : count;
    }

    private static String sessionId(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return String.valueOf((Integer) JsonPath.read(body, "$.data.workoutSessionId"));
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String userId, String json) throws Exception {
        return perform(request.contentType(MediaType.APPLICATION_JSON).content(json), userId);
    }

    /** Sends the request as that user with a real access token, then clears the persistence context. */
    private ResultActions perform(MockHttpServletRequestBuilder request, String userId) throws Exception {
        if (userId != null) {
            String token = jwtTokenProvider.createAccessToken(Long.valueOf(userId), UserRole.USER, Instant.now());
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        ResultActions result = mockMvc.perform(request);
        entityManager.flush();
        entityManager.clear();
        return result;
    }
}
