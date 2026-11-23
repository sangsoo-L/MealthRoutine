package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import tools.jackson.databind.annotation.JsonDeserialize;

/** PUT /api/v1/users/me/pin: the first PIN. A JSON number is 400 (StrictStringDeserializer). */
public record PinSetRequest(
        @NotNull @Pattern(regexp = PinRules.PIN_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String newPin) {

    /** Hides the PIN if this object is ever logged. */
    @Override
    public String toString() {
        return "PinSetRequest[newPin=(hidden)]";
    }
}
