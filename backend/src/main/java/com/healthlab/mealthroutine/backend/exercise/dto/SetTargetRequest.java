package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.user.dto.StrictDecimalDeserializer;
import java.math.BigDecimal;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * One set's target as sent by the client. Every field is read as an exact JSON number (a string, boolean or 1e2 is a
 * 400), so 10.5 reps is rejected by SetTargetValidator instead of being silently cut to 10.
 */
public record SetTargetRequest(
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal reps,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal weightKg,
        @JsonDeserialize(using = StrictDecimalDeserializer.class) BigDecimal targetSeconds) {
}
