package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.user.dto.MeResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileResponse;
import com.healthlab.mealthroutine.backend.user.dto.PasswordChangeRequest;
import com.healthlab.mealthroutine.backend.user.dto.ProfileUpdateRequest;
import com.healthlab.mealthroutine.backend.user.service.PasswordChangeService;
import com.healthlab.mealthroutine.backend.user.service.UserProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** My info and profile (member unit 4). Login required; the user comes from the access token only. */
@RestController
@RequestMapping("/api/v1/users/me")
@RequiredArgsConstructor
public class UserController {

    private final UserProfileService userProfileService;
    private final PasswordChangeService passwordChangeService;

    @GetMapping
    public ApiResponse<MeResponse> me(@LoginUser Long userId) {
        return ApiResponse.ok(userProfileService.getMe(userId));
    }

    @GetMapping("/profile")
    public ApiResponse<ProfileResponse> profile(@LoginUser Long userId) {
        return ApiResponse.ok(userProfileService.getProfile(userId));
    }

    /**
     * Password change (PWCHG6-1~2), limited to 5 per minute per user by AttemptLimitInterceptor. On success every
     * refresh login ends and this response deletes the refresh cookie. The cookie header is added only after the
     * service returned, so a failure (400 or 500) never deletes it. An access token already issued keeps working
     * for up to 30 minutes (AUTH2-2); the client should drop it and go to the login screen.
     */
    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(@LoginUser Long userId,
            @Valid @RequestBody PasswordChangeRequest request) {
        passwordChangeService.changePassword(userId, request);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, RefreshCookies.delete())
                .build();
    }

    @PatchMapping("/profile")
    public ApiResponse<ProfileResponse> updateProfile(@LoginUser Long userId,
            @RequestBody ProfileUpdateRequest request) {
        return ApiResponse.ok(userProfileService.updateProfile(userId, request));
    }
}
