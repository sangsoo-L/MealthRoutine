package com.healthlab.mealthroutine.backend.user.dto;

/** Refresh body (AUTH3-4): only the new access token. The new refresh token goes in the HttpOnly cookie. */
public record RefreshResponse(String accessToken) {

    @Override
    public String toString() {
        return "RefreshResponse[accessToken=(hidden)]";
    }
}
