package com.healthlab.mealthroutine.backend.common.security;

import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.security.AuthUserLookup.AuthUser;
import com.healthlab.mealthroutine.backend.user.jwt.AccessTokenResult;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads "Authorization: Bearer <access token>" and tells Spring Security who the user is.
 * <ul>
 *   <li>No Authorization header: passes through as a guest. URL rules decide whether guests may continue.</li>
 *   <li>Header present but the token is bad or expired: 401, even on public URLs (decision AUTH2-5).
 *       Exception (D-2): POST refresh and logout ignore the header, because the refresh cookie is their only
 *       credential and the access token is usually expired by then. Exact path and method only.</li>
 *   <li>Valid token: the account status and role come from the DB on every request (decision AUTH2-2).</li>
 * </ul>
 * X-User-Id is never read. Not a @Component: Spring Boot would also register it as a plain servlet filter,
 * so it would run twice. SecurityConfig creates it.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider tokenProvider;
    private final AuthUserLookup authUserLookup;
    private final SecurityErrorResponder errorResponder;

    public JwtAuthenticationFilter(JwtTokenProvider tokenProvider, AuthUserLookup authUserLookup,
            SecurityErrorResponder errorResponder) {
        this.tokenProvider = tokenProvider;
        this.authUserLookup = authUserLookup;
        this.errorResponder = errorResponder;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || usesRefreshCookieOnly(request)) {
            chain.doFilter(request, response);
            return;
        }

        // Step 1: read the token. Only this step turns a failure into 401.
        AccessTokenResult token = readToken(header);
        if (token.status() == AccessTokenResult.Status.EXPIRED) {
            errorResponder.write(response, ErrorCode.TOKEN_EXPIRED);
            return;
        }
        if (token.status() == AccessTokenResult.Status.INVALID) {
            errorResponder.write(response, ErrorCode.INVALID_TOKEN);
            return;
        }

        // Step 2: check the account. Not wrapped in try/catch, so a DB failure stays a server error (500).
        Optional<AuthUser> found = authUserLookup.find(token.userId());
        if (found.isEmpty()) {
            errorResponder.write(response, ErrorCode.LOGIN_REQUIRED);
            return;
        }
        ErrorCode refusal = refusalFor(found.get());
        if (refusal != null) {
            errorResponder.write(response, refusal);
            return;
        }
        authenticate(found.get());

        // Step 3: continue. Not wrapped either; controller errors are handled by GlobalExceptionHandler.
        chain.doFilter(request, response);
    }

    private static boolean usesRefreshCookieOnly(HttpServletRequest request) {
        if (!"POST".equals(request.getMethod())) {
            return false;
        }
        String path = request.getRequestURI();
        return SecurityConfig.REFRESH_PATH.equals(path) || SecurityConfig.LOGOUT_PATH.equals(path);
    }

    private AccessTokenResult readToken(String header) {
        // The scheme name is case-insensitive (RFC 7235), so "bearer abc" is accepted too.
        if (!header.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            return new AccessTokenResult(AccessTokenResult.Status.INVALID, null);
        }
        String token = header.substring(BEARER_PREFIX.length()).trim();
        if (token.isEmpty()) {
            return new AccessTokenResult(AccessTokenResult.Status.INVALID, null);
        }
        return tokenProvider.parseAccessToken(token);
    }

    /** Null when the account may use the API. */
    private static ErrorCode refusalFor(AuthUser user) {
        return switch (user.accountStatus()) {
            case "active" -> null;
            // Same code as the login API for suspended accounts (SUSPEND-MSG-1).
            case "suspended" -> ErrorCode.ACCOUNT_SUSPENDED;
            // pending_deletion: logging in again within 7 days restores the account (API-1), so ask for login.
            default -> ErrorCode.LOGIN_REQUIRED;
        };
    }

    private static void authenticate(AuthUser user) {
        UsernamePasswordAuthenticationToken authentication = UsernamePasswordAuthenticationToken.authenticated(
                user.userId(), null, List.of(new SimpleGrantedAuthority(user.authority())));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
    }
}
