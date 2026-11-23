package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.ExerciseLevel;
import com.healthlab.mealthroutine.backend.user.domain.Gender;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.domain.UserHealthPreference;
import com.healthlab.mealthroutine.backend.user.domain.UserProfile;
import com.healthlab.mealthroutine.backend.user.dto.MeResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileResponse;
import com.healthlab.mealthroutine.backend.user.dto.ProfileUpdateRequest;
import com.healthlab.mealthroutine.backend.user.repository.UserHealthPreferenceRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserProfileRepository;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * My info and my profile (member unit 4, PROFILE4-1~8). The user is always the one in the access token;
 * no request value can point at another user.
 */
@Service
@RequiredArgsConstructor
public class UserProfileService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private final UserRepository userRepository;
    private final UserProfileRepository profileRepository;
    private final UserHealthPreferenceRepository preferenceRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Transactional(readOnly = true)
    public MeResponse getMe(Long userId) {
        // The filter already found this user in the DB for this request (AUTH2-2).
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.LOGIN_REQUIRED));
        String nickname = profileRepository.findById(userId).map(UserProfile::getDisplayName).orElse(null);
        return new MeResponse(
                user.getUserId(),
                user.getEmail(),
                user.getUsername(),
                nickname,
                lower(user.getUserRole()),
                lower(user.getAccountStatus()),
                user.getPasswordHash() != null,
                user.hasPin(),
                false); // PROFILE4-2: stays false until the survey unit; same as the login response
    }

    /** A user with no profile row gets the defaults; nothing is saved (PROFILE4-3). */
    @Transactional(readOnly = true)
    public ProfileResponse getProfile(Long userId) {
        return toResponse(userId);
    }

    /**
     * One transaction for both tables, so a failure in the second save undoes the first (PROFILE4-3).
     * Order: check everything → nothing to change? return → save user_profiles → save user_health_preferences.
     * Each table is saved only when the request has a non-null field for it ("" and [] count: they clear).
     * Both saves are explicit saveAndFlush calls; without this method's @Transactional each would commit on its own.
     */
    @Transactional
    public ProfileResponse updateProfile(Long userId, ProfileUpdateRequest request) {
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS); // DATETIME has no fractions
        ProfileChanges changes = ProfileChanges.from(request, now.toLocalDate());
        if (changes.displayName() != null && profileRepository.existsByDisplayNameAndUserIdNot(changes.displayName(), userId)) {
            throw new BusinessException(ErrorCode.NICKNAME_ALREADY_EXISTS);
        }
        if (changes.isEmpty()) {
            return toResponse(userId); // PROFILE4-7: no row created, no updated_at change
        }

        if (changes.touchesProfile()) {
            UserProfile profile = profileRepository.findById(userId).orElseGet(() -> createProfile(userId));
            apply(changes, profile);
            profile.markUpdated(now);
            profileRepository.saveAndFlush(profile);
        }
        if (changes.touchesPreferences()) {
            String json = objectMapper.writeValueAsString(changes.dietaryPreferences());
            UserHealthPreference preference = preferenceRepository.findById(userId)
                    .map(found -> {
                        found.changeDietaryPreferences(json, now);
                        return found;
                    })
                    .orElseGet(() -> new UserHealthPreference(userId, json, now));
            preferenceRepository.saveAndFlush(preference);
        }
        return toResponse(userId);
    }

    /**
     * INSERT a row with DB defaults first. exercise_level is left out of INSERT, so a value set before this save
     * would be lost; the requested values are applied afterwards and saved as an UPDATE.
     */
    private UserProfile createProfile(Long userId) {
        return profileRepository.saveAndFlush(UserProfile.empty(userRepository.getReferenceById(userId)));
    }

    private static void apply(ProfileChanges changes, UserProfile profile) {
        if (changes.displayName() != null) {
            profile.changeDisplayName(changes.displayName());
        }
        if (changes.birthDate() != null) {
            profile.changeBirthDate(changes.birthDate());
        }
        if (changes.gender() != null) {
            profile.changeGender(changes.gender());
        }
        if (changes.regionCode() != null) {
            profile.changeRegionCode(ProfileChanges.storedValue(changes.regionCode()));
        }
        if (changes.exerciseLevel() != null) {
            profile.changeExerciseLevel(changes.exerciseLevel());
        }
        if (changes.phoneNumber() != null) {
            profile.changePhoneNumber(ProfileChanges.storedValue(changes.phoneNumber()));
        }
    }

    private ProfileResponse toResponse(Long userId) {
        List<String> foods = preferenceRepository.findById(userId)
                .map(UserHealthPreference::getDietaryPreferences)
                .map(this::readFoods)
                .orElse(List.of());
        return profileRepository.findById(userId)
                .map(p -> new ProfileResponse(p.getDisplayName(), p.getBirthDate(), apiValue(p.getGender()),
                        p.getRegionCode(), p.getProfileImageUrl(), apiValue(p.getExerciseLevel()), p.getPhoneNumber(),
                        foods))
                .orElseGet(() -> new ProfileResponse(null, null, null, null, null,
                        ExerciseLevel.UNDECIDED.apiValue(), null, foods));
    }

    private List<String> readFoods(String json) {
        List<String> foods = objectMapper.readValue(json, STRING_LIST);
        return foods == null ? List.of() : foods;
    }

    private static String apiValue(Gender gender) {
        return gender == null ? null : gender.apiValue();
    }

    private static String apiValue(ExerciseLevel level) {
        return level == null ? null : level.apiValue();
    }

    private static String lower(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }
}
