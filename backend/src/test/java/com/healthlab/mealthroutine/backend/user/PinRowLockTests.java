package com.healthlab.mealthroutine.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * PIN7-4 groundwork, measured on the real MySQL: findByIdForUpdate takes a row lock that other writers wait for,
 * and the locked read returns the latest committed values even inside REPEATABLE-READ. No test-level transaction:
 * the row is committed before each test and deleted after it.
 */
@SpringBootTest
@ActiveProfiles("test")
class PinRowLockTests {

    private static final long USER_ID = 9702L;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private ExecutorService pool;

    @BeforeEach
    void insertCommittedUser() {
        jdbcTemplate.update("insert into users (user_id, username, password_hash, account_status, is_agreed_term,"
                + " pin_hash) values (?, 'lock', 'pw', 'active', true, 'pin')", USER_ID);
        pool = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void cleanUp() {
        pool.shutdownNow();
        jdbcTemplate.update("delete from users where user_id = ?", USER_ID);
    }

    @Test
    void theLockIsHeldUntilTheTransactionEnds() throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            userRepository.findByIdForUpdate(USER_ID).orElseThrow();
            locked.countDown();
            await(release);
        }));
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();

        // NOWAIT fails at once when another transaction holds the row lock: proof that FOR UPDATE was sent.
        assertThatThrownBy(() -> jdbcTemplate.queryForObject(
                "select user_id from users where user_id = ? for update nowait", Long.class, USER_ID))
                .hasMessageContaining("NOWAIT");

        // An ordinary UPDATE (like a login save) waits for the lock.
        Future<Integer> writer = pool.submit(() -> jdbcTemplate.update(
                "update users set refresh_token_hash = 'waited' where user_id = ?", USER_ID));
        Thread.sleep(300);
        assertThat(writer.isDone()).isFalse();

        release.countDown();
        holder.get(10, TimeUnit.SECONDS);
        assertThat(writer.get(10, TimeUnit.SECONDS)).isOne();
        assertThat(jdbcTemplate.queryForObject("select user_id from users where user_id = ? for update nowait",
                Long.class, USER_ID)).isEqualTo(USER_ID);
    }

    @Test
    void theLockedReadSeesACommitThatAPlainReadInTheSameTransactionDoesNot() throws Exception {
        CountDownLatch snapshotTaken = new CountDownLatch(1);
        CountDownLatch committed = new CountDownLatch(1);
        Future<int[]> reader = pool.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
            // A plain read starts the REPEATABLE-READ snapshot.
            int before = jdbcTemplate.queryForObject(
                    "select pin_failed_count from users where user_id = ?", Integer.class, USER_ID);
            snapshotTaken.countDown();
            await(committed);
            User locked = userRepository.findByIdForUpdate(USER_ID).orElseThrow();
            int plainAfter = jdbcTemplate.queryForObject(
                    "select pin_failed_count from users where user_id = ?", Integer.class, USER_ID);
            return new int[] {before, locked.getPinFailedCount(), plainAfter};
        }));
        assertThat(snapshotTaken.await(10, TimeUnit.SECONDS)).isTrue();
        jdbcTemplate.update("update users set pin_failed_count = 3 where user_id = ?", USER_ID);
        committed.countDown();

        int[] values = reader.get(10, TimeUnit.SECONDS);
        assertThat(values[0]).isZero();      // snapshot before the commit
        assertThat(values[1]).isEqualTo(3);  // the locked read sees the latest commit
        assertThat(values[2]).isZero();      // a plain read still uses the old snapshot
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
