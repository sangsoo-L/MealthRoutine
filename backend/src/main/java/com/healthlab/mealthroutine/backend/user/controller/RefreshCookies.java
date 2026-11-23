package com.healthlab.mealthroutine.backend.user.controller;

import java.time.Duration;
import org.springframework.http.ResponseCookie;

/**
 * The refresh token cookie (COOKIE-1). Setting and deleting use the same attributes (deleting = max-age 0),
 * so the browser treats them as one cookie, even when the delete comes from another path such as
 * /api/v1/users/me/password (RFC 6265: a response may set a cookie for any path).
 */
final class RefreshCookies {

    static final String NAME = "refresh_token";
    private static final String PATH = "/api/v1/auth";

    private RefreshCookies() {
    }

    static String create(String value, Duration maxAge) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(PATH)
                .maxAge(maxAge)
                .build()
                .toString();
    }

    static String delete() {
        return create("", Duration.ZERO);
    }
}
