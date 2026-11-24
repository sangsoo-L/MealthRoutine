package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.time.Instant;
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
 * Routine contract for the frontend's routine store (workoutRepositories.ts WorkoutRoutineRepository): per-set targets
 * with a record type, requestId for repeated creates, and revision for concurrent edits.
 * Runs against the mealthroutine_test MySQL DB from docker-compose; every test rolls back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RoutineContractTests {

    private static final String ME = "1001";
    private static final String OTHER = "1002";
    private static final String ROUTINES = "/api/v1/workout-routines";
    private static final String ERROR_CODE = "$.errorCode";
    private static final String INVALID_REQUEST = "INVALID_REQUEST";

    /** 스쿼트 weight 3 sets with different targets, 플랭크 time 2 sets. */
    private static final String PER_SET_ITEMS = """
            [{"exerciseId":2001,"recordType":"weight","restSeconds":60,
              "sets":[{"reps":12,"weightKg":40},{"reps":10,"weightKg":50.00},{"reps":8,"weightKg":22.50}]},
             {"exerciseId":2002,"recordType":"time","sets":[{"targetSeconds":30},{"targetSeconds":45}]}]""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

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
    void perSetRoutineKeepsEveryTargetAndFillsOldColumns() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, "rt-1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.created").value(true))
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.requestId").value("rt-1")));

        perform(get(ROUTINES + "/" + id), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].recordType").value("weight"))
                .andExpect(jsonPath("$.data.items[0].sets.length()").value(3))
                .andExpect(jsonPath("$.data.items[0].sets[0].reps").value(12))
                .andExpect(jsonPath("$.data.items[0].sets[0].weightKg").value(40))
                .andExpect(jsonPath("$.data.items[0].sets[0].targetSeconds").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].sets[1].weightKg").value(50))
                .andExpect(jsonPath("$.data.items[0].sets[2].weightKg").value(22.5))
                .andExpect(jsonPath("$.data.items[0].targetSets").value(3))
                .andExpect(jsonPath("$.data.items[0].targetReps").value(12))
                .andExpect(jsonPath("$.data.items[0].restSeconds").value(60))
                .andExpect(jsonPath("$.data.items[1].recordType").value("time"))
                .andExpect(jsonPath("$.data.items[1].sets[1].targetSeconds").value(45))
                .andExpect(jsonPath("$.data.items[1].targetSets").value(2))
                .andExpect(jsonPath("$.data.items[1].targetReps").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].targetDurationSeconds").value(30));
    }

    @Test
    void compoundRecordTypesAreAccepted() throws Exception {
        send(post(ROUTINES), ME, routine("복합", """
                [{"exerciseId":2001,"recordType":"time_reps","sets":[{"reps":10,"targetSeconds":40}]},
                 {"exerciseId":2002,"recordType":"weight_time","sets":[{"targetSeconds":60},
                   {"targetSeconds":60,"weightKg":5}]},
                 {"exerciseId":2001,"recordType":"reps","sets":[{"reps":15}]}]""", null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.items[0].sets[0].reps").value(10))
                .andExpect(jsonPath("$.data.items[0].sets[0].targetSeconds").value(40))
                .andExpect(jsonPath("$.data.items[1].sets[0].weightKg").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].sets[1].weightKg").value(5));
    }

    @Test
    void repeatedCreateWithSameRequestIdReturnsTheFirstRoutine() throws Exception {
        String body = routine("하체 루틴", PER_SET_ITEMS, "rt-repeat");
        String first = routineId(send(post(ROUTINES), ME, body).andExpect(status().isCreated()));

        // 50.00 and 50 are the same weight, so this is the same request.
        String second = routineId(send(post(ROUTINES), ME, body.replace("50.00", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(false)));

        assertThat(second).isEqualTo(first);
        assertThat(countRoutines(ME)).isEqualTo(1);
    }

    @Test
    void sameRequestIdWithDifferentContentIsAConflict() throws Exception {
        send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, "rt-x")).andExpect(status().isCreated());

        send(post(ROUTINES), ME, routine("다른 이름", PER_SET_ITEMS, "rt-x"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REQUEST_CONFLICT"));
        send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS.replace("\"reps\":8", "\"reps\":9"), "rt-x"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REQUEST_CONFLICT"));
        assertThat(countRoutines(ME)).isEqualTo(1);
    }

    @Test
    void requestIdsAreSeparatePerMember() throws Exception {
        String body = routine("하체 루틴", PER_SET_ITEMS, "rt-shared");
        String mine = routineId(send(post(ROUTINES), ME, body).andExpect(status().isCreated()));
        String theirs = routineId(send(post(ROUTINES), OTHER, body).andExpect(status().isCreated()));
        assertThat(theirs).isNotEqualTo(mine);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        // A field the record type does not use, or a missing required one.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":10,\"weightKg\":5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":10,\"targetSeconds\":5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight\",\"sets\":[{\"weightKg\":5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"time\",\"sets\":[{\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"time_reps\",\"sets\":[{\"targetSeconds\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight_time\",\"sets\":[{\"reps\":10,\"targetSeconds\":10}]}",
        // Limits: reps 1~999 whole, seconds 1~3600 whole, weight 0~999 with 2 decimals.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":0}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":1000}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":10.5}]}",
        "{\"exerciseId\":2001,\"recordType\":\"time\",\"sets\":[{\"targetSeconds\":3601}]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight\",\"sets\":[{\"reps\":10,\"weightKg\":-1}]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight\",\"sets\":[{\"reps\":10,\"weightKg\":1000}]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight\",\"sets\":[{\"reps\":10,\"weightKg\":20.125}]}",
        // Not a plain number.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":\"10\"}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":1e1}]}",
        // Shape: record type and sets go together, and do not mix with targetSets.
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\"}",
        "{\"exerciseId\":2001,\"sets\":[{\"reps\":10}]}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[{\"reps\":10}],\"targetSets\":1}",
        "{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[null]}",
        "{\"exerciseId\":2001,\"recordType\":\"weight_reps\",\"sets\":[{\"reps\":10}]}",
        // Old shape still needs targetSets.
        "{\"exerciseId\":2001,\"targetReps\":10}"
    })
    void badItemsAreRejected(String item) throws Exception {
        send(post(ROUTINES), ME, routine("나쁜 루틴", "[" + item + "]", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value(INVALID_REQUEST));
        assertThat(countRoutines(ME)).isZero();
    }

    @Test
    void tooManySetsAreRejected() throws Exception {
        String sets = String.join(",", java.util.Collections.nCopies(201, "{\"reps\":1}"));
        send(post(ROUTINES), ME, routine("세트 많음",
                "[{\"exerciseId\":2001,\"recordType\":\"reps\",\"sets\":[" + sets + "]}]", null))
                .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "has space", "한글", "a/b"})
    void badRequestIdIsRejected(String requestId) throws Exception {
        send(post(ROUTINES), ME, routine("루틴", PER_SET_ITEMS, requestId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath(ERROR_CODE).value(INVALID_REQUEST));
    }

    @Test
    void updateRaisesRevisionAndRefusesAStaleOne() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, null)));

        send(patch(ROUTINES + "/" + id), ME, "{\"routineName\":\"폰에서 수정\",\"expectedRevision\":1}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(2));

        // A second device still holding revision 1.
        send(patch(ROUTINES + "/" + id), ME, "{\"routineName\":\"PC에서 수정\",\"expectedRevision\":1}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REVISION_MISMATCH"))
                .andExpect(jsonPath("$.data.currentRevision").value(2));

        // Without expectedRevision the old behavior stays: the update applies.
        send(patch(ROUTINES + "/" + id), ME, "{\"description\":\"설명\"}")
                .andExpect(jsonPath("$.data.revision").value(3));

        perform(get(ROUTINES + "/" + id), ME)
                .andExpect(jsonPath("$.data.routineName").value("폰에서 수정"))
                .andExpect(jsonPath("$.data.revision").value(3));
    }

    @Test
    void updateCanReplaceItemsWithPerSetTargets() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, """
                {"routineName":"예전 루틴","items":[{"exerciseId":2001,"targetSets":3,"targetReps":10}]}"""));

        send(patch(ROUTINES + "/" + id), ME, """
                {"expectedRevision":1,"items":[{"exerciseId":2002,"recordType":"reps",
                  "sets":[{"reps":5},{"reps":6}]}]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].exerciseId").value(2002))
                .andExpect(jsonPath("$.data.items[0].sets[1].reps").value(6))
                .andExpect(jsonPath("$.data.items[0].targetSets").value(2));

        // A bad item leaves the routine and its revision unchanged.
        send(patch(ROUTINES + "/" + id), ME, """
                {"expectedRevision":2,"items":[{"exerciseId":2002,"recordType":"reps","sets":[{"reps":0}]}]}""")
                .andExpect(status().isBadRequest());
        perform(get(ROUTINES + "/" + id), ME).andExpect(jsonPath("$.data.revision").value(2));
    }

    @Test
    void oldStylePatchCannotSilentlyDropPerSetTargets() throws Exception {
        // Created with per-set targets, then an old-style PATCH, then read back (review of the routine contract PR).
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, null)));
        String oldStyle = "[{\"exerciseId\":2001,\"targetSets\":3,\"targetReps\":10}]";

        send(patch(ROUTINES + "/" + id), ME, "{\"items\":" + oldStyle + "}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("SET_TARGETS_WOULD_BE_LOST"));
        // One old-style item among per-set ones is refused too.
        send(patch(ROUTINES + "/" + id), ME, """
                {"items":[{"exerciseId":2001,"recordType":"reps","sets":[{"reps":5}]},
                          {"exerciseId":2002,"targetSets":2}]}""")
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("SET_TARGETS_WOULD_BE_LOST"));

        perform(get(ROUTINES + "/" + id), ME)
                .andExpect(jsonPath("$.data.revision").value(1))
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].sets.length()").value(3))
                .andExpect(jsonPath("$.data.items[0].sets[2].weightKg").value(22.5));

        // Asked for on purpose: the per-set targets go away.
        send(patch(ROUTINES + "/" + id), ME, "{\"discardSetTargets\":true,\"items\":" + oldStyle + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.revision").value(2));
        perform(get(ROUTINES + "/" + id), ME)
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].targetSets").value(3))
                .andExpect(jsonPath("$.data.items[0].recordType").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].sets").doesNotExist());
    }

    @Test
    void patchesThatKeepPerSetTargetsNeedNoFlag() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, null)));

        send(patch(ROUTINES + "/" + id), ME, "{\"routineName\":\"이름만\"}").andExpect(status().isOk());
        perform(get(ROUTINES + "/" + id), ME).andExpect(jsonPath("$.data.items[0].sets.length()").value(3));

        send(patch(ROUTINES + "/" + id), ME, """
                {"items":[{"exerciseId":2002,"recordType":"reps","sets":[{"reps":5},{"reps":7}]}]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].sets[1].reps").value(7));
    }

    @Test
    void requestIdIsCaseSensitive() throws Exception {
        String upper = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, "RT-1"))
                .andExpect(status().isCreated()));
        String lower = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, "rt-1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.requestId").value("rt-1")));
        assertThat(lower).isNotEqualTo(upper);
        assertThat(countRoutines(ME)).isEqualTo(2);
    }

    @Test
    void resendingAfterAnEditIsAConflictAndAfterADeleteCreatesAgain() throws Exception {
        String body = routine("하체 루틴", PER_SET_ITEMS, "rt-life");
        String id = routineId(send(post(ROUTINES), ME, body).andExpect(status().isCreated()));

        // Compared with the routine as it is now, the same way the frontend's local store does.
        send(patch(ROUTINES + "/" + id), ME, "{\"routineName\":\"수정됨\"}").andExpect(status().isOk());
        send(post(ROUTINES), ME, body)
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REQUEST_CONFLICT"));

        // After a delete no routine holds the requestId, so the same request makes a new one.
        perform(delete(ROUTINES + "/" + id), ME).andExpect(status().isOk());
        String again = routineId(send(post(ROUTINES), ME, body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.created").value(true)));
        assertThat(again).isNotEqualTo(id);
    }

    @Test
    void oldItemsHaveNoRecordTypeOrSets() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, """
                {"routineName":"예전 루틴","items":[{"exerciseId":2001,"targetSets":3,"targetReps":10}]}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.requestId").doesNotExist()));

        perform(get(ROUTINES + "/" + id), ME)
                .andExpect(jsonPath("$.data.items[0].targetSets").value(3))
                .andExpect(jsonPath("$.data.items[0].recordType").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].sets").doesNotExist());
    }

    @Test
    void deleteChecksRevisionWhenGiven() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, null)));
        send(patch(ROUTINES + "/" + id), ME, "{\"routineName\":\"수정\"}").andExpect(status().isOk());

        perform(delete(ROUTINES + "/" + id).param("expectedRevision", "1"), ME)
                .andExpect(status().isConflict())
                .andExpect(jsonPath(ERROR_CODE).value("REVISION_MISMATCH"))
                .andExpect(jsonPath("$.data.currentRevision").value(2));
        perform(delete(ROUTINES + "/" + id).param("expectedRevision", "2"), ME).andExpect(status().isOk());
        perform(get(ROUTINES + "/" + id), ME).andExpect(status().isNotFound());
    }

    @Test
    void revisionCheckDoesNotLeakOtherMembersRoutines() throws Exception {
        String id = routineId(send(post(ROUTINES), ME, routine("하체 루틴", PER_SET_ITEMS, null)));
        // Ownership is checked before the revision, so a stranger never learns the current revision.
        send(patch(ROUTINES + "/" + id), OTHER, "{\"routineName\":\"x\",\"expectedRevision\":9}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.data").doesNotExist());
        perform(delete(ROUTINES + "/" + id).param("expectedRevision", "9"), OTHER)
                .andExpect(status().isForbidden());
    }

    private static String routine(String name, String items, String requestId) {
        String request = requestId == null ? "" : ",\"requestId\":\"" + requestId + "\"";
        return "{\"routineName\":\"" + name + "\",\"items\":" + items + request + "}";
    }

    private int countRoutines(String ownerId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from exercise_routines where owner_user_id = ?", Integer.class, Long.valueOf(ownerId));
        return count == null ? 0 : count;
    }

    private static String routineId(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return String.valueOf((Integer) JsonPath.read(body, "$.data.routineId"));
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
