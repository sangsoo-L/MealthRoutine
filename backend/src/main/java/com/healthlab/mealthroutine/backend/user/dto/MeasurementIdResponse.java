package com.healthlab.mealthroutine.backend.user.dto;

/**
 * POST /api/v1/health/measurements answer: the new row's id only. No body values and no BMI, because this API needs
 * no PIN (검증-1, A-6: body values are never sent without a PIN check).
 */
public record MeasurementIdResponse(Long measurementId) {
}
