package com.healthlab.mealthroutine.backend.exercise.dto;

import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import jakarta.validation.constraints.NotNull;

public record SessionStatusRequest(@NotNull SessionStatus status) {
}
