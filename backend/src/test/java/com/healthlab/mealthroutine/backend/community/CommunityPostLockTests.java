package com.healthlab.mealthroutine.backend.community;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

import com.healthlab.mealthroutine.backend.community.repository.CommunityPostRepository;
import com.healthlab.mealthroutine.backend.user.domain.UserRole;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Row locks taken by post PATCH and DELETE (C2-IMPL-1), on the real MySQL, in the RoutineUpdateLockTests way.
 * No test-level transaction: each request commits on its own. Rows are deleted after each test.
 *
 * <p>Only the author may lock a post's row: another member's request and a request for an id that does not exist
 * answer without taking or waiting for that lock. Requests of the author run one after the other and each sees what
 * the one before committed, so an edit that waited behind a delete gets 404 and never brings the post back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CommunityPostLockTests {

    private static final String POSTS = "/api/v1/community/posts";
    private static long nextUserId = 9700L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    private CommunityPostRepository postRepository;

    private long author;
    private long other;
    private long postId;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        author = nextUserId++;
        other = nextUserId++;
        for (long id : List.of(author, other)) {
            jdbcTemplate.update("insert into users (user_id, username, is_agreed_term) values (?, '잠금', true)", id);
        }
        jdbcTemplate.update("insert into community_posts (user_id, post_type, title, content, created_at, updated_at)"
                + " values (?, 'general', '처음 제목', '처음 내용', now(), now())", author);
        postId = jdbcTemplate.queryForObject("select post_id from community_posts where user_id = ?", Long.class,
                author);
        Mockito.clearInvocations(postRepository);
        pool = Executors.newFixedThreadPool(3);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete from community_posts where user_id in (?, ?)", author, other);
        jdbcTemplate.update("delete from users where user_id in (?, ?)", author, other);
    }

    @Test
    void anotherMembersRequestDoesNotWaitForTheAuthorsLock() throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
            jdbcTemplate.queryForObject("select post_id from community_posts where post_id = ? for update",
                    Long.class, postId);
            locked.countDown();
            await(release);
        }));
        await(locked);

        // While the author's row is locked, a stranger is answered right away instead of queueing behind the lock.
        Future<MockHttpServletResponse> patchByOther = pool.submit(() -> edit(other, "남", "남"));
        assertThat(patchByOther.get(5, TimeUnit.SECONDS).getStatus()).isEqualTo(403);
        Future<MockHttpServletResponse> deleteByOther = pool.submit(() -> remove(other));
        assertThat(deleteByOther.get(5, TimeUnit.SECONDS).getStatus()).isEqualTo(403);

        release.countDown();
        holder.get(10, TimeUnit.SECONDS);
    }

    @Test
    void onlyTheAuthorEverTakesTheRowLock() throws Exception {
        assertThat(edit(other, "남", "남").getStatus()).isEqualTo(403);
        assertThat(remove(other).getStatus()).isEqualTo(403);
        // An id that does not exist: under REPEATABLE READ a FOR UPDATE here would gap-lock the end of the table.
        assertThat(send(patch(POSTS + "/999999999"), other, "{\"title\":\"t\",\"content\":\"c\"}").getStatus())
                .isEqualTo(404);
        assertThat(send(delete(POSTS + "/999999999"), other, null).getStatus()).isEqualTo(404);
        verify(postRepository, never()).findForUpdate(anyLong());

        assertThat(edit(author, "주인", "주인").getStatus()).isEqualTo(200);
        verify(postRepository).findForUpdate(postId);
    }

    @Test
    void authorsSecondEditWaitsAndTheLaterOneStays() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> first = pool.submit(() -> edit(author, "폰에서", "폰 내용"));
        await(gate.held());
        Future<MockHttpServletResponse> second = pool.submit(() -> edit(author, "PC에서", "PC 내용"));
        assertWaitingForTheLock(gate, second);

        gate.release().countDown();
        assertThat(first.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat(second.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        // Last write wins (C2-D4): the second edit was applied on top of the first one's commit.
        assertThat(row().get("title")).isEqualTo("PC에서");
        assertThat(row().get("content")).isEqualTo("PC 내용");
        assertThat(row().get("visibility")).isEqualTo("visible");
    }

    @Test
    void anEditWaitingBehindADeleteGets404AndThePostStaysDeleted() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> deleting = pool.submit(() -> remove(author));
        await(gate.held());
        // The edit passed the plain checks (the post was still visible) and now waits inside the locking read, so it
        // meets the committed delete only after the lock. The final 404 with nothing changed is guaranteed: the check
        // repeated after the lock (C2-IMPL-1) refuses it, and even without that check the detail read at the end of
        // update would throw 404 and roll the whole edit back. This test does not tell those two layers apart.
        Future<MockHttpServletResponse> editing = pool.submit(() -> edit(author, "부활", "부활"));
        assertWaitingForTheLock(gate, editing);

        gate.release().countDown();
        assertThat(deleting.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        MockHttpServletResponse late = editing.get(10, TimeUnit.SECONDS);
        assertThat(late.getStatus()).isEqualTo(404);
        assertThat(late.getContentAsString()).contains("POST_NOT_FOUND");
        assertThat(row().get("visibility")).isEqualTo("deleted");
        assertThat(row().get("title")).isEqualTo("처음 제목");
    }

    @Test
    void aDeleteWaitingBehindAnEditStillDeletesTheEditedPost() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> editing = pool.submit(() -> edit(author, "고친 제목", "고친 내용"));
        await(gate.held());
        Future<MockHttpServletResponse> deleting = pool.submit(() -> remove(author));
        assertWaitingForTheLock(gate, deleting);

        gate.release().countDown();
        assertThat(editing.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat(deleting.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat(row().get("visibility")).isEqualTo("deleted");
        assertThat(row().get("title")).isEqualTo("고친 제목");
    }

    @Test
    void ofTwoDeletesOneSucceedsAndTheOtherIs404() throws Exception {
        Gate gate = holdFirstLockedRead();
        Future<MockHttpServletResponse> first = pool.submit(() -> remove(author));
        await(gate.held());
        Future<MockHttpServletResponse> second = pool.submit(() -> remove(author));
        assertWaitingForTheLock(gate, second);

        gate.release().countDown();
        assertThat(first.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(200);
        assertThat(second.get(10, TimeUnit.SECONDS).getStatus()).isEqualTo(404);
        assertThat(row().get("visibility")).isEqualTo("deleted");
    }

    /**
     * held: the first request holds the row lock. secondEntered: the second request passed the plain checks
     * (existsTarget, isWrittenBy) and is about to run the real SELECT ... FOR UPDATE, so it must wait for the lock.
     * release: lets the first request finish and commit.
     */
    private record Gate(CountDownLatch held, CountDownLatch secondEntered, CountDownLatch release) {
    }

    /**
     * The first findForUpdate takes the lock for real, then waits until released while still holding it. The second
     * call counts down secondEntered right before its real (locking) read (Codex C2-C3): a test that waits for it
     * knows the second request reached the lock wait, instead of only hoping a sleep was long enough.
     */
    private Gate holdFirstLockedRead() {
        Gate gate = new Gate(new CountDownLatch(1), new CountDownLatch(1), new CountDownLatch(1));
        AtomicBoolean firstCall = new AtomicBoolean(true);
        Answer<?> real = Mockito.mockingDetails(postRepository).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            if (firstCall.getAndSet(false)) {
                Object result = real.answer(invocation); // the lock is held from here on
                gate.held().countDown();
                await(gate.release());
                return result;
            }
            gate.secondEntered().countDown();
            return real.answer(invocation); // blocks on the row lock until the first request commits
        }).when(postRepository).findForUpdate(anyLong());
        return gate;
    }

    /** The second request is inside the locking read, and it stays blocked while the first one holds the lock. */
    private static void assertWaitingForTheLock(Gate gate, Future<?> second) throws InterruptedException {
        await(gate.secondEntered());
        assertStillWaiting(second);
    }

    private MockHttpServletResponse edit(long userId, String title, String content) throws Exception {
        return send(patch(POSTS + "/" + postId), userId,
                "{\"title\":\"" + title + "\",\"content\":\"" + content + "\"}");
    }

    private MockHttpServletResponse remove(long userId) throws Exception {
        return send(delete(POSTS + "/" + postId), userId, null);
    }

    private MockHttpServletResponse send(MockHttpServletRequestBuilder request, long userId, String json)
            throws Exception {
        request.header(HttpHeaders.AUTHORIZATION,
                "Bearer " + jwtTokenProvider.createAccessToken(userId, UserRole.USER, Instant.now()));
        if (json != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mockMvc.perform(request).andReturn().getResponse();
    }

    private Map<String, Object> row() {
        return jdbcTemplate.queryForMap("select * from community_posts where post_id = ?", postId);
    }

    private static void assertStillWaiting(Future<?> future) throws InterruptedException {
        Thread.sleep(300); // only to show it does not finish while the lock is held; the order is set by latches
        assertThat(future.isDone()).isFalse();
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }
}
