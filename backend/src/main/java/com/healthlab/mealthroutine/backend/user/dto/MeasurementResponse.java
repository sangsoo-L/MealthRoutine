package com.healthlab.mealthroutine.backend.user.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

/**
 * One body measurement, sent only after the PIN check (GET list items and the PATCH answer). Values have two
 * decimals like the DB columns (170.50); a value that was never recorded is null. bmi is calculated from this row's
 * own height and weight, and is null unless the row has both (HEALTH8-6).
 */
public record MeasurementResponse(Long measurementId, LocalDateTime measuredAt, BigDecimal heightCm,
        BigDecimal weightKg, BigDecimal bodyFatPct, BigDecimal skeletalMuscleKg, BigDecimal bmi) {

    /** DB scale (2), so a value just changed by PATCH looks the same as one read back from the DB. */
    public static BigDecimal twoDecimals(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.UNNECESSARY);
    }

    /** GET /api/v1/health/measurements answer. */
    public record ListResponse(List<MeasurementResponse> items) {
    }
}
