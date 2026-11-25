package com.healthlab.mealthroutine.backend.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Free board list, detail and create (C1). Every test rolls back, and the clock is fixed at 12:00 in Seoul on
 * 2026-11-25. The list tests assume the test DB has no other community posts (the table starts empty and every test
 * here rolls back).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CommunityPostApiTests {

    private static final String POSTS = "/api/v1/community/posts";
    private static final Instant NOW = Instant.parse("2026-11-25T03:00:00Z");
    private static final LocalDateTime NOW_LOCAL = LocalDateTime.of(2026, 11, 25, 12, 0, 0);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final AtomicLong NEXT_ID = new AtomicLong(9600L);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private Clock clock;

    private final AtomicReference<Instant> now = new AtomicReference<>(NOW);
    private long userId;
    private long otherUserId;

    @BeforeEach
    void setUp() {
        given(clock.instant()).willAnswer(invocation -> now.get());
        given(clock.getZone()).willReturn(ZONE);
        userId = NEXT_ID.getAndIncrement();
        otherUserId = NEXT_ID.getAndIncrement();
    }

    // ---------- POST ----------

    @Test
    void createUsesTheTokenMemberAsAuthorAndIgnoresAuthorFieldsInTheBody() throws Exception {
        insertMember(userId, "active", "글쓴이");
        insertMember(otherUserId, "active", "다른회원");
        now.set(NOW.plusMillis(789));

        String body = """
                {"postType":"general","title":"  첫 글  ","content":"\\n내용입니다\\n",
                 "userId":%d,"authorName":"다른회원","visibility":"hidden","createdAt":"2000-01-01T00:00:00"}
                """.formatted(otherUserId);
        String response = create(bearer(userId), body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andReturn().getResponse().getContentAsString();

        long postId = ((Number) JsonPath.read(response, "$.data.postId")).longValue();
        Map<String, Object> row = row(postId);
        assertThat(row.get("user_id")).isEqualTo(userId);
        assertThat(row.get("post_type")).isEqualTo("general");
        assertThat(row.get("title")).isEqualTo("첫 글");
        assertThat(row.get("content")).isEqualTo("내용입니다");
        assertThat(row.get("visibility")).isEqualTo("visible");
        // App clock in Seoul, fractions dropped (not the DB default, which is UTC on a local MySQL).
        assertThat(row.get("created_at")).isEqualTo(NOW_LOCAL);
        assertThat(row.get("updated_at")).isEqualTo(NOW_LOCAL);
    }

    @Test
    void createNeedsAUsableLogin() throws Exception {
        insertMember(userId, "active", "회원1");
        insertMember(otherUserId, "suspended", "정지회원");
        String body = "{\"postType\":\"general\",\"title\":\"t\",\"content\":\"c\"}";

        create(null, body).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
        String expired = "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER,
                NOW.minus(Duration.ofHours(2)));
        create(expired, body).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("TOKEN_EXPIRED"));
        create("Bearer not-a-token", body).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_TOKEN"));
        create(bearer(otherUserId), body).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_SUSPENDED"));
        assertThat(postCount()).isZero();
    }

    @Test
    void createRefusesEveryBadValueWithoutSavingARow() throws Exception {
        insertMember(userId, "active", "회원1");
        String ok = "\"postType\":\"general\",\"title\":\"제목\",\"content\":\"내용\"";
        List<String> bodies = List.of(
                // each required field: null, missing, or not a JSON string
                "{\"postType\":null,\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"postType\":1,\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":null,\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":12,\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":true,\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":[\"a\"],\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":{\"a\":1},\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"제목\",\"content\":null}",
                "{\"postType\":\"general\",\"title\":\"제목\"}",
                "{\"postType\":\"general\",\"title\":\"제목\",\"content\":5}",
                "{\"postType\":\"general\",\"title\":\"제목\",\"content\":{\"a\":1}}",
                // types not open in this unit, NOTICE, wrong case
                "{\"postType\":\"routine\",\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"postType\":\"question\",\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"postType\":\"notice\",\"title\":\"제목\",\"content\":\"내용\"}",
                "{\"postType\":\"General\",\"title\":\"제목\",\"content\":\"내용\"}",
                // blank after trimming, including no-break space and ideographic space
                "{\"postType\":\"general\",\"title\":\"\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"  \\t \",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"\\u00a0\\u00a0\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"\\u3000\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"\\ufeff\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"\\u2028\\u2029\\u000b\\u000c\\r\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"\\u2003\\u202f\\u205f\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"제목\",\"content\":\" \\n\\n \"}",
                // too long
                "{\"postType\":\"general\",\"title\":\"" + "가".repeat(251) + "\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"" + "😀".repeat(251) + "\",\"content\":\"내용\"}",
                "{\"postType\":\"general\",\"title\":\"제목\",\"content\":\"" + "a".repeat(5001) + "\"}",
                // not JSON at all
                "{" + ok,
                "");
        for (String body : bodies) {
            create(bearer(userId), body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        }
        assertThat(postCount()).isZero();
    }

    @Test
    void lengthsCountCodePointsAndTrimmedBlanksDoNotCount() throws Exception {
        insertMember(userId, "active", "회원1");

        long emoji = created(create(bearer(userId),
                "{\"postType\":\"general\",\"title\":\"" + "😀".repeat(250) + "\",\"content\":\"내용\"}"));
        assertThat((String) row(emoji).get("title")).hasSize(500); // 250 code points = 500 UTF-16 units

        long longest = created(create(bearer(userId), "{\"postType\":\"general\",\"title\":\"\\u00a0"
                + "가".repeat(250) + "\\u3000\",\"content\":\"" + "a".repeat(5000) + "\"}"));
        assertThat((String) row(longest).get("title")).isEqualTo("가".repeat(250));
        assertThat((String) row(longest).get("content")).hasSize(5000);

        // U+001C~U+001F are not trimmed by JavaScript's trim(), so they are kept here too (same rule as the screen).
        long control = created(create(bearer(userId),
                "{\"postType\":\"general\",\"title\":\"\\u001c제목\\u001f\",\"content\":\"내용\"}"));
        assertThat((String) row(control).get("title")).isEqualTo("\u001c제목\u001f");
    }

    // ---------- GET list ----------

    @Test
    void guestsSeeVisiblePostsNewestFirstInTheTeamPageFormat() throws Exception {
        insertMember(userId, "active", "회원1");
        long older = insertPost(userId, "general", "visible", NOW_LOCAL.minusHours(2));
        long sameTimeLow = insertPost(userId, "general", "visible", NOW_LOCAL.minusHours(1));
        long sameTimeHigh = insertPost(userId, "general", "visible", NOW_LOCAL.minusHours(1));
        insertPost(userId, "general", "hidden", NOW_LOCAL);
        insertPost(userId, "general", "deleted", NOW_LOCAL);
        long question = insertPost(userId, "question", "visible", NOW_LOCAL.minusMinutes(30));
        insertPost(userId, "notice", "visible", NOW_LOCAL);

        String body = mockMvc.perform(get(POSTS))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(4))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.content[0].postType").value("question"))
                .andExpect(jsonPath("$.data.content[1].title").value("title"))
                .andExpect(jsonPath("$.data.content[1].authorName").value("회원1"))
                .andExpect(jsonPath("$.data.content[1].createdAt").value("2026-11-25T11:00:00"))
                .andExpect(jsonPath("$.data.content[1].content").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(ids(body)).containsExactly(question, sameTimeHigh, sameTimeLow, older);

        String general = mockMvc.perform(get(POSTS).param("postType", "general"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(ids(general)).containsExactly(sameTimeHigh, sameTimeLow, older);

        String paged = mockMvc.perform(get(POSTS).param("postType", "general").param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.totalPages").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(ids(paged)).containsExactly(older);

        String beyond = mockMvc.perform(get(POSTS).param("page", "9"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(ids(beyond)).isEmpty();
    }

    @Test
    void listRefusesBadQueryValues() throws Exception {
        for (String[] query : List.of(
                new String[] {"postType", "notice"}, new String[] {"postType", "General"},
                new String[] {"postType", "free"}, new String[] {"postType", ""},
                new String[] {"page", "-1"}, new String[] {"page", "abc"}, new String[] {"page", "2147483648"},
                new String[] {"size", "0"}, new String[] {"size", "101"}, new String[] {"size", "abc"})) {
            mockMvc.perform(get(POSTS).param(query[0], query[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        }
        mockMvc.perform(get(POSTS).param("size", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1));
        mockMvc.perform(get(POSTS).param("size", "100")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
    }

    // ---------- GET detail ----------

    @Test
    void guestsReadOneVisiblePost() throws Exception {
        insertMember(userId, "active", "회원1");
        long postId = insertPost(userId, "general", "visible", NOW_LOCAL.minusMinutes(5));

        mockMvc.perform(get(POSTS + "/" + postId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(postId))
                .andExpect(jsonPath("$.data.postType").value("general"))
                .andExpect(jsonPath("$.data.title").value("title"))
                .andExpect(jsonPath("$.data.content").value("content " + postId))
                .andExpect(jsonPath("$.data.authorName").value("회원1"))
                .andExpect(jsonPath("$.data.createdAt").value("2026-11-25T11:55:00"))
                .andExpect(jsonPath("$.data.userId").doesNotExist());
    }

    @Test
    void missingHiddenDeletedNoticeAndNonPositiveIdsGetTheSame404() throws Exception {
        insertMember(userId, "active", "회원1");
        long hidden = insertPost(userId, "general", "hidden", NOW_LOCAL);
        long deleted = insertPost(userId, "general", "deleted", NOW_LOCAL);
        long notice = insertPost(userId, "notice", "visible", NOW_LOCAL); // C1-C2: never shown (Q-11)
        long missing = notice + 1000;

        for (String id : List.of(String.valueOf(hidden), String.valueOf(deleted), String.valueOf(notice),
                String.valueOf(missing), "0", "-1")) {
            mockMvc.perform(get(POSTS + "/" + id))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.errorCode").value("POST_NOT_FOUND"));
        }
        // routine and question stay readable; only NOTICE is hidden.
        for (String type : List.of("routine", "question")) {
            long id = insertPost(userId, type, "visible", NOW_LOCAL);
            mockMvc.perform(get(POSTS + "/" + id)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.postType").value(type));
        }
        for (String id : List.of("abc", "9223372036854775808", "1.5")) {
            mockMvc.perform(get(POSTS + "/" + id))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
        }
    }

    @Test
    void authorNameHidesWithdrawnMembersAndFillsAMissingNickname() throws Exception {
        insertMember(userId, "deleted", "옛닉네임");
        long withdrawn = insertPost(userId, "general", "visible", NOW_LOCAL);
        insertUserOnly(otherUserId, "active");
        long noProfile = insertPost(otherUserId, "general", "visible", NOW_LOCAL);
        long blankId = NEXT_ID.getAndIncrement();
        insertMember(blankId, "pending_deletion", "  ");
        long blank = insertPost(blankId, "general", "visible", NOW_LOCAL);

        String detail = mockMvc.perform(get(POSTS + "/" + withdrawn)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.authorName").value("탈퇴한 회원"))
                .andReturn().getResponse().getContentAsString();
        assertThat(detail).doesNotContain("옛닉네임");
        mockMvc.perform(get(POSTS + "/" + noProfile))
                .andExpect(jsonPath("$.data.authorName").value("회원"));
        mockMvc.perform(get(POSTS + "/" + blank))
                .andExpect(jsonPath("$.data.authorName").value("회원"));
        String list = mockMvc.perform(get(POSTS)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(list).contains("탈퇴한 회원").doesNotContain("옛닉네임");
    }

    // ---------- public paths ----------

    @Test
    void publicPathsStillRefuseABadTokenAndDeeperPathsStayClosed() throws Exception {
        insertMember(userId, "active", "회원1");
        long postId = insertPost(userId, "general", "visible", NOW_LOCAL);

        for (String path : List.of(POSTS, POSTS + "/" + postId)) {
            mockMvc.perform(get(path).header("Authorization", "Bearer not-a-token"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.errorCode").value("INVALID_TOKEN"));
            mockMvc.perform(get(path).header("Authorization", bearer(userId)))
                    .andExpect(status().isOk());
        }
        // Not public: comments are a later unit, and "/posts/*" must not open them.
        mockMvc.perform(get(POSTS + "/" + postId + "/comments"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("LOGIN_REQUIRED"));
    }

    // ---------- helpers ----------

    private ResultActions create(String authorization, String body) throws Exception {
        MockHttpServletRequestBuilder request = post(POSTS).contentType(MediaType.APPLICATION_JSON).content(body);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return mockMvc.perform(request);
    }

    private long created(ResultActions result) throws Exception {
        String body = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.data.postId")).longValue();
    }

    private static List<Long> ids(String body) {
        List<Number> ids = JsonPath.read(body, "$.data.content[*].postId");
        return ids.stream().map(Number::longValue).toList();
    }

    private String bearer(long id) {
        return "Bearer " + jwtTokenProvider.createAccessToken(id, UserRole.USER, now.get());
    }

    private void insertUserOnly(long id, String status) {
        jdbcTemplate.update("insert into users (user_id, email, username, account_status, is_agreed_term)"
                + " values (?, ?, '커뮤니티회원', ?, true)", id, "community" + id + "@example.com", status);
    }

    private void insertMember(long id, String status, String nickname) {
        insertUserOnly(id, status);
        jdbcTemplate.update("insert into user_profiles (user_id, display_name) values (?, ?)", id, nickname);
    }

    private long insertPost(long authorId, String type, String visibility, LocalDateTime createdAt) {
        jdbcTemplate.update("insert into community_posts (user_id, post_type, title, content, visibility,"
                + " created_at, updated_at) values (?, ?, 'title', 'pending', ?, ?, ?)",
                authorId, type, visibility, createdAt, createdAt);
        long id = jdbcTemplate.queryForObject("select last_insert_id()", Long.class);
        jdbcTemplate.update("update community_posts set content = ? where post_id = ?", "content " + id, id);
        return id;
    }

    private Map<String, Object> row(long postId) {
        return jdbcTemplate.queryForMap("select * from community_posts where post_id = ?", postId);
    }

    private int postCount() {
        return jdbcTemplate.queryForObject("select count(*) from community_posts", Integer.class);
    }
}
