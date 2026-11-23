package com.healthlab.mealthroutine.backend.user.service;

/** What the controller needs after a refresh: the new access token for the body and the new refresh cookie. */
public record RefreshResult(String accessToken, String refreshToken) {

    @Override
    public String toString() {
        return "RefreshResult[accessToken=(hidden), refreshToken=(hidden)]";
    }
}
