package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.dto.PasswordChangeRequest;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Password change for a logged-in user (DC-19, PWCHG6-1~2). The attempt limit runs before this, in
 * AttemptLimitInterceptor. Only an application log line, no DB audit row (AUDIT-1 exception for unit 6).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordChangeService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Checks in order: social-only account → current password → same as current. Then one conditional UPDATE
     * (new hash, refresh cleared) that only applies if the hash is still the one just verified; 0 rows means
     * another change got there first, which is reported like a wrong current password.
     */
    @Transactional
    public void changePassword(Long userId, PasswordChangeRequest request) {
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.LOGIN_REQUIRED));
        String currentHash = user.getPasswordHash();
        if (currentHash == null) {
            throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
        }
        if (!passwordEncoder.matches(request.currentPassword(), currentHash)) {
            throw new BusinessException(ErrorCode.CURRENT_PASSWORD_MISMATCH);
        }
        if (request.newPassword().equals(request.currentPassword())) {
            throw new BusinessException(ErrorCode.PASSWORD_SAME_AS_CURRENT);
        }
        int updated = userRepository.changePassword(userId, currentHash, passwordEncoder.encode(request.newPassword()));
        if (updated == 0) {
            throw new BusinessException(ErrorCode.CURRENT_PASSWORD_MISMATCH);
        }
        log.info("Password changed: userId={}", userId); // no password or hash in the log
    }
}
