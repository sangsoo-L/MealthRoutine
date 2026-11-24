package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineItemEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility;
import com.healthlab.mealthroutine.backend.exercise.domain.SetTargetsJson;
import com.healthlab.mealthroutine.backend.exercise.domain.WorkoutRecordType;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineItemRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineResponse;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineUpdateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.SetTarget;
import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseRoutineRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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

    /** Result of a create: the routine and whether this call made it (false = repeat of the same requestId). */
    public record CreateResult(RoutineResponse routine, boolean created) {
    }

    @Transactional
    public CreateResult create(Long userId, RoutineCreateRequest request) {
        // Check the items first so a bad body is a 400 even when the requestId was used before.
        List<ItemSpec> items = request.items().stream().map(RoutineService::toSpec).toList();
        RoutineVisibility visibility =
                request.visibility() == null ? RoutineVisibility.PRIVATE : request.visibility();

        if (request.requestId() != null) {
            // Same member, same moment, same new requestId: without this lock both requests would miss the lookup
            // below and the second insert would end in 409 DATA_CONFLICT instead of returning the first routine.
            // The lock comes before any other read so the lookup sees what the first request committed.
            routineRepository.lockOwner(userId);
            Optional<ExerciseRoutineEntity> existing =
                    routineRepository.findByOwnerUserIdAndRequestId(userId, request.requestId());
            if (existing.isPresent()) {
                if (!sameContent(existing.get(), request, visibility, items)) {
                    throw new BusinessException(ErrorCode.REQUEST_CONFLICT);
                }
                return new CreateResult(RoutineResponse.detail(existing.get(), false), false);
            }
        }

        ExerciseRoutineEntity routine = new ExerciseRoutineEntity();
        routine.setOwnerUserId(userId);
        routine.setRoutineName(request.routineName());
        routine.setDescription(request.description());
        routine.setDifficulty(request.difficulty());
        routine.setVisibility(visibility);
        routine.setRequestId(request.requestId());
        replaceItems(routine, items);
        return new CreateResult(RoutineResponse.detail(routineRepository.save(routine), true), true);
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
        List<ItemSpec> items =
                request.items() == null ? null : request.items().stream().map(RoutineService::toSpec).toList();
        ExerciseRoutineEntity routine = findOwnedForUpdate(userId, routineId);
        checkRevision(routine, request.expectedRevision());
        if (items != null && losesSetTargets(routine, items) && !Boolean.TRUE.equals(request.discardSetTargets())) {
            throw new BusinessException(ErrorCode.SET_TARGETS_WOULD_BE_LOST);
        }
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
        if (items != null) {
            replaceItems(routine, items);
        }
        routine.setRevision(routine.getRevision() + 1);
        routine.setUpdatedAt(LocalDateTime.now());
        return RoutineResponse.detail(routine);
    }

    @Transactional
    public void delete(Long userId, Long routineId, Integer expectedRevision) {
        ExerciseRoutineEntity routine = findOwnedForUpdate(userId, routineId);
        checkRevision(routine, expectedRevision);
        routineRepository.delete(routine);
    }

    /** Guests get 401 so the frontend can send them to login; members without access get 403. */
    ExerciseRoutineEntity findReadable(Long userId, Long routineId) {
        ExerciseRoutineEntity routine = find(routineId);
        if (!routine.isReadableBy(userId)) {
            throw new BusinessException(userId == null ? ErrorCode.LOGIN_REQUIRED : ErrorCode.ACCESS_DENIED);
        }
        return routine;
    }

    private ExerciseRoutineEntity findOwnedForUpdate(Long userId, Long routineId) {
        ExerciseRoutineEntity routine = routineRepository.findForUpdate(routineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        if (!routine.isOwnedBy(userId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return routine;
    }

    private ExerciseRoutineEntity find(Long routineId) {
        return routineRepository.findById(routineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
    }

    /**
     * True when the routine has per-set targets and an old-style item (targetSets only) is about to replace them.
     * The old shape cannot hold different targets per set or a weight, so that detail would be gone for good.
     */
    private static boolean losesSetTargets(ExerciseRoutineEntity routine, List<ItemSpec> newItems) {
        boolean hasSetTargets = routine.getItems().stream().anyMatch(item -> item.getSetTargets() != null);
        boolean hasOldStyle = newItems.stream().anyMatch(item -> item.sets() == null);
        return hasSetTargets && hasOldStyle;
    }

    private static void checkRevision(ExerciseRoutineEntity routine, Integer expectedRevision) {
        if (expectedRevision != null && expectedRevision != routine.getRevision()) {
            throw new BusinessException(ErrorCode.REVISION_MISMATCH,
                    Map.of("currentRevision", routine.getRevision()));
        }
    }

    /**
     * One item as it will be stored. Built from a request (after validation) or from a saved item, so a repeated
     * create can be compared with what was saved by plain equality. Weights are normalized (no trailing zeros) on
     * both sides, so 40 and 40.00 compare equal.
     */
    private record ItemSpec(Long exerciseId, Short targetSets, Short targetReps, Integer targetDurationSeconds,
            Integer restSeconds, WorkoutRecordType recordType, List<SetTarget> sets) {

        static ItemSpec of(ExerciseRoutineItemEntity item) {
            return new ItemSpec(item.getExercise().getExerciseId(), item.getTargetSets(), item.getTargetReps(),
                    item.getTargetDurationSeconds(), item.getRestSeconds(), item.getRecordType(),
                    SetTargetsJson.read(item.getSetTargets()));
        }
    }

    /** Checks which of the two item shapes was sent (see RoutineItemRequest) and fills the target_* columns. */
    private static ItemSpec toSpec(RoutineItemRequest request) {
        if (request.recordType() != null || request.sets() != null) {
            if (request.targetSets() != null || request.targetReps() != null
                    || request.targetDurationSeconds() != null) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST);
            }
            List<SetTarget> sets = SetTargetValidator.validate(request.recordType(), request.sets());
            SetTarget first = sets.get(0);
            return new ItemSpec(request.exerciseId(), (short) sets.size(),
                    first.reps() == null ? null : first.reps().shortValue(), first.targetSeconds(),
                    request.restSeconds(), request.recordType(), sets);
        }
        if (request.targetSets() == null) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
        return new ItemSpec(request.exerciseId(), request.targetSets(), request.targetReps(),
                request.targetDurationSeconds(), request.restSeconds(), null, null);
    }

    private static boolean sameContent(ExerciseRoutineEntity routine, RoutineCreateRequest request,
            RoutineVisibility visibility, List<ItemSpec> items) {
        return routine.getRoutineName().equals(request.routineName())
                && Objects.equals(routine.getDescription(), request.description())
                && routine.getDifficulty() == request.difficulty()
                && routine.getVisibility() == visibility
                && routine.getItems().stream().map(ItemSpec::of).toList().equals(items);
    }

    private void replaceItems(ExerciseRoutineEntity routine, List<ItemSpec> specs) {
        Map<Long, ExerciseEntity> exercises =
                exerciseService.findAll(specs.stream().map(ItemSpec::exerciseId).toList());
        routine.getItems().clear();
        // Hibernate inserts before it deletes, so flush the removals first or the (routine, sequence) UNIQUE fails.
        if (routine.getRoutineId() != null) {
            routineRepository.flush();
        }
        short sequence = 1;
        for (ItemSpec spec : specs) {
            ExerciseRoutineItemEntity item = new ExerciseRoutineItemEntity();
            item.setRoutine(routine);
            item.setExercise(exercises.get(spec.exerciseId()));
            item.setSequenceNumber(sequence++);
            item.setTargetSets(spec.targetSets());
            item.setTargetReps(spec.targetReps());
            item.setTargetDurationSeconds(spec.targetDurationSeconds());
            item.setRestSeconds(spec.restSeconds());
            item.setRecordType(spec.recordType());
            item.setSetTargets(SetTargetsJson.write(spec.sets()));
            routine.getItems().add(item);
        }
    }
}
