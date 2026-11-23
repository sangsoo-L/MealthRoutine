package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.dto.PinChangeRequest;
import com.healthlab.mealthroutine.backend.user.dto.PinFailure;
import com.healthlab.mealthroutine.backend.user.dto.PinSetRequest;
import com.healthlab.mealthroutine.backend.user.dto.PinStatusResponse;
import com.healthlab.mealthroutine.backend.user.dto.PinTokenResponse;
import com.healthlab.mealthroutine.backend.user.dto.PinVerifyRequest;
import com.healthlab.mealthroutine.backend.user.jwt.JwtProperties;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * PIN APIs (member unit 7). Deliberately has no transaction: PinAttemptService runs and commits each PIN
 * transaction, and only then does this class turn its result into an error (PIN7-10), so a saved failure count is
 * never rolled back by the error. Application log only, no DB audit row (AUDIT-1 exception for unit 7); no PIN,
 * hash or token is ever logged.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PinService {

    private final PinAttemptService pinAttemptService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtProperties jwtProperties;
    private final Clock clock;

    public PinTokenResponse setPin(Long userId, PinSetRequest request) {
        PinCheckResult result = pinAttemptService.setPin(userId, passwordEncoder.encode(request.newPin()));
        throwIfFailed(userId, result);
        log.info("PIN set: userId={}", userId);
        return tokenResponse(result.pinToken());
    }

    public PinStatusResponse status(Long userId) {
        User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.LOGIN_REQUIRED));
        LocalDateTime lockedUntil = user.getPinLockedUntil();
        boolean locked = lockedUntil != null && LocalDateTime.now(clock).isBefore(lockedUntil);
        return new PinStatusResponse(user.hasPin(), locked, locked ? lockedUntil : null);
    }

    public PinTokenResponse verify(Long userId, PinVerifyRequest request) {
        PinCheckResult result = pinAttemptService.verify(userId, request.pin());
        throwIfFailed(userId, result);
        // The success (failure count reset) is already committed; a token failure here only answers 500.
        return tokenResponse(jwtTokenProvider.createPinToken(userId, clock.instant()));
    }

    public void change(Long userId, PinChangeRequest request) {
        PinCheckResult result = pinAttemptService.change(userId, passwordEncoder.encode(request.newPin()),
                request.currentPin(), request.currentPassword());
        throwIfFailed(userId, result);
        log.info("PIN changed: userId={}, proof={}", userId, proofOf(request));
    }

    private void throwIfFailed(Long userId, PinCheckResult result) {
        switch (result.outcome()) {
            case SUCCESS -> {
                return;
            }
            case INVALID -> {
                log.info("PIN mismatch: userId={}, remainingAttempts={}", userId, result.remainingAttempts());
                throw new BusinessException(ErrorCode.PIN_INVALID, PinFailure.remaining(result.remainingAttempts()));
            }
            case LOCKED -> {
                log.warn("PIN locked: userId={}, lockedUntil={}", userId, result.lockedUntil());
                throw new BusinessException(ErrorCode.PIN_LOCKED, PinFailure.lockedUntil(result.lockedUntil()));
            }
            case USER_NOT_FOUND -> throw new BusinessException(ErrorCode.LOGIN_REQUIRED);
            case NOT_REGISTERED -> throw new BusinessException(ErrorCode.PIN_NOT_REGISTERED);
            case ALREADY_SET -> throw new BusinessException(ErrorCode.PIN_ALREADY_SET);
            case PASSWORD_NOT_SET -> throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
            case PASSWORD_MISMATCH -> throw new BusinessException(ErrorCode.CURRENT_PASSWORD_MISMATCH);
            case PROOF_REQUIRED -> throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    private PinTokenResponse tokenResponse(String pinToken) {
        return new PinTokenResponse(pinToken, jwtProperties.pinTtl().toSeconds());
    }

    private static String proofOf(PinChangeRequest request) {
        if (request.currentPin() != null) {
            return "currentPin";
        }
        return request.currentPassword() != null ? "currentPassword" : "none";
    }
}
