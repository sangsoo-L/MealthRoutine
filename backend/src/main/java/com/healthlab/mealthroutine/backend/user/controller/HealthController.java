package com.healthlab.mealthroutine.backend.user.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.user.dto.HealthMetricsResponse;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementIdResponse;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementRequest;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementResponse;
import com.healthlab.mealthroutine.backend.user.service.HealthMeasurementService;
import com.healthlab.mealthroutine.backend.user.service.HealthMetricsService;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules.ListQuery;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules.MeasurementChange;
import com.healthlab.mealthroutine.backend.user.service.PinTokenGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Body measurements and health metrics (member unit 8). Login is required for all (the filter already checked it).
 * <p>
 * POST needs no PIN (검증-1). The other three are PIN-protected and always run in this order (HEALTH8-12):
 * input checks (400) → {@link PinTokenGuard#check} (403) → service (404 for someone else's or a missing record).
 * Keep the guard call in each protected method; tests fail if one is dropped.
 */
@RestController
@RequestMapping("/api/v1/health")
@RequiredArgsConstructor
public class HealthController {

    private final MeasurementRules measurementRules;
    private final PinTokenGuard pinTokenGuard;
    private final HealthMeasurementService measurementService;
    private final HealthMetricsService metricsService;

    @PostMapping("/measurements")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<MeasurementIdResponse> create(@LoginUser Long userId,
            @RequestBody MeasurementRequest request) {
        return ApiResponse.ok(measurementService.create(userId, measurementRules.forCreate(request)));
    }

    @GetMapping("/measurements")
    public ApiResponse<MeasurementResponse.ListResponse> list(@LoginUser Long userId,
            @RequestParam(required = false) String from, @RequestParam(required = false) String to,
            @RequestParam(required = false) Integer limit,
            @RequestHeader(value = PinTokenGuard.HEADER, required = false) String pinToken) {
        ListQuery query = measurementRules.forList(from, to, limit);
        pinTokenGuard.check(userId, pinToken);
        return ApiResponse.ok(measurementService.list(userId, query));
    }

    @PatchMapping("/measurements/{measurementId}")
    public ApiResponse<MeasurementResponse> update(@LoginUser Long userId, @PathVariable Long measurementId,
            @RequestBody MeasurementRequest request,
            @RequestHeader(value = PinTokenGuard.HEADER, required = false) String pinToken) {
        MeasurementChange change = measurementRules.forUpdate(request);
        pinTokenGuard.check(userId, pinToken);
        return ApiResponse.ok(measurementService.update(userId, measurementId, change));
    }

    @GetMapping("/metrics")
    public ApiResponse<HealthMetricsResponse> metrics(@LoginUser Long userId,
            @RequestHeader(value = PinTokenGuard.HEADER, required = false) String pinToken) {
        pinTokenGuard.check(userId, pinToken);
        return ApiResponse.ok(metricsService.metrics(userId));
    }
}
