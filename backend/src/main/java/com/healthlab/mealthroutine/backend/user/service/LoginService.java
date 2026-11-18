package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.dto.LoginRequest;
import com.healthlab.mealthroutine.backend.user.dto.LoginResponse;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.jwt.RefreshTokens;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Local email login, unit 1 of login/JWT (LOGIN-1): issues tokens only. Other APIs still use the
 * development X-User-Id header until the authentication filter (unit 2).
 */
@Slf4j
@Service
public class LoginService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;
    private final Clock clock;
    /** Compared against when the email is unknown, so that case costs the same BCrypt time. */
    private final String dummyPasswordHash;

    public LoginService(UserRepository userRepository, PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider, JwtProperties jwtProperties, Clock clock) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.jwtProperties = jwtProperties;
        this.clock = clock;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * One transaction (LOGIN-4): restoring a pending-deletion account and saving the refresh hash commit
     * together, or neither does if token creation fails.
     */
    @Transactional
    public LoginResult login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email()).orElse(null);
        if (!passwordMatches(user, request.password())) {
            throw loginFailed("bad credentials");
        }

        LocalDateTime now = LocalDateTime.now(clock);
        boolean restored = false;
        switch (user.getAccountStatus()) {
            case ACTIVE -> { }
            case SUSPENDED -> throw new BusinessException(ErrorCode.ACCOUNT_SUSPENDED);
            case DELETED -> throw loginFailed("deleted account");
            case PENDING_DELETION -> {
                if (!user.canRestoreFromWithdrawal(now)) {
                    throw loginFailed("withdrawal window over");
                }
                user.restoreFromWithdrawal();
                restored = true;
            }
        }

        Instant issuedAt = clock.instant();
        String accessToken = jwtTokenProvider.createAccessToken(user.getUserId(), user.getUserRole(), issuedAt);
        String refreshToken = RefreshTokens.generate();
        user.replaceRefreshToken(RefreshTokens.hash(refreshToken), now.plus(jwtProperties.refreshTtl()));
        userRepository.flush();

        LoginResponse body = new LoginResponse(accessToken, new LoginResponse.UserSummary(
                user.getUserId(),
                lower(user.getUserRole()),
                lower(AccountStatus.ACTIVE),
                user.hasPin(),
                false), // TODO(팀장 확인): onboardingCompleted 기준은 설문·프로필 단위에서 확정 (ONBOARD-1)
                restored);
        return new LoginResult(body, refreshToken);
    }

    private boolean passwordMatches(User user, String rawPassword) {
        if (user == null || user.getPasswordHash() == null) {
            passwordEncoder.matches(rawPassword, dummyPasswordHash);
            return false;
        }
        return passwordEncoder.matches(rawPassword, user.getPasswordHash());
    }

    /** Application log only (AUDIT-1): no email, password or token in the message. */
    private BusinessException loginFailed(String reason) {
        log.info("Login failed: {}", reason);
        return new BusinessException(ErrorCode.LOGIN_FAILED);
    }

    private static String lower(Enum<?> value) {
        return value.name().toLowerCase(Locale.ROOT);
    }
}
