package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "exercise_goals")
@Getter
@Setter
@NoArgsConstructor
public class ExerciseGoalEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long exerciseGoalId;

    private Long userId;

    private String goalName;

    private BigDecimal targetValue;

    private LocalDate startDate;

    private LocalDate endDate;

    private Short exerciseMin;

    private GoalStatus status = GoalStatus.ACTIVE;

    private LocalDateTime createdAt = LocalDateTime.now();

    private EquipmentPreference preferenceExerciseEquipment;
}
