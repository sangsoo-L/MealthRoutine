package com.healthlab.mealthroutine.backend.reward.service;

import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.repository.WorkoutSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;

@Component
@RequiredArgsConstructor
public class WorkoutCheckImpl implements WorkoutCheck{

    private final WorkoutSessionRepository workoutSessionRepository; // 운동파트 리포지토리

    @Override
    public boolean hasCompletedWorkout(Long userId, LocalDate date) {
        return workoutSessionRepository.search(userId, SessionStatus.COMPLETED,
                        date.atStartOfDay(), date.plusDays(1).atStartOfDay(), Pageable.unpaged()) // 그날 완료 세션
                .stream()
                .anyMatch(s -> s.getEndedAt() != null
                        && Duration.between(s.getStartedAt(), s.getEndedAt()).toMinutes() >= 10); // 10분 이상
    }
}
