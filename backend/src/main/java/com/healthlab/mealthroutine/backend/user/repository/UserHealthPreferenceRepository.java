package com.healthlab.mealthroutine.backend.user.repository;

import com.healthlab.mealthroutine.backend.user.domain.UserHealthPreference;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserHealthPreferenceRepository extends JpaRepository<UserHealthPreference, Long> {
}
