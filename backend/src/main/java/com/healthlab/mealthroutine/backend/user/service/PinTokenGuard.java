package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.jwt.AccessTokenResult;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * The X-Pin-Token check for PIN-protected APIs (HEALTH8-10, HEALTH8-11). Each protected controller method calls
 * {@link #check} itself, after its input checks and before any database work for the request.
 * <p>
 * The login (access token) and the account status were already checked by the authentication filter; this does
 * not replace that. Order:
 * <ol>
 *   <li>A valid PIN token whose subject is the logged-in member: allowed, with no database read. The token is not
 *       invalidated on the server, so it keeps working until it expires even after a PIN lock, PIN change, logout
 *       or password change (PIN7-5).</li>
 *   <li>Anything else: if the member has no PIN, 403 PIN_NOT_REGISTERED (only the member's own row is read).</li>
 *   <li>Otherwise a properly signed but expired PIN token, whoever it belongs to, is 403 PIN_EXPIRED (the parser
 *       does not say whose an expired token is), and every other case — no header, blank, forged, an access token,
 *       another member's valid PIN token — is 403 PIN_REQUIRED.</li>
 * </ol>
 * The token is never logged.
 */
@Component
@RequiredArgsConstructor
public class PinTokenGuard {

    public static final String HEADER = "X-Pin-Token";

    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;

    public void check(Long userId, String pinTokenHeader) {
        AccessTokenResult token = pinTokenHeader == null || pinTokenHeader.isBlank()
                ? null : jwtTokenProvider.parsePinToken(pinTokenHeader.strip());
        if (token != null && token.status() == AccessTokenResult.Status.VALID && userId.equals(token.userId())) {
            return;
        }
        if (!userRepository.findById(userId).map(User::hasPin).orElse(false)) {
            throw new BusinessException(ErrorCode.PIN_NOT_REGISTERED);
        }
        if (token != null && token.status() == AccessTokenResult.Status.EXPIRED) {
            throw new BusinessException(ErrorCode.PIN_EXPIRED);
        }
        throw new BusinessException(ErrorCode.PIN_REQUIRED);
    }
}
