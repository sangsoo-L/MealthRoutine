package com.healthlab.mealthroutine.backend.user.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * GET /api/v1/health/metrics answer (발췌본 7.2 with HEALTH8-7 and HEALTH8-16). All numbers are estimates.
 * <ul>
 *   <li>basedOn: the latest height and the latest weight, each from its own row (they may differ).</li>
 *   <li>missingFields: inputs that are not there yet, in the order heightCm, weightKg, birthDate, gender.</li>
 *   <li>notCalculableFields: ["bmr","tdee"] when every input is there but the BMR before rounding is 0 or less;
 *       otherwise []. A BMR above 0 is a normal result even when it rounds to 0.</li>
 * </ul>
 */
public record HealthMetricsResponse(BasedOn basedOn, BigDecimal bmi, Integer bmr, BigDecimal activityFactor,
        Integer tdee, String formula, boolean isEstimated, List<String> missingFields,
        List<String> notCalculableFields) {

    public record BasedOn(BigDecimal heightCm, LocalDateTime heightMeasuredAt, BigDecimal weightKg,
            LocalDateTime weightMeasuredAt) {
    }
}
