package com.healthlab.mealthroutine.backend.user.jwt;

/**
 * Result of reading an access token (also used for a PIN token, which has the same three outcomes). Expired is kept apart from other failures so the client knows
 * when refreshing makes sense (decision AUTH2-3). userId is set only when the status is VALID.
 */
public record AccessTokenResult(Status status, Long userId) {

    public enum Status {
        VALID,
        EXPIRED,
        INVALID
    }

    static AccessTokenResult valid(long userId) {
        return new AccessTokenResult(Status.VALID, userId);
    }

    static AccessTokenResult expired() {
        return new AccessTokenResult(Status.EXPIRED, null);
    }

    static AccessTokenResult invalid() {
        return new AccessTokenResult(Status.INVALID, null);
    }
}
