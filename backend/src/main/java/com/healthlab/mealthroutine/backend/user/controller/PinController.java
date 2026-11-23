package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.user.dto.PinChangeRequest;
import com.healthlab.mealthroutine.backend.user.dto.PinSetRequest;
import com.healthlab.mealthroutine.backend.user.dto.PinStatusResponse;
import com.healthlab.mealthroutine.backend.user.dto.PinTokenResponse;
import com.healthlab.mealthroutine.backend.user.dto.PinVerifyRequest;
import com.healthlab.mealthroutine.backend.user.service.PinService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Second password, PIN (member unit 7, P-02). Login required; the user comes from the access token only.
 * The PIN token returned here goes in the X-Pin-Token header of the PIN-protected APIs (unit 8).
 */
@RestController
@RequestMapping("/api/v1/users/me/pin")
@RequiredArgsConstructor
public class PinController {

    private final PinService pinService;

    @PutMapping
    public ApiResponse<PinTokenResponse> setPin(@LoginUser Long userId, @Valid @RequestBody PinSetRequest request) {
        return ApiResponse.ok(pinService.setPin(userId, request));
    }

    @GetMapping("/status")
    public ApiResponse<PinStatusResponse> status(@LoginUser Long userId) {
        return ApiResponse.ok(pinService.status(userId));
    }

    @PostMapping("/verify")
    public ApiResponse<PinTokenResponse> verify(@LoginUser Long userId, @Valid @RequestBody PinVerifyRequest request) {
        return ApiResponse.ok(pinService.verify(userId, request));
    }

    /** Change or recovery; limited to 5 per minute per user by AttemptLimitInterceptor (PIN7-8). */
    @PatchMapping
    public ResponseEntity<Void> change(@LoginUser Long userId, @Valid @RequestBody PinChangeRequest request) {
        pinService.change(userId, request);
        return ResponseEntity.noContent().build();
    }
}
