package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * Login input. Only blank/length checks here: format rules would hint at which part is wrong.
 * The email gets the same trim + lowercase as signup (EMAIL-1).
 */
public record LoginRequest(
        @NotBlank @Size(max = 255) String email,
        @NotBlank @Size(max = 255) String password) {

    public LoginRequest {
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /** Hides the password if this object is ever logged. */
    @Override
    public String toString() {
        return "LoginRequest[email=" + email + "]";
    }
}
