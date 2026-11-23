package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * PATCH /api/v1/users/me/password (PWCHG6-1). currentPassword gets the same checks as the login password;
 * newPassword follows the signup rule (PW-1, PW-2).
 */
public record PasswordChangeRequest(
        @NotBlank @Size(max = 255)
        @JsonDeserialize(using = StrictStringDeserializer.class) String currentPassword,

        @NotNull @Pattern(regexp = SignupRequest.PASSWORD_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String newPassword) {

    /** Hides both passwords if this object is ever logged. */
    @Override
    public String toString() {
        return "PasswordChangeRequest[currentPassword=(hidden), newPassword=(hidden)]";
    }
}
