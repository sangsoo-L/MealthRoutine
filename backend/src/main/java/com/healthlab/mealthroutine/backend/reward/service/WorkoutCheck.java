package com.healthlab.mealthroutine.backend.reward.service;

import java.time.LocalDate;

public interface WorkoutCheck {
    boolean hasCompletedWorkout(Long userId, LocalDate date); // 그날 운동 완료했는지
}
