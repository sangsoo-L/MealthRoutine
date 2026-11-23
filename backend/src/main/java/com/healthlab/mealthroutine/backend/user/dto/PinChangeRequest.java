package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * PATCH /api/v1/users/me/pin (PIN7-7): newPin plus at most one proof — currentPin (usual change) or currentPassword
 * (recovery for a local account). Neither is allowed only for a social-only account (Q-24), which the service
 * checks because it depends on the account.
 */
public record PinChangeRequest(
        @NotNull @Pattern(regexp = PinRules.PIN_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String newPin,

        @Pattern(regexp = PinRules.PIN_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String currentPin,

        @Size(min = 1, max = 255)
        @JsonDeserialize(using = StrictStringDeserializer.class) String currentPassword) {

    /** Sending both proofs is 400 (PIN7-7). */
    @AssertTrue
    public boolean isAtMostOneProof() {
        return currentPin == null || currentPassword == null;
    }

    /** Hides every value if this object is ever logged. */
    @Override
    public String toString() {
        return "PinChangeRequest[newPin=(hidden), currentPin=(hidden), currentPassword=(hidden)]";
    }
}
