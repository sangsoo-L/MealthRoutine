package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineItemRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseRoutineRepository;
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
public class RoutineService {

    private final ExerciseRoutineRepository routineRepository;
    private final ExerciseService exerciseService;

    @Transactional
    public RoutineResponse create(Long userId, RoutineCreateRequest request) {
        ExerciseRoutineEntity routine = new ExerciseRoutineEntity();
        routine.setOwnerUserId(userId);
        routine.setRoutineName(request.routineName());
        routine.setDescription(request.description());
        routine.setDifficulty(request.difficulty());
        if (request.visibility() != null) {
            routine.setVisibility(request.visibility());
        }
        replaceItems(routine, request.items());
        return RoutineResponse.detail(routineRepository.save(routine));
    }

    public PageResponse<RoutineResponse> getVisible(Long userId, int page, int size) {
        return PageResponse.from(routineRepository.findVisible(userId, PageRequest.of(page, size))
                .map(RoutineResponse::summary));
    }

    public RoutineResponse get(Long userId, Long routineId) {
        return RoutineResponse.detail(findReadable(userId, routineId));
    }

    @Transactional
    public RoutineResponse update(Long userId, Long routineId, RoutineUpdateRequest request) {
        ExerciseRoutineEntity routine = findOwned(userId, routineId);
        if (request.routineName() != null) {
            routine.setRoutineName(request.routineName());
        }
        if (request.description() != null) {
            routine.setDescription(request.description());
        }
        if (request.difficulty() != null) {
            routine.setDifficulty(request.difficulty());
        }
        if (request.visibility() != null) {
            routine.setVisibility(request.visibility());
        }
        if (request.items() != null) {
            replaceItems(routine, request.items());
        }
        routine.setUpdatedAt(LocalDateTime.now());
        return RoutineResponse.detail(routine);
    }

    @Transactional
    public void delete(Long userId, Long routineId) {
        routineRepository.delete(findOwned(userId, routineId));
    }

    /** Guests get 401 so the frontend can send them to login; members without access get 403. */
    ExerciseRoutineEntity findReadable(Long userId, Long routineId) {
        ExerciseRoutineEntity routine = find(routineId);
        if (!routine.isReadableBy(userId)) {
            throw new BusinessException(userId == null ? ErrorCode.LOGIN_REQUIRED : ErrorCode.ACCESS_DENIED);
        }
        return routine;
    }

    private ExerciseRoutineEntity findOwned(Long userId, Long routineId) {
        ExerciseRoutineEntity routine = find(routineId);
        if (!routine.isOwnedBy(userId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return routine;
    }

    private ExerciseRoutineEntity find(Long routineId) {
        return routineRepository.findById(routineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
    }

    private void replaceItems(ExerciseRoutineEntity routine, List<RoutineItemRequest> requests) {
        Map<Long, ExerciseEntity> exercises =
                exerciseService.findAll(requests.stream().map(RoutineItemRequest::exerciseId).toList());
        routine.getItems().clear();
        // Hibernate inserts before it deletes, so flush the removals first or the (routine, sequence) UNIQUE fails.
        if (routine.getRoutineId() != null) {
            routineRepository.flush();
        }
        short sequence = 1;
        for (RoutineItemRequest request : requests) {
            ExerciseRoutineItemEntity item = new ExerciseRoutineItemEntity();
            item.setRoutine(routine);
            item.setExercise(exercises.get(request.exerciseId()));
            item.setSequenceNumber(sequence++);
            item.setTargetSets(request.targetSets());
            item.setTargetReps(request.targetReps());
            item.setTargetDurationSeconds(request.targetDurationSeconds());
            item.setRestSeconds(request.restSeconds());
            routine.getItems().add(item);
        }
    }
}
