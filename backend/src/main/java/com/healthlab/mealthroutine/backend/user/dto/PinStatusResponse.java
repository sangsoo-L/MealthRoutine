package com.healthlab.mealthroutine.backend.user.dto;

import java.time.LocalDateTime;

/** GET /api/v1/users/me/pin/status. lockedUntil is null unless locked is true. */
public record PinStatusResponse(boolean registered, boolean locked, LocalDateTime lockedUntil) {
}
