package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.user.dto.MeResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileUpdateRequest;
import com.healthlab.mealthroutine.backend.user.service.UserProfileService;
import lombok.RequiredArgsConstructor;
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

    @GetMapping
    public ApiResponse<MeResponse> me(@LoginUser Long userId) {
        return ApiResponse.ok(userProfileService.getMe(userId));
    }

    @GetMapping("/profile")
    public ApiResponse<ProfileResponse> profile(@LoginUser Long userId) {
        return ApiResponse.ok(userProfileService.getProfile(userId));
    }

    @PatchMapping("/profile")
    public ApiResponse<ProfileResponse> updateProfile(@LoginUser Long userId,
            @RequestBody ProfileUpdateRequest request) {
        return ApiResponse.ok(userProfileService.updateProfile(userId, request));
    }
}
