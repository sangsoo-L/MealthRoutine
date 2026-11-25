package com.healthlab.mealthroutine.backend.exercise.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.service.RoutineService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workout-routines")
public class RoutineController {

    private final RoutineService routineService;

    /** 201 when this request made the routine, 200 when it repeats an earlier request with the same requestId. */
    @PostMapping
    public ResponseEntity<ApiResponse<RoutineResponse>> create(@LoginUser Long userId,
            @Valid @RequestBody RoutineCreateRequest request) {
        RoutineService.CreateResult result = routineService.create(userId, request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(ApiResponse.ok(result.routine()));
    }

    @GetMapping
    public ApiResponse<PageResponse<RoutineResponse>> getVisible(
            @LoginUser(required = false) Long userId,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "false") boolean includeItems,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(routineService.getVisible(userId, mine, includeItems, page, size));
    }

    @GetMapping("/{routineId}")
    public ApiResponse<RoutineResponse> get(@LoginUser(required = false) Long userId, @PathVariable Long routineId) {
        return ApiResponse.ok(routineService.get(userId, routineId));
    }

    @PatchMapping("/{routineId}")
    public ApiResponse<RoutineResponse> update(@LoginUser Long userId, @PathVariable Long routineId,
            @Valid @RequestBody RoutineUpdateRequest request) {
        return ApiResponse.ok(routineService.update(userId, routineId, request));
    }

    @DeleteMapping("/{routineId}")
    public ApiResponse<Void> delete(@LoginUser Long userId, @PathVariable Long routineId,
            @RequestParam(required = false) @Min(1) Integer expectedRevision) {
        routineService.delete(userId, routineId, expectedRevision);
        return ApiResponse.ok();
    }
}
