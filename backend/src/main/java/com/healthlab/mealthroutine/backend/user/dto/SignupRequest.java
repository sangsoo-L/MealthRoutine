package com.healthlab.mealthroutine.backend.user.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * Local signup input. Rules come from decisions.md (PW-1, PW-2, NAME-1, NAME-2, EMAIL-1).
 * The email is trimmed and lowercased here, before validation runs, so " A@x.COM " and "a@x.com" are one account.
 */
public record SignupRequest(
        @NotBlank @Email @Size(max = 255)
        String email,

        // 8-64 printable ASCII characters (no spaces) with at least one letter, one digit and one symbol.
        // ASCII only keeps the password within BCrypt's 72-byte limit.
        @NotNull
        @Pattern(regexp = PASSWORD_RULE)
        String password,

        // Korean only (2-10) or English letters with single spaces between words (2-30).
        @NotNull
        @Pattern(regexp = USERNAME_RULE)
        String username,

        // Korean, English and digits. 2-8 characters if it contains Korean, otherwise 2-16.
        @NotNull
        @Pattern(regexp = NICKNAME_RULE)
        String nickname,

        @NotNull @AssertTrue
        Boolean isAgreedTerm) {

    static final String PASSWORD_RULE = "^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[!-/:-@\\[-`{-~])[!-~]{8,64}$";
    static final String USERNAME_RULE = "^(?:[가-힣]{2,10}|(?=.{2,30}$)[A-Za-z]+(?: [A-Za-z]+)*)$";
    /** Also used by profile PATCH (PROFILE4-5), so the two can never drift apart. */
    public static final String NICKNAME_RULE = "^(?:(?=.*[가-힣])[가-힣A-Za-z0-9]{2,8}|[A-Za-z0-9]{2,16})$";

    public SignupRequest {
        email = email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /** Hides the password if this object is ever logged. */
    @Override
    public String toString() {
        return "SignupRequest[email=" + email + ", username=" + username + ", nickname=" + nickname
                + ", isAgreedTerm=" + isAgreedTerm + "]";
    }
}
