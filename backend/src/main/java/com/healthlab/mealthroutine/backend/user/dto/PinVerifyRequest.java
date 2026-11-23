package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import tools.jackson.databind.annotation.JsonDeserialize;

/** POST /api/v1/users/me/pin/verify. */
public record PinVerifyRequest(
        @NotNull @Pattern(regexp = PinRules.PIN_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String pin) {

    /** Hides the PIN if this object is ever logged. */
    @Override
    public String toString() {
        return "PinVerifyRequest[pin=(hidden)]";
    }
}
