package com.healthlab.mealthroutine.backend.exercise.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Totals cover completed sessions only. Volume is the sum of weight times reps. */
public record SessionSummaryResponse(LocalDate from, LocalDate to, long sessionCount, long totalDurationSeconds,
        BigDecimal totalVolumeKg) {
}
