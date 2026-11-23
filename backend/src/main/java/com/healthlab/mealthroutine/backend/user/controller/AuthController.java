package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.dto.AccountLookupRequest;
import com.healthlab.mealthroutine.backend.user.dto.AccountLookupResponse;
import com.healthlab.mealthroutine.backend.user.dto.LoginRequest;
import com.healthlab.mealthroutine.backend.user.dto.LoginResponse;
import com.healthlab.mealthroutine.backend.user.dto.RefreshResponse;
import com.healthlab.mealthroutine.backend.user.dto.SignupRequest;
import com.healthlab.mealthroutine.backend.user.dto.SignupResponse;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.service.AccountLookupService;
import com.healthlab.mealthroutine.backend.user.service.AuthService;
import com.healthlab.mealthroutine.backend.user.service.LoginResult;
import com.healthlab.mealthroutine.backend.user.service.LoginService;
import com.healthlab.mealthroutine.backend.user.service.RefreshResult;
import com.healthlab.mealthroutine.backend.user.service.TokenService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String REFRESH_COOKIE = RefreshCookies.NAME;
    /** CSRF check for the two cookie endpoints (AUTH3-5). Not a secret: other origins cannot add it without CORS. */
    static final String CSRF_HEADER = "X-Requested-With";
    static final String CSRF_HEADER_VALUE = "XMLHttpRequest";

    private final AuthService authService;
    private final LoginService loginService;
    private final TokenService tokenService;
    private final AccountLookupService accountLookupService;
    private final JwtProperties jwtProperties;

    /** Local email signup. No login happens here; the client moves to the login screen (SIGNUP-RES-1). */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SignupResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponse.ok(authService.signup(request));
    }

    /**
     * Local email login. The access token is in the body; the refresh token only in an HttpOnly cookie
     * that is sent back to /api/v1/auth/* (refresh and logout). COOKIE-1.
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        LoginResult result = loginService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, RefreshCookies.create(result.refreshToken(), jwtProperties.refreshTtl()))
                .body(ApiResponse.ok(result.body()));
    }

    /**
     * Account lookup (FIND-1, ACCT6-1~4): public, limited to 5 per minute per IP by AttemptLimitInterceptor.
     * The body is only {"matched": true/false}; every non-match is the same response.
     */
    @PostMapping("/account-lookup")
    public ApiResponse<AccountLookupResponse> accountLookup(@Valid @RequestBody AccountLookupRequest request) {
        return ApiResponse.ok(new AccountLookupResponse(accountLookupService.matches(request)));
    }

    /**
     * New access token (body) and new refresh token (cookie) from the refresh cookie (AUTH3-1~4).
     * A failed refresh does not touch the cookie: with two requests at once, a late failure must not delete the
     * cookie the successful one just set.
     */
    @PostMapping("/token/refresh")
    public ResponseEntity<ApiResponse<RefreshResponse>> refresh(
            @RequestHeader(name = CSRF_HEADER, required = false) String requestedWith,
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        requireCsrfHeader(requestedWith);
        RefreshResult result = tokenService.refresh(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, RefreshCookies.create(result.refreshToken(), jwtProperties.refreshTtl()))
                .body(ApiResponse.ok(new RefreshResponse(result.accessToken())));
    }

    /**
     * Ends the login of this refresh cookie and deletes the cookie (D-3). No cookie or an old cookie is also 204.
     * The access token already issued stays valid for up to 30 minutes (AUTH2-2).
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestHeader(name = CSRF_HEADER, required = false) String requestedWith,
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        requireCsrfHeader(requestedWith);
        tokenService.logout(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, RefreshCookies.delete())
                .build();
    }

    /** Runs before anything else, so a rejected request changes neither the DB nor the cookie. */
    private static void requireCsrfHeader(String requestedWith) {
        if (!CSRF_HEADER_VALUE.equals(requestedWith)) {
            throw new BusinessException(ErrorCode.CSRF_REJECTED);
        }
    }
}
