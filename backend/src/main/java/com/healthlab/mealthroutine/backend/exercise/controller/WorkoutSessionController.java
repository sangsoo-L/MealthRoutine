package com.healthlab.mealthroutine.backend.exercise.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionStatusRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionSummaryResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.service.WorkoutSessionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workout-sessions")
public class WorkoutSessionController {

    private final WorkoutSessionService sessionService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SessionResponse> create(@LoginUser Long userId,
            @Valid @RequestBody SessionCreateRequest request) {
        return ApiResponse.ok(sessionService.create(userId, request));
    }

    @GetMapping
    public ApiResponse<PageResponse<SessionResponse>> search(
            @LoginUser Long userId,
            @RequestParam(required = false) SessionStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(sessionService.search(userId, status, from, to, page, size));
    }

    @GetMapping("/summary")
    public ApiResponse<SessionSummaryResponse> summarize(
            @LoginUser Long userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.ok(sessionService.summarize(userId, from, to));
    }

    @GetMapping("/{sessionId}")
    public ApiResponse<SessionResponse> get(@LoginUser Long userId, @PathVariable Long sessionId) {
        return ApiResponse.ok(sessionService.get(userId, sessionId));
    }

    @PatchMapping("/{sessionId}")
    public ApiResponse<SessionResponse> update(@LoginUser Long userId, @PathVariable Long sessionId,
            @Valid @RequestBody SessionUpdateRequest request) {
        return ApiResponse.ok(sessionService.update(userId, sessionId, request));
    }

    @PatchMapping("/{sessionId}/status")
    public ApiResponse<SessionResponse> changeStatus(@LoginUser Long userId, @PathVariable Long sessionId,
            @Valid @RequestBody SessionStatusRequest request) {
        return ApiResponse.ok(sessionService.changeStatus(userId, sessionId, request.status()));
    }
}
