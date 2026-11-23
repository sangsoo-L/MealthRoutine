package com.healthlab.mealthroutine.backend.user.dto;

import java.math.BigDecimal;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * Body of POST /api/v1/health/measurements and PATCH /api/v1/health/measurements/{measurementId}.
 * <p>
 * A missing or null field: on POST the value is simply not recorded (measuredAt = now), on PATCH it means
 * "no change" (HEALTH8-5, HEALTH8-8). measuredAt arrives as text on purpose so that "" is a 400 instead of being
 * read as null; MeasurementRules checks and converts it. Numbers must be real JSON numbers
 * ({@link StrictDecimalDeserializer}). Other fields (bmi, userId, source, ...) are ignored.
 */
public record MeasurementRequest(
        @JsonDeserialize(using = StrictStringDeserializer.class) String measuredAt,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal heightCm,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal weightKg,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal bodyFatPct,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal skeletalMuscleKg) {

    /** Hides the body values if this object is ever logged. */
    @Override
    public String toString() {
        return "MeasurementRequest[measuredAt=" + measuredAt + ", values=(hidden)]";
    }
}
