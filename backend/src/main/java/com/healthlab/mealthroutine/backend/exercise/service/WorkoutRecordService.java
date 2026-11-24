package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.domain.SetTargetsJson;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionSetEntity;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionRecordRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.SetTarget;
import com.healthlab.mealthroutine.backend.exercise.repository.WorkoutSessionRepository;
import com.healthlab.mealthroutine.backend.exercise.service.CompletedSetValidator.Done;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saves a finished workout uploaded by the frontend as one completed session (POST /workout-sessions/records).
 * The frontend keeps the in-progress session in the browser and only sends the result, so this never touches
 * in-progress sessions. Completed sets go into workout_session_sets as actual values, which is what the stats
 * (/summary) and the daily workout reward (WorkoutCheckImpl) already read.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WorkoutRecordService {

    /** Same clock as the stats, the reward check, AttendanceService and QuizService. */
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final WorkoutSessionRepository sessionRepository;
    private final ExerciseService exerciseService;

    /** The saved session and whether this call saved it (false = repeat of the same requestId). */
    public record SaveResult(SessionResponse session, boolean created) {
    }

    @Transactional
    public SaveResult save(Long userId, SessionRecordRequest request) {
        // Validate everything first so a bad body is a 400 even when the requestId was used before.
        LocalDateTime startedAt = toKst(request.startedAt());
        LocalDateTime endedAt = toKst(request.endedAt());
        if (endedAt.isBefore(startedAt)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        List<ExerciseSpec> exercises = request.exercises().stream().map(WorkoutRecordService::toSpec).toList();
        if (exercises.stream().allMatch(e -> e.done().isEmpty())) {
            // A record needs at least one completed set; the frontend refuses to complete without one too.
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }

        // Same member, same moment, same new requestId: without this lock both uploads would miss the lookup below
        // and the second insert would end in 409 DATA_CONFLICT. The lock comes before any other read so the lookup
        // sees what the first upload committed.
        sessionRepository.lockOwner(userId);
        Optional<WorkoutSessionEntity> existing = sessionRepository.findByUserIdAndRequestId(userId, request.requestId());
        if (existing.isPresent()) {
            if (!sameContent(existing.get(), startedAt, endedAt, exercises)) {
                throw new BusinessException(ErrorCode.REQUEST_CONFLICT);
            }
            return new SaveResult(SessionResponse.detail(existing.get(), false), false);
        }

        Map<Long, ExerciseEntity> catalog =
                exerciseService.findAll(exercises.stream().map(ExerciseSpec::exerciseId).toList());
        WorkoutSessionEntity session = new WorkoutSessionEntity();
        session.setUserId(userId);
        session.setStartedAt(startedAt);
        session.setEndedAt(endedAt);
        session.setStatus(SessionStatus.COMPLETED);
        session.setRequestId(request.requestId());
        for (ExerciseSpec spec : exercises) {
            WorkoutSessionExerciseEntity exercise = new WorkoutSessionExerciseEntity();
            exercise.setSession(session);
            exercise.setExercise(catalog.get(spec.exerciseId()));
            exercise.setRecordType(spec.recordType());
            exercise.setSetTargets(SetTargetsJson.write(spec.targets()));
            for (Done done : spec.done()) {
                WorkoutSessionSetEntity set = new WorkoutSessionSetEntity();
                set.setSessionExercise(exercise);
                set.setSetNumber(done.setNumber());
                set.setReps(done.reps());
                set.setWeightKg(done.weightKg());
                set.setDurationSeconds(done.durationSeconds());
                exercise.getSets().add(set);
            }
            session.getExercises().add(exercise);
        }
        return new SaveResult(SessionResponse.detail(sessionRepository.save(session), true), true);
    }

    /** DATETIME keeps whole seconds, so drop the fraction here or a repeated upload would not compare equal. */
    private static LocalDateTime toKst(OffsetDateTime time) {
        return time.atZoneSameInstant(KST).toLocalDateTime().truncatedTo(ChronoUnit.SECONDS);
    }

    /** One exercise as it will be stored. Built from the request or from a saved session, compared by equality. */
    private record ExerciseSpec(Long exerciseId, WorkoutRecordType recordType, List<SetTarget> targets,
            List<Done> done) {

        static ExerciseSpec of(WorkoutSessionExerciseEntity e) {
            List<Done> done = e.getSets().stream()
                    .map(s -> new Done(s.getSetNumber(), s.getReps(),
                            SetTargetValidator.normalizeWeight(s.getWeightKg()), s.getDurationSeconds()))
                    .toList();
            return new ExerciseSpec(e.getExercise().getExerciseId(), e.getRecordType(),
                    SetTargetsJson.read(e.getSetTargets()), done);
        }
    }

    private static ExerciseSpec toSpec(SessionRecordRequest.Exercise request) {
        List<SetTarget> targets = SetTargetValidator.validate(request.recordType(), request.setTargets());
        List<Done> done = CompletedSetValidator.validate(request.recordType(), targets.size(), request.completedSets());
        return new ExerciseSpec(request.exerciseId(), request.recordType(), targets, done);
    }

    private static boolean sameContent(WorkoutSessionEntity session, LocalDateTime startedAt, LocalDateTime endedAt,
            List<ExerciseSpec> exercises) {
        return session.getStatus() == SessionStatus.COMPLETED
                && startedAt.equals(session.getStartedAt())
                && endedAt.equals(session.getEndedAt())
                && session.getExercises().stream().map(ExerciseSpec::of).toList().equals(exercises);
    }
}
