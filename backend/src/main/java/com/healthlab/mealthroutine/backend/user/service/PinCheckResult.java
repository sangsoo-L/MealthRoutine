package com.healthlab.mealthroutine.backend.user.service;

import java.time.LocalDateTime;

/**
 * What a PIN transaction decided (PIN7-10). PinAttemptService returns it instead of throwing, so a failure count it
 * saved is committed; PinService turns it into an error response afterwards. Unexpected problems (DB failure,
 * an UPDATE that hits no row) are never turned into a result: they are thrown, roll back and answer 500.
 */
record PinCheckResult(Outcome outcome, int remainingAttempts, LocalDateTime lockedUntil, String pinToken) {

    enum Outcome {
        SUCCESS,
        USER_NOT_FOUND,
        NOT_REGISTERED,
        ALREADY_SET,
        INVALID,
        LOCKED,
        PASSWORD_NOT_SET,
        PASSWORD_MISMATCH,
        PROOF_REQUIRED
    }

    static PinCheckResult of(Outcome outcome) {
        return new PinCheckResult(outcome, 0, null, null);
    }

    static PinCheckResult success() {
        return of(Outcome.SUCCESS);
    }

    static PinCheckResult successWithToken(String pinToken) {
        return new PinCheckResult(Outcome.SUCCESS, 0, null, pinToken);
    }

    static PinCheckResult invalid(int remainingAttempts) {
        return new PinCheckResult(Outcome.INVALID, remainingAttempts, null, null);
    }

    static PinCheckResult locked(LocalDateTime lockedUntil) {
        return new PinCheckResult(Outcome.LOCKED, 0, lockedUntil, null);
    }

    boolean succeeded() {
        return outcome == Outcome.SUCCESS;
    }

    /** Never prints the token. */
    @Override
    public String toString() {
        return "PinCheckResult[outcome=" + outcome + ", remainingAttempts=" + remainingAttempts
                + ", lockedUntil=" + lockedUntil + ", pinToken=" + (pinToken == null ? "null" : "(hidden)") + "]";
    }
}
