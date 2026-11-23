package com.healthlab.mealthroutine.backend.user.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDateTime;

/**
 * The {@code data} of a PIN failure response (PIN7-3): PIN_INVALID → remainingAttempts, PIN_LOCKED → lockedUntil.
 * The unused field is left out of the JSON.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PinFailure(Integer remainingAttempts, LocalDateTime lockedUntil) {

    public static PinFailure remaining(int remainingAttempts) {
        return new PinFailure(remainingAttempts, null);
    }

    public static PinFailure lockedUntil(LocalDateTime lockedUntil) {
        return new PinFailure(null, lockedUntil);
    }
}
