package com.healthlab.mealthroutine.backend.user.repository;

import com.healthlab.mealthroutine.backend.user.domain.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {

    /** The column's collation ignores letter case, so "Gildong" and "gildong" count as the same nickname. */
    boolean existsByDisplayName(String displayName);
}
