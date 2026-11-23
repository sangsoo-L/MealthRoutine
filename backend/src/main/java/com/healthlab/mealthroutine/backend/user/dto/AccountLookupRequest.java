package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * POST /api/v1/auth/account-lookup (ACCT6-1). The email is trimmed and lowercased like at signup; the real name is
 * trimmed and must follow the signup rule. Numbers or booleans are 400 (StrictStringDeserializer).
 */
public record AccountLookupRequest(
        @NotBlank @Email @Size(max = 255)
        @JsonDeserialize(using = StrictStringDeserializer.class) String email,

        @NotNull @Pattern(regexp = SignupRequest.USERNAME_RULE)
        @JsonDeserialize(using = StrictStringDeserializer.class) String username) {

    public AccountLookupRequest {
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
        username = username == null ? null : username.trim();
    }

    /** Hides the email and real name if this object is ever logged. */
    @Override
    public String toString() {
        return "AccountLookupRequest[email=(hidden), username=(hidden)]";
    }
}
