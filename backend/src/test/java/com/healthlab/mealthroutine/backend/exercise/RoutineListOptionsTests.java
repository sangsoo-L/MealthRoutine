package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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
 * GET /workout-routines options for the frontend routine list: {@code mine} (only the caller's routines, newest edit
 * first) and {@code includeItems} (items as in the detail response). Without them the response is unchanged.
 * Runs on the mealthroutine_test MySQL DB; every test rolls back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RoutineListOptionsTests {

    private static final String ME = "1001";
    private static final String OTHER = "1002";
    private static final String ROUTINES = "/api/v1/workout-routines";
    private static final String CONTENT = "$.data.content";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

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
    void mineKeepsOnlyTheCallersRoutinesNewestEditFirst() throws Exception {
        long older = create(ME, "내 루틴 1", "private");
        long newer = create(ME, "내 루틴 2", "public");
        long others = create(OTHER, "남의 공개 루틴", "public");
        // DATETIME keeps whole seconds, so set the edit times instead of relying on two saves landing in different seconds.
        jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 10:00:00' where routine_id = ?", newer);
        jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 11:00:00' where routine_id = ?", older);

        String body = perform(get(ROUTINES).param("mine", "true"), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(ids(body)).containsExactly(older, newer);
        assertThat(ids(body)).doesNotContain(others);
        // Owner-only fields are there, items are not unless asked for.
        perform(get(ROUTINES).param("mine", "true"), ME)
                .andExpect(jsonPath(CONTENT + "[0].revision").value(1))
                .andExpect(jsonPath(CONTENT + "[0].items").doesNotExist());
    }

    @Test
    void includeItemsAddsTheItemsOfEveryRoutineOnThePage() throws Exception {
        create(ME, "내 루틴 1", "private");
        create(ME, "내 루틴 2", "private");

        perform(get(ROUTINES).param("mine", "true").param("includeItems", "true"), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath(CONTENT + ".length()").value(2))
                .andExpect(jsonPath(CONTENT + "[0].items.length()").value(2))
                .andExpect(jsonPath(CONTENT + "[0].items[0].exerciseId").value(2001))
                .andExpect(jsonPath(CONTENT + "[0].items[0].recordType").value("weight"))
                .andExpect(jsonPath(CONTENT + "[0].items[0].sets[1].weightKg").value(50))
                .andExpect(jsonPath(CONTENT + "[0].items[1].recordType").value("time"))
                .andExpect(jsonPath(CONTENT + "[1].items.length()").value(2));
    }

    @Test
    void anEditMovesTheRoutineToTheTopOfMine() throws Exception {
        long first = create(ME, "처음 루틴", "private");
        long second = create(ME, "두 번째 루틴", "private");
        jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 10:00:00' where routine_id = ?", first);
        jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 11:00:00' where routine_id = ?", second);
        assertThat(mineIds()).containsExactly(second, first);

        // Name only.
        send(patch(ROUTINES + "/" + first), ME, "{\"routineName\":\"이름만 바꿈\"}").andExpect(status().isOk());
        assertThat(mineIds()).containsExactly(first, second);

        // Items only.
        jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 09:00:00' where routine_id = ?", first);
        send(patch(ROUTINES + "/" + second), ME, """
                {"items":[{"exerciseId":2002,"recordType":"time","sets":[{"targetSeconds":45}]}]}""")
                .andExpect(status().isOk());
        assertThat(mineIds()).containsExactly(second, first);
    }

    @Test
    void routinesSavedInTheSameSecondKeepAStableOrderAcrossPages() throws Exception {
        // DATETIME keeps whole seconds, so ties are normal. The routineId tie-break keeps paging stable.
        List<Long> created = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            long id = create(ME, "같은 초 " + i, "private");
            jdbcTemplate.update("update exercise_routines set updated_at = '2026-01-10 10:00:00' where routine_id = ?", id);
            created.add(id);
        }
        List<Long> seen = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            String body = perform(get(ROUTINES).param("mine", "true").param("size", "2").param("page", String.valueOf(page)),
                    ME)
                    .andExpect(jsonPath("$.data.totalElements").value(5))
                    .andExpect(jsonPath("$.data.totalPages").value(3))
                    .andReturn().getResponse().getContentAsString();
            seen.addAll(ids(body));
        }
        assertThat(seen).containsExactlyElementsOf(created.reversed());
    }

    @Test
    void itemsLoadInBatchesNotOneQueryPerRoutine() throws Exception {
        // Every routine gets its own exercise, so one query per routine or per exercise would both show up.
        for (int i = 1; i <= 12; i++) {
            long exerciseId = 3000L + i;
            jdbcTemplate.update("insert into exercises (exercise_id, name) values (?, ?)", exerciseId, "운동 " + i);
            send(post(ROUTINES), ME, """
                    {"routineName":"루틴 %d","items":[{"exerciseId":%d,"recordType":"reps","sets":[{"reps":10}]}]}"""
                    .formatted(i, exerciseId)).andExpect(status().isCreated());
        }
        // Statistics are switched on only around this request, so the test shares the usual Spring context (a context
        // of its own would open another connection pool against the shared test DB).
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean wasEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            perform(get(ROUTINES).param("mine", "true").param("includeItems", "true").param("size", "100"), ME)
                    .andExpect(jsonPath(CONTENT + ".length()").value(12))
                    .andExpect(jsonPath(CONTENT + "[11].items[0].exerciseName").value("운동 1"));
            // Hibernate runs three statements: the page, the items (batch_fetch_size 100) and the exercises. The count
            // query is skipped because the page is not full, and the login check uses JdbcTemplate, which is not counted.
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        } finally {
            statistics.setStatisticsEnabled(wasEnabled);
        }
    }

    @Test
    void withoutTheOptionsTheListIsUnchanged() throws Exception {
        long mine = create(ME, "내 루틴", "private");
        long others = create(OTHER, "남의 공개 루틴", "public");
        create(OTHER, "남의 비공개 루틴", "private");

        String body = perform(get(ROUTINES), ME)
                .andExpect(status().isOk())
                .andExpect(jsonPath(CONTENT + "[0].items").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(ids(body)).containsExactly(others, mine); // newest first, as before
        // includeItems on the default list: another member's public routine shows its items but not owner-only fields.
        perform(get(ROUTINES).param("includeItems", "true"), ME)
                .andExpect(jsonPath(CONTENT + "[0].routineId").value(others))
                .andExpect(jsonPath(CONTENT + "[0].items.length()").value(2))
                .andExpect(jsonPath(CONTENT + "[0].revision").doesNotExist())
                .andExpect(jsonPath(CONTENT + "[0].requestId").doesNotExist());
    }

    @Test
    void guestsMayNotAskForMine() throws Exception {
        create(OTHER, "남의 공개 루틴", "public");
        perform(get(ROUTINES).param("mine", "true"), null)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
        perform(get(ROUTINES).param("includeItems", "true"), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath(CONTENT + "[0].items.length()").value(2));
        perform(get(ROUTINES).param("mine", "maybe"), ME).andExpect(status().isBadRequest());
    }

    private long create(String userId, String name, String visibility) throws Exception {
        String body = perform(post(ROUTINES).contentType(MediaType.APPLICATION_JSON).content("""
                {"routineName":"%s","visibility":"%s","items":[
                  {"exerciseId":2001,"recordType":"weight","sets":[{"reps":12,"weightKg":40},{"reps":10,"weightKg":50}]},
                  {"exerciseId":2002,"recordType":"time","sets":[{"targetSeconds":30}]}]}""".formatted(name, visibility)),
                userId)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.data.routineId")).longValue();
    }

    private List<Long> mineIds() throws Exception {
        return ids(perform(get(ROUTINES).param("mine", "true"), ME).andReturn().getResponse().getContentAsString());
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String userId, String json) throws Exception {
        return perform(request.contentType(MediaType.APPLICATION_JSON).content(json), userId);
    }

    private static List<Long> ids(String body) {
        List<Number> ids = JsonPath.read(body, CONTENT + "[*].routineId");
        return ids.stream().map(Number::longValue).toList();
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
