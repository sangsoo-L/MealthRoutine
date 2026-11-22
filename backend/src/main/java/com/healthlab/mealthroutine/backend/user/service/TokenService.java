package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login unit 3: refresh (rotation) and logout, both based on the refresh cookie only.
 * Logs say why a request failed, never the token or its hash (AUDIT-1).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;
    private final Clock clock;

    /**
     * One transaction from lookup to the new access token (AUTH3-4): if creating the access token fails, the
     * rotated hash rolls back and the old cookie still works.
     */
    @Transactional
    public RefreshResult refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw refreshInvalid("no cookie");
        }
        String oldHash = RefreshTokens.hash(refreshToken);
        User user = userRepository.findByRefreshTokenHash(oldHash).orElseThrow(() -> refreshInvalid("unknown token"));

        LocalDateTime now = LocalDateTime.now(clock);
        // Expired from the exact expiry time on, like access tokens (AUTH2-6).
        if (user.getRefreshTokenExpiresAt() == null || !now.isBefore(user.getRefreshTokenExpiresAt())) {
            throw refreshInvalid("expired");
        }
        switch (user.getAccountStatus()) {
            case ACTIVE -> { }
            case SUSPENDED -> throw new BusinessException(ErrorCode.ACCOUNT_SUSPENDED);
            default -> throw refreshInvalid("account cannot log in");
        }

        String newToken = RefreshTokens.generate();
        int updated = userRepository.rotateRefreshToken(user.getUserId(), oldHash, RefreshTokens.hash(newToken),
                now.plus(jwtProperties.refreshTtl()));
        if (updated != 1) {
            throw refreshInvalid("already rotated");
        }
        String accessToken = jwtTokenProvider.createAccessToken(user.getUserId(), user.getUserRole(), clock.instant());
        return new RefreshResult(accessToken, newToken);
    }

    /**
     * Clears the refresh token only if the cookie still matches (D-3). No cookie or no match is a normal, repeated
     * logout. A DB failure is not caught, so it stays a 500.
     */
    @Transactional
    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            log.info("Logout without refresh cookie");
            return;
        }
        int cleared = userRepository.clearRefreshToken(RefreshTokens.hash(refreshToken));
        log.info("Logout: refresh token {}", cleared == 1 ? "cleared" : "not current");
    }

    private static BusinessException refreshInvalid(String reason) {
        log.info("Refresh failed: {}", reason);
        return new BusinessException(ErrorCode.REFRESH_INVALID);
    }
}
