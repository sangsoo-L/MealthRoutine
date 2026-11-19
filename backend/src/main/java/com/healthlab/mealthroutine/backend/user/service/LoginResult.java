package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.user.dto.LoginResponse;

/** What the controller needs: the JSON body and the raw refresh token for the cookie. */
public record LoginResult(LoginResponse body, String refreshToken) {

    /** Hides the refresh token here and the access token through LoginResponse.toString. */
    @Override
    public String toString() {
        return "LoginResult[body=" + body + ", refreshToken=(hidden)]";
    }
}
