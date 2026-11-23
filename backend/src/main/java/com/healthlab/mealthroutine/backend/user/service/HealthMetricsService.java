package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.user.domain.ExerciseLevel;
import com.healthlab.mealthroutine.backend.user.domain.HealthMeasurement;
import com.healthlab.mealthroutine.backend.user.domain.UserProfile;
import com.healthlab.mealthroutine.backend.user.dto.HealthMetricsResponse;
import com.healthlab.mealthroutine.backend.user.dto.MeasurementResponse;
import com.healthlab.mealthroutine.backend.user.repository.HealthMeasurementRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserProfileRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Health metric estimates (발췌본 7.2, HEALTH8-B). Reads the latest height and the latest weight separately (the
 * front end may save them in different rows, HEALTH8-7) and the profile's birth date, gender and exercise level.
 * No profile row means no birth date or gender and exercise level undecided. Nothing is stored (HEALTH8-A).
 * <p>
 * This service needs no PIN by itself: the PIN check is only for the API that shows the values (7.2), so other
 * server code may call it directly later.
 */
@Service
@RequiredArgsConstructor
public class HealthMetricsService {

    private final HealthMeasurementRepository measurementRepository;
    private final UserProfileRepository userProfileRepository;
    private final Clock clock;

    @Transactional(readOnly = true)
    public HealthMetricsResponse metrics(Long userId) {
        Optional<HealthMeasurement> height = measurementRepository
                .findFirstByUserUserIdAndHeightCmIsNotNullOrderByMeasuredAtDescMeasurementIdDesc(userId);
        Optional<HealthMeasurement> weight = measurementRepository
                .findFirstByUserUserIdAndWeightKgIsNotNullOrderByMeasuredAtDescMeasurementIdDesc(userId);
        Optional<UserProfile> profile = userProfileRepository.findById(userId);

        HealthMetricsCalculator.Result result = HealthMetricsCalculator.calculate(
                height.map(HealthMeasurement::getHeightCm).orElse(null),
                weight.map(HealthMeasurement::getWeightKg).orElse(null),
                profile.map(UserProfile::getBirthDate).orElse(null),
                profile.map(UserProfile::getGender).orElse(null),
                profile.map(UserProfile::getExerciseLevel).orElse(ExerciseLevel.UNDECIDED),
                LocalDate.now(clock));

        HealthMetricsResponse.BasedOn basedOn = new HealthMetricsResponse.BasedOn(
                height.map(h -> MeasurementResponse.twoDecimals(h.getHeightCm())).orElse(null),
                height.map(HealthMeasurement::getMeasuredAt).orElse(null),
                weight.map(w -> MeasurementResponse.twoDecimals(w.getWeightKg())).orElse(null),
                weight.map(HealthMeasurement::getMeasuredAt).orElse(null));
        return new HealthMetricsResponse(basedOn, result.bmi(), result.bmr(), result.activityFactor(),
                result.tdee(), HealthMetricsCalculator.FORMULA, true, result.missingFields(),
                result.notCalculableFields());
    }
}
