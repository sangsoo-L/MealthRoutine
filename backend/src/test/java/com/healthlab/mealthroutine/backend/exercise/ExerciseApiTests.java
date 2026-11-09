package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/** Runs against the mealthroutine_test MySQL DB from docker-compose; every test rolls back. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExerciseApiTests {

    private static final String ME = "1001";
    private static final String OTHER = "1002";
    private static final String ROUTINES = "/api/v1/workout-routines";
    private static final String SESSIONS = "/api/v1/workout-sessions";
    private static final String GOALS = "/api/v1/exercise-goals";
    private static final String FAVORITES = "/api/v1/users/me/favorite-exercises";
    private static final String ERROR_CODE = "$.errorCode";
    private static final String FAVORITE_2001 = FAVORITES + "/2001";
    private static final String SUMMARY = SESSIONS + "/summary";
    private static final String TOTAL_ELEMENTS = "$.data.totalElements";
    private static final String PRIVATE = "private";
    private static final String FROM = "from";
    private static final String TO = "to";
    private static final String DAY = "2026-01-10";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (1001, 'me', true)");
        jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (1002, 'other', true)");
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (2001, '스쿼트', 'beginner', '하체', 'body')");
        jdbcTemplate.update("insert into exercises (exercise_id, name, difficulty, exercise_type, exercise_equipment)"
                + " values (2002, '덤벨 로우', 'advanced', '등', 'dumbbell')");
    }

    @Test
    void searchFiltersExercisesForGuests() throws Exception {
        perform(get("/api/v1/exercises").param("keyword", "스쿼").param("difficulty", "beginner"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath(TOTAL_ELEMENTS).value(1))
                .andExpect(jsonPath("$.data.content[0].difficulty").value("beginner"));

        perform(get("/api/v1/exercises").param("difficulty", "nope"), null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_REQUEST"));
        perform(get("/api/v1/exercises").param("size", "101"), null).andExpect(status().isBadRequest());
    }

    @Test
    void unknownExerciseIs404() throws Exception {
        perform(get("/api/v1/exercises/999999"), null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(ERROR_CODE).value("EXERCISE_NOT_FOUND"));
    }

    @Test
    void memberApisTellGuestsToLogIn() throws Exception {
        for (MockHttpServletRequestBuilder request : new MockHttpServletRequestBuilder[] {
            get(FAVORITES), put(FAVORITE_2001), get(SESSIONS), get(SUMMARY), get(GOALS)}) {
            perform(request, null)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath(ERROR_CODE).value("LOGIN_REQUIRED"));
        }
        send(post(ROUTINES), null, routineJson(PRIVATE)).andExpect(status().isUnauthorized());
        perform(get(FAVORITES), "not-a-number").andExpect(status().isUnauthorized());
        perform(get(FAVORITES), "999999").andExpect(status().isUnauthorized());
    }

    @Test
    void favoritePutIsIdempotentAndDeleteRemoves() throws Exception {
        perform(put(FAVORITE_2001), ME).andExpect(status().isOk());
        perform(put(FAVORITE_2001), ME).andExpect(status().isOk());
        perform(get(FAVORITES), ME)
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].exerciseId").value(2001));

        perform(put(FAVORITES + "/999999"), ME).andExpect(status().isNotFound());
        perform(delete(FAVORITE_2001), ME).andExpect(status().isOk());
        perform(get(FAVORITES), ME).andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void routineVisibilityAndOwnershipAreEnforced() throws Exception {
        String privateId = createRoutine(PRIVATE);
        String publicId = createRoutine("public");

        perform(get(ROUTINES), null)
                .andExpect(jsonPath(TOTAL_ELEMENTS).value(1))
                .andExpect(jsonPath("$.data.content[0].routineId").value(Long.valueOf(publicId)));
        perform(get(ROUTINES), ME).andExpect(jsonPath(TOTAL_ELEMENTS).value(2));

        perform(get(ROUTINES + "/" + publicId), null).andExpect(status().isOk());
        perform(get(ROUTINES + "/" + privateId), null).andExpect(status().isUnauthorized());
        perform(get(ROUTINES + "/" + privateId), OTHER).andExpect(status().isForbidden());
        perform(delete(ROUTINES + "/" + publicId), OTHER).andExpect(status().isForbidden());
        send(patch(ROUTINES + "/" + publicId), OTHER, "{\"routineName\":\"x\"}").andExpect(status().isForbidden());
    }

    @Test
    void routineRejectsBadInputAndReplacesItemsInOrder() throws Exception {
        send(post(ROUTINES), ME, "{\"routineName\":\" \",\"items\":[]}").andExpect(status().isBadRequest());
        send(post(ROUTINES), ME, "{\"routineName\":\"a\",\"items\":[{\"exerciseId\":999999,\"targetSets\":1}]}")
                .andExpect(status().isNotFound());

        String routineId = createRoutine(PRIVATE);
        send(patch(ROUTINES + "/" + routineId), ME, """
                {"items":[{"exerciseId":2002,"targetSets":5},{"exerciseId":2001,"targetSets":2}]}""")
                .andExpect(status().isOk());

        perform(get(ROUTINES + "/" + routineId), ME)
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].exerciseId").value(2002))
                .andExpect(jsonPath("$.data.items[0].sequenceNumber").value(1))
                .andExpect(jsonPath("$.data.items[1].sequenceNumber").value(2));
    }

    @Test
    void sessionLifecycleAndSummary() throws Exception {
        String routineId = createRoutine(PRIVATE);
        String created = send(post(SESSIONS), ME, """
                {"routineId":%s,"startedAt":"2026-01-10T10:00:00"}""".formatted(routineId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("in_progress"))
                .andExpect(jsonPath("$.data.exercises[0].exerciseId").value(2001))
                .andReturn().getResponse().getContentAsString();
        String sessionId = String.valueOf((Integer) JsonPath.read(created, "$.data.workoutSessionId"));
        Integer itemId = JsonPath.read(created, "$.data.exercises[0].exerciseRoutineItemId");

        send(patch(SESSIONS + "/" + sessionId), ME, """
                {"endedAt":"2026-01-10T10:30:00","feedbackRating":5,"exercises":[{"exerciseId":2001,
                "exerciseRoutineItemId":%d,"sets":[{"reps":10,"weightKg":20},{"reps":8,"weightKg":20}]}]}"""
                .formatted(itemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.exercises[0].sets[1].setNumber").value(2));

        perform(get(SESSIONS + "/" + sessionId), OTHER).andExpect(status().isForbidden());
        send(patch(SESSIONS + "/" + sessionId + "/status"), ME, "{\"status\":\"in_progress\"}")
                .andExpect(status().isBadRequest());
        send(patch(SESSIONS + "/" + sessionId + "/status"), ME, "{\"status\":\"completed\"}")
                .andExpect(status().isOk());
        send(patch(SESSIONS + "/" + sessionId + "/status"), ME, "{\"status\":\"cancelled\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("INVALID_SESSION_STATUS"));

        perform(get(SESSIONS).param("status", "completed").param(FROM, DAY).param(TO, DAY), ME)
                .andExpect(jsonPath(TOTAL_ELEMENTS).value(1));
        perform(get(SUMMARY).param(FROM, DAY).param(TO, DAY), ME)
                .andExpect(jsonPath("$.data.sessionCount").value(1))
                .andExpect(jsonPath("$.data.totalDurationSeconds").value(1800))
                .andExpect(jsonPath("$.data.totalVolumeKg").value(360.0));
        perform(get(SUMMARY).param(FROM, "2026-01-11").param(TO, "2026-01-11"), ME)
                .andExpect(jsonPath("$.data.sessionCount").value(0))
                .andExpect(jsonPath("$.data.totalVolumeKg").value(0));
        perform(get(SUMMARY).param(FROM, "2026-01-11").param(TO, DAY), ME)
                .andExpect(status().isBadRequest());
    }

    @Test
    void sessionWithoutRoutineCanRecordExercisesButNotRoutineItems() throws Exception {
        send(post(SESSIONS), ME, """
                {"exercises":[{"exerciseId":2002,"sets":[{"durationSeconds":60}]}]}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.routineId").doesNotExist())
                .andExpect(jsonPath("$.data.exercises[0].exerciseName").value("덤벨 로우"));
        send(post(SESSIONS), ME, """
                {"exercises":[{"exerciseId":2002,"exerciseRoutineItemId":1}]}""")
                .andExpect(status().isBadRequest());
    }

    @Test
    void sessionCannotUseAnotherUsersPrivateRoutine() throws Exception {
        String routineId = createRoutine(PRIVATE);
        send(post(SESSIONS), OTHER, "{\"routineId\":%s}".formatted(routineId)).andExpect(status().isForbidden());
    }

    @Test
    void deletingRoutineKeepsSessionHistory() throws Exception {
        String routineId = createRoutine(PRIVATE);
        String created = send(post(SESSIONS), ME, "{\"routineId\":%s}".formatted(routineId))
                .andReturn().getResponse().getContentAsString();
        Integer sessionId = JsonPath.read(created, "$.data.workoutSessionId");

        perform(delete(ROUTINES + "/" + routineId), ME).andExpect(status().isOk());

        perform(get(SESSIONS + "/" + sessionId), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.routineId").doesNotExist())
                .andExpect(jsonPath("$.data.exercises[0].exerciseId").value(2001))
                .andExpect(jsonPath("$.data.exercises[0].exerciseRoutineItemId").doesNotExist());
    }

    @Test
    void goalCreateListUpdateAndValidation() throws Exception {
        String created = send(post(GOALS), ME, """
                {"goalName":"주 3회","startDate":"2026-01-01","exerciseMin":30,
                "preferenceExerciseEquipment":"dumbbell"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("active"))
                .andReturn().getResponse().getContentAsString();
        Integer goalId = JsonPath.read(created, "$.data.exerciseGoalId");

        send(post(GOALS), ME, "{\"goalName\":\"x\",\"startDate\":\"2026-01-02\",\"endDate\":\"2026-01-01\","
                + "\"exerciseMin\":30}").andExpect(status().isBadRequest());
        send(patch(GOALS + "/" + goalId), OTHER, "{\"status\":\"paused\"}").andExpect(status().isForbidden());
        send(patch(GOALS + "/999999"), ME, "{\"status\":\"paused\"}").andExpect(status().isNotFound());
        send(patch(GOALS + "/" + goalId), ME, "{\"status\":\"paused\"}").andExpect(status().isOk());

        perform(get(GOALS), ME)
                .andExpect(jsonPath("$.data[0].status").value("paused"))
                .andExpect(jsonPath("$.data[0].preferenceExerciseEquipment").value("dumbbell"));
        perform(get(GOALS), OTHER).andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void uniqueConstraintBlocksDuplicateFavorites() {
        String insert = "insert into preference_exercises (exercise_id, user_id) values (2001, 1001)";
        jdbcTemplate.update(insert);
        assertThatThrownBy(() -> jdbcTemplate.update(insert)).isInstanceOf(DuplicateKeyException.class);
    }

    private String createRoutine(String visibility) throws Exception {
        String body = send(post(ROUTINES), ME, routineJson(visibility))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return String.valueOf((Integer) JsonPath.read(body, "$.data.routineId"));
    }

    private String routineJson(String visibility) {
        return """
                {"routineName":"하체","visibility":"%s","items":[{"exerciseId":2001,"targetSets":3,"targetReps":10}]}"""
                .formatted(visibility);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String userId, String json) throws Exception {
        return perform(request.contentType(MediaType.APPLICATION_JSON).content(json), userId);
    }

    /** Clears the persistence context afterwards so each call reads what is really in the DB. */
    private ResultActions perform(MockHttpServletRequestBuilder request, String userId) throws Exception {
        if (userId != null) {
            request.header("X-User-Id", userId);
        }
        ResultActions result = mockMvc.perform(request);
        entityManager.flush();
        entityManager.clear();
        return result;
    }
}
