package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.HealthMeasurement;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementIdResponse;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementResponse;
import com.healthlab.mealthroutine.backend.user.repository.HealthMeasurementRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules.ListQuery;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules.MeasurementChange;
import com.healthlab.mealthroutine.backend.user.service.MeasurementRules.NewMeasurement;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Body measurements (member unit 8). Inputs are already checked (MeasurementRules) and, for reads and changes,
 * the PIN token too (PinTokenGuard) before these methods run. Logs carry ids only, never a body value (HEALTH8-13).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HealthMeasurementService {

    private final HealthMeasurementRepository measurementRepository;
    private final UserRepository userRepository;

    /** Always a new row; an earlier row is never changed (HEALTH8-6). */
    @Transactional
    public MeasurementIdResponse create(Long userId, NewMeasurement input) {
        HealthMeasurement saved = measurementRepository.save(new HealthMeasurement(
                userRepository.getReferenceById(userId), input.measuredAt(), input.values()));
        log.info("Body measurement added: userId={}, measurementId={}", userId, saved.getMeasurementId());
        return new MeasurementIdResponse(saved.getMeasurementId());
    }

    @Transactional(readOnly = true)
    public MeasurementResponse.ListResponse list(Long userId, ListQuery query) {
        List<MeasurementResponse> items = measurementRepository
                .findForList(userId, query.from(), query.toExclusive(), Limit.of(query.limit()))
                .stream().map(HealthMeasurementService::toResponse).toList();
        return new MeasurementResponse.ListResponse(items);
    }

    /**
     * The row is locked first (HEALTH8-17), so two PATCHes on one row run one after the other and each changes
     * only its own fields on the latest values: a field nobody asked to change never goes back to an old value.
     * Another member's record and a missing one are the same 404. An empty change writes nothing.
     */
    @Transactional
    public MeasurementResponse update(Long userId, Long measurementId, MeasurementChange change) {
        HealthMeasurement measurement = measurementRepository.findByIdAndUserIdForUpdate(measurementId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEASUREMENT_NOT_FOUND));
        if (!change.isEmpty()) {
            measurement.apply(change.measuredAt(), change.values());
            log.info("Body measurement changed: userId={}, measurementId={}", userId, measurementId);
        }
        return toResponse(measurement);
    }

    static MeasurementResponse toResponse(HealthMeasurement m) {
        return new MeasurementResponse(m.getMeasurementId(), m.getMeasuredAt(),
                MeasurementResponse.twoDecimals(m.getHeightCm()), MeasurementResponse.twoDecimals(m.getWeightKg()),
                MeasurementResponse.twoDecimals(m.getBodyFatPct()),
                MeasurementResponse.twoDecimals(m.getSkeletalMuscleKg()),
                HealthMetricsCalculator.bmi(m.getHeightCm(), m.getWeightKg()));
    }
}
