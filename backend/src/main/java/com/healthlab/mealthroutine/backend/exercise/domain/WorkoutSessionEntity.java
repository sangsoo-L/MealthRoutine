package com.healthlab.mealthroutine.backend.exercise.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "workout_sessions")
@Getter
@Setter
@NoArgsConstructor
public class WorkoutSessionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long workoutSessionId;

    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "routine_id")
    private ExerciseRoutineEntity routine;

    private LocalDateTime startedAt;

    private LocalDateTime endedAt;

    private SessionStatus status = SessionStatus.IN_PROGRESS;

    private Byte feedbackRating;

    private String feedbackNote;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("workoutSessionExercisesId")
    private List<WorkoutSessionExerciseEntity> exercises = new ArrayList<>();
}
