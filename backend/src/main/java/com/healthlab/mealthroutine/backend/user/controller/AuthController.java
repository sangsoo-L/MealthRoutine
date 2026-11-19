package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.user.dto.LoginRequest;
import com.healthlab.mealthroutine.backend.user.dto.LoginResponse;
import com.healthlab.mealthroutine.backend.user.dto.SignupRequest;
import com.healthlab.mealthroutine.backend.user.dto.SignupResponse;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.service.AuthService;
import com.healthlab.mealthroutine.backend.user.service.LoginResult;
import com.healthlab.mealthroutine.backend.user.service.LoginService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String REFRESH_COOKIE = "refresh_token";
    private static final String REFRESH_COOKIE_PATH = "/api/v1/auth";

    private final AuthService authService;
    private final LoginService loginService;
    private final JwtProperties jwtProperties;

    /** Local email signup. No login happens here; the client moves to the login screen (SIGNUP-RES-1). */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SignupResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponse.ok(authService.signup(request));
    }

    /**
     * Local email login. The access token is in the body; the refresh token only in an HttpOnly cookie
     * that is sent back to /api/v1/auth/* (refresh and logout come in a later unit). COOKIE-1.
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        LoginResult result = loginService.login(request);
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, result.refreshToken())
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(REFRESH_COOKIE_PATH)
                .maxAge(jwtProperties.refreshTtl())
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiResponse.ok(result.body()));
    }
}
