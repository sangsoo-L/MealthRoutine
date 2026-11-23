package com.healthlab.mealthroutine.backend.common.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Counts attempts per key in fixed windows, in this server's memory (ACCT6-4, PWCHG6-1). No library, no DB.
 * <p>
 * Known MVP limits: counts reset when the server restarts, and two servers would each count on their own.
 * <p>
 * Thread safety: checking and counting happen inside one {@link ConcurrentHashMap#compute} call, which runs one at
 * a time for the same key. Doing get() then put() instead would let two requests read the same count.
 */
@Component
@RequiredArgsConstructor
public class AttemptLimiter {

    /** Above this many keys, expired windows are removed so the map does not grow forever. */
    static final int CLEANUP_THRESHOLD = 10_000;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;

    /** Counts this attempt. Allowed while the window holds at most {@code max} attempts, this one included. */
    public Result tryAcquire(String key, int max, Duration length) {
        Instant now = clock.instant();
        Window window = windows.compute(key, (k, old) ->
                old == null || old.isOver(now) ? new Window(now, length, 1) : old.next());
        if (windows.size() > CLEANUP_THRESHOLD) {
            removeExpired(now);
        }
        if (window.count() <= max) {
            return Result.ALLOWED;
        }
        return new Result(false, window.secondsLeft(now));
    }

    /**
     * Removes only windows that are over. computeIfPresent re-checks each one at removal time, so a window that
     * another request has just started or counted is kept with its count.
     */
    private void removeExpired(Instant now) {
        for (String key : windows.keySet()) {
            windows.computeIfPresent(key, (k, window) -> window.isOver(now) ? null : window);
        }
    }

    int size() {
        return windows.size();
    }

    /** retryAfterSeconds is 0 when allowed. */
    public record Result(boolean allowed, long retryAfterSeconds) {
        static final Result ALLOWED = new Result(true, 0);
    }

    private record Window(Instant start, Duration length, int count) {

        /** The window is over at exactly start + length: that moment starts a new one. */
        boolean isOver(Instant now) {
            return !now.isBefore(start.plus(length));
        }

        Window next() {
            return new Window(start, length, count + 1);
        }

        /** Whole seconds until the window ends, rounded up and at least 1, for the Retry-After header. */
        long secondsLeft(Instant now) {
            long millis = Duration.between(now, start.plus(length)).toMillis();
            return Math.max(1, (millis + 999) / 1000);
        }
    }
}
