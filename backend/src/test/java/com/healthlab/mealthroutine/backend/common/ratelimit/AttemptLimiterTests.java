package com.healthlab.mealthroutine.backend.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** The limiter alone, without Spring: counting, window edges, Retry-After, threads and cleanup (ACCT6-4). */
class AttemptLimiterTests {

    private static final Instant T0 = Instant.parse("2026-11-23T03:00:00Z");
    private static final Duration MINUTE = Duration.ofMinutes(1);

    private final AtomicReference<Instant> now = new AtomicReference<>(T0);
    private final AttemptLimiter limiter = new AttemptLimiter(new Clock() {
        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    });

    @Test
    void fiveAreAllowedAndTheSixthWaitsForTheWindowToEnd() {
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire("k", 5, MINUTE).allowed()).isTrue();
        }
        AttemptLimiter.Result sixth = limiter.tryAcquire("k", 5, MINUTE);
        assertThat(sixth.allowed()).isFalse();
        assertThat(sixth.retryAfterSeconds()).isEqualTo(60);

        now.set(T0.plusMillis(59_001));
        AttemptLimiter.Result late = limiter.tryAcquire("k", 5, MINUTE);
        assertThat(late.allowed()).isFalse();
        assertThat(late.retryAfterSeconds()).isEqualTo(1); // 0.999 s left, rounded up

        now.set(T0.plusMillis(58_500));
        assertThat(limiter.tryAcquire("k", 5, MINUTE).retryAfterSeconds()).isEqualTo(2); // 1.5 s left, rounded up

        now.set(T0.plus(MINUTE)); // exactly start + 1 minute: a new window
        assertThat(limiter.tryAcquire("k", 5, MINUTE).allowed()).isTrue();
    }

    @Test
    void keysAreCountedSeparately() {
        for (int i = 0; i < 6; i++) {
            limiter.tryAcquire("a", 5, MINUTE);
        }
        assertThat(limiter.tryAcquire("a", 5, MINUTE).allowed()).isFalse();
        assertThat(limiter.tryAcquire("b", 5, MINUTE).allowed()).isTrue();
    }

    @Test
    void manyThreadsAtOnceGetExactlyFiveAllowed() throws Exception {
        int threads = 20;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return limiter.tryAcquire("same", 5, MINUTE).allowed();
                }));
            }
            start.countDown();
            int allowed = 0;
            for (Future<Boolean> result : results) {
                if (result.get(10, TimeUnit.SECONDS)) {
                    allowed++;
                }
            }
            assertThat(allowed).isEqualTo(5);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void cleanupRemovesOnlyFinishedWindowsAndKeepsLiveCounts() {
        for (int i = 0; i < AttemptLimiter.CLEANUP_THRESHOLD; i++) {
            limiter.tryAcquire("old-" + i, 5, MINUTE); // these finish at T0 + 1 minute
        }
        now.set(T0.plusSeconds(30));
        for (int i = 0; i < 3; i++) {
            limiter.tryAcquire("live", 5, MINUTE); // finishes at T0 + 90 s, count 3
        }

        now.set(T0.plusSeconds(61));
        limiter.tryAcquire("trigger", 5, MINUTE); // size goes over the threshold: cleanup runs

        assertThat(limiter.size()).isEqualTo(2); // "live" and "trigger"
        assertThat(limiter.tryAcquire("live", 5, MINUTE).allowed()).isTrue();  // 4th
        assertThat(limiter.tryAcquire("live", 5, MINUTE).allowed()).isTrue();  // 5th
        assertThat(limiter.tryAcquire("live", 5, MINUTE).allowed()).isFalse(); // count was kept, not reset
    }
}
