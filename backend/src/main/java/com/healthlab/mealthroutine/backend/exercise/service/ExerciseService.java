package com.healthlab.mealthroutine.backend.exercise.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.exercise.domain.Difficulty;
import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.domain.PreferenceExerciseEntity;
import com.healthlab.mealthroutine.backend.exercise.dto.ExerciseResponse;
import com.healthlab.mealthroutine.backend.exercise.repository.ExerciseRepository;
import com.healthlab.mealthroutine.backend.exercise.repository.PreferenceExerciseRepository;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final PreferenceExerciseRepository preferenceExerciseRepository;

    public PageResponse<ExerciseResponse> search(String keyword, Difficulty difficulty, String exerciseType,
            String equipment, int page, int size) {
        return PageResponse.from(exerciseRepository
                .search(keyword, difficulty, exerciseType, equipment, PageRequest.of(page, size))
                .map(ExerciseResponse::from));
    }

    public ExerciseResponse get(Long exerciseId) {
        return ExerciseResponse.from(find(exerciseId));
    }

    public List<ExerciseResponse> getFavorites(Long userId) {
        return preferenceExerciseRepository.findFavoriteExercises(userId).stream()
                .map(ExerciseResponse::from).toList();
    }

    @Transactional
    public void addFavorite(Long userId, Long exerciseId) {
        ExerciseEntity exercise = find(exerciseId);
        if (!preferenceExerciseRepository.existsByUserIdAndExerciseExerciseId(userId, exerciseId)) {
            preferenceExerciseRepository.save(new PreferenceExerciseEntity(userId, exercise));
        }
    }

    @Transactional
    public void removeFavorite(Long userId, Long exerciseId) {
        preferenceExerciseRepository.deleteByUserIdAndExerciseExerciseId(userId, exerciseId);
    }

    /** Loads exercises by id for routines and sessions; any unknown id is a 404. */
    Map<Long, ExerciseEntity> findAll(Collection<Long> exerciseIds) {
        Map<Long, ExerciseEntity> found = exerciseRepository.findAllById(new HashSet<>(exerciseIds)).stream()
                .collect(Collectors.toMap(ExerciseEntity::getExerciseId, Function.identity()));
        if (!found.keySet().containsAll(exerciseIds)) {
            throw new BusinessException(ErrorCode.EXERCISE_NOT_FOUND);
        }
        return found;
    }

    private ExerciseEntity find(Long exerciseId) {
        return exerciseRepository.findById(exerciseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.EXERCISE_NOT_FOUND));
    }
}
