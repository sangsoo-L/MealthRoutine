package com.healthlab.mealthroutine.backend.exercise.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

/**
 * One set's target after validation (frontend NormalizedSet). Only the fields the record type uses are present; the
 * others are null and left out of the JSON. Stored as-is in the set_targets JSON column and returned in responses.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SetTarget(Integer reps, BigDecimal weightKg, Integer targetSeconds) {
}
