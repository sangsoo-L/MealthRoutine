package com.healthlab.mealthroutine.backend.common.ratelimit;

import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.security.SecurityErrorResponder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Attempt limits for account lookup (per IP) and password change (per user): 5 per minute each (ACCT6-4, PWCHG6-1).
 * <p>
 * Runs in preHandle: after the security filters, before Spring reads the JSON body. So broken JSON or a number
 * where text is expected still counts as an attempt, and a blocked request never reaches the controller,
 * the service or its DB queries. (The security filter has already read the user's status for password change.)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AttemptLimitInterceptor implements HandlerInterceptor {

    public static final String ACCOUNT_LOOKUP_PATH = "/api/v1/auth/account-lookup";
    public static final String PASSWORD_PATH = "/api/v1/users/me/password";
    static final int MAX_ATTEMPTS = 5;
    static final Duration WINDOW = Duration.ofMinutes(1);

    private final AttemptLimiter attemptLimiter;
    private final SecurityErrorResponder errorResponder;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String key = keyFor(request);
        if (key == null) {
            return true;
        }
        AttemptLimiter.Result result = attemptLimiter.tryAcquire(key, MAX_ATTEMPTS, WINDOW);
        if (result.allowed()) {
            return true;
        }
        log.warn("Too many attempts: {}", request.getRequestURI()); // no IP, user id or body in the log
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(result.retryAfterSeconds()));
        errorResponder.write(response, ErrorCode.TOO_MANY_REQUESTS);
        return false;
    }

    /**
     * null when this request is not limited. Uses the pattern Spring MVC actually matched, not the raw URI: an
     * encoded path such as /account%2Dlookup reaches the same controller but would not equal the raw text.
     */
    private static String keyFor(HttpServletRequest request) {
        Object matched = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String path = matched == null ? null : matched.toString();
        if ("POST".equals(request.getMethod()) && ACCOUNT_LOOKUP_PATH.equals(path)) {
            return "lookup:ip:" + request.getRemoteAddr();
        }
        if ("PATCH".equals(request.getMethod()) && PASSWORD_PATH.equals(path)) {
            Long userId = currentUserId();
            return userId == null ? null : "password:user:" + userId;
        }
        return null;
    }

    /** The security filter already required a valid token for this path, so this is never null in practice. */
    private static Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof Long userId ? userId : null;
    }
}
