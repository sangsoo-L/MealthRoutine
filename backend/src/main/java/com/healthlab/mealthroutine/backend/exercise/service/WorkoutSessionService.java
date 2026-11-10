package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.SessionStatus;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutSessionSetEntity;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionExerciseRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionSummaryResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.SessionUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.repository.WorkoutSessionRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WorkoutSessionService {

    private final WorkoutSessionRepository sessionRepository;
    private final RoutineService routineService;
    private final ExerciseService exerciseService;

    @Transactional
    public SessionResponse create(Long userId, SessionCreateRequest request) {
        WorkoutSessionEntity session = new WorkoutSessionEntity();
        session.setUserId(userId);
        session.setStartedAt(request.startedAt() == null ? LocalDateTime.now() : request.startedAt());
        if (request.routineId() != null) {
            session.setRoutine(routineService.findReadable(userId, request.routineId()));
        }
        if (request.exercises() != null) {
            replaceExercises(session, request.exercises());
        } else if (session.getRoutine() != null) {
            session.getRoutine().getItems().forEach(item -> addExercise(session, item.getExercise(), item));
        }
        return SessionResponse.detail(sessionRepository.save(session));
    }

    public PageResponse<SessionResponse> search(Long userId, SessionStatus status, LocalDate from, LocalDate to,
            int page, int size) {
        return PageResponse.from(sessionRepository
                .search(userId, status, from == null ? null : from.atStartOfDay(),
                        to == null ? null : to.plusDays(1).atStartOfDay(), PageRequest.of(page, size))
                .map(SessionResponse::summary));
    }

    public SessionResponse get(Long userId, Long sessionId) {
        return SessionResponse.detail(findOwned(userId, sessionId));
    }

    @Transactional
    public SessionResponse update(Long userId, Long sessionId, SessionUpdateRequest request) {
        WorkoutSessionEntity session = findOwned(userId, sessionId);
        if (request.startedAt() != null) {
            session.setStartedAt(request.startedAt());
        }
        if (request.endedAt() != null) {
            session.setEndedAt(request.endedAt());
        }
        if (session.getEndedAt() != null && session.getEndedAt().isBefore(session.getStartedAt())) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        if (request.feedbackRating() != null) {
            session.setFeedbackRating(request.feedbackRating());
        }
        if (request.feedbackNote() != null) {
            session.setFeedbackNote(request.feedbackNote());
        }
        if (request.exercises() != null) {
            replaceExercises(session, request.exercises());
        }
        return SessionResponse.detail(session);
    }

    @Transactional
    public SessionResponse changeStatus(Long userId, Long sessionId, SessionStatus status) {
        if (!status.isFinished()) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        WorkoutSessionEntity session = findOwned(userId, sessionId);
        if (session.getStatus().isFinished()) {
            throw new BusinessException(ErrorCode.INVALID_SESSION_STATUS);
        }
        session.setStatus(status);
        if (session.getEndedAt() == null) {
            session.setEndedAt(LocalDateTime.now());
        }
        return SessionResponse.detail(session);
    }

    public SessionSummaryResponse summarize(Long userId, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        LocalDateTime start = from.atStartOfDay();
        LocalDateTime end = to.plusDays(1).atStartOfDay();
        WorkoutSessionRepository.SessionTotals totals = sessionRepository.sumSessions(userId, start, end);
        return new SessionSummaryResponse(from, to, totals.getSessionCount(), totals.getTotalDurationSeconds(),
                sessionRepository.sumVolumeKg(userId, start, end));
    }

    private WorkoutSessionEntity findOwned(Long userId, Long sessionId) {
        WorkoutSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SESSION_NOT_FOUND));
        if (!userId.equals(session.getUserId())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return session;
    }

    private void replaceExercises(WorkoutSessionEntity session, List<SessionExerciseRequest> requests) {
        Map<Long, ExerciseEntity> exercises =
                exerciseService.findAll(requests.stream().map(SessionExerciseRequest::exerciseId).toList());
        session.getExercises().clear();
        for (SessionExerciseRequest request : requests) {
            WorkoutSessionExerciseEntity exercise = addExercise(session, exercises.get(request.exerciseId()),
                    findRoutineItem(session.getRoutine(), request));
            if (request.sets() != null) {
                addSets(exercise, request.sets());
            }
        }
    }

    private WorkoutSessionExerciseEntity addExercise(WorkoutSessionEntity session, ExerciseEntity exercise,
            ExerciseRoutineItemEntity routineItem) {
        WorkoutSessionExerciseEntity sessionExercise = new WorkoutSessionExerciseEntity();
        sessionExercise.setSession(session);
        sessionExercise.setExercise(exercise);
        sessionExercise.setRoutineItem(routineItem);
        session.getExercises().add(sessionExercise);
        return sessionExercise;
    }

    private void addSets(WorkoutSessionExerciseEntity exercise, List<SessionExerciseRequest.SetRequest> requests) {
        short setNumber = 1;
        for (SessionExerciseRequest.SetRequest request : requests) {
            WorkoutSessionSetEntity set = new WorkoutSessionSetEntity();
            set.setSessionExercise(exercise);
            set.setSetNumber(setNumber++);
            set.setReps(request.reps());
            set.setWeightKg(request.weightKg());
            set.setDurationSeconds(request.durationSeconds());
            set.setDistanceM(request.distanceM());
            set.setRestSeconds(request.restSeconds());
            exercise.getSets().add(set);
        }
    }

    /** The item must belong to this session's routine and be the same exercise, or history would lie. */
    private ExerciseRoutineItemEntity findRoutineItem(ExerciseRoutineEntity routine, SessionExerciseRequest request) {
        if (request.exerciseRoutineItemId() == null) {
            return null;
        }
        if (routine == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return routine.getItems().stream()
                .filter(item -> item.getExerciseRoutineItemId().equals(request.exerciseRoutineItemId())
                        && item.getExercise().getExerciseId().equals(request.exerciseId()))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_REQUEST));
    }
}
