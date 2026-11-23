package com.healthlab.mealthroutine.backend.common.security;

import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Which URLs need login (decision AUTH2-1). Everything not listed as public needs a valid access token.
 * <p>
 * <b>Adding a public API (no login)?</b> Add its method and path to the public lists below,
 * otherwise it answers 401. APIs that need login need nothing here; just use {@code @LoginUser}.
 */
@Configuration
public class SecurityConfig {

    /** Refresh and logout use only the refresh cookie, never the Authorization header (AUTH2-5 exception D-2). */
    static final String REFRESH_PATH = "/api/v1/auth/token/refresh";
    static final String LOGOUT_PATH = "/api/v1/auth/logout";

    private static final String[] PUBLIC_POST = {
        "/api/v1/auth/signup",
        "/api/v1/auth/login",
        REFRESH_PATH,
        LOGOUT_PATH,
        // Account lookup: public, limited per IP (ACCT6-4).
        "/api/v1/auth/account-lookup",
    };

    // "*" is one path segment: /exercises/3 is public, /exercises/3/anything is not.
    private static final String[] PUBLIC_GET = {
        "/api/v1/exercises",
        "/api/v1/exercises/*",
        "/api/v1/foods",
        "/api/v1/foods/*",
        // Guests see public routines only; RoutineController uses @LoginUser(required = false).
        "/api/v1/workout-routines",
        "/api/v1/workout-routines/*",
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtTokenProvider tokenProvider,
            AuthUserLookup authUserLookup, SecurityErrorResponder errorResponder) throws Exception {
        http
                // APIs use the Authorization header, which browsers never attach on their own, so Spring's CSRF
                // token is not used. The two cookie endpoints (refresh, logout) instead require the
                // X-Requested-With header, checked in AuthController (AUTH3-5).
                .csrf(AbstractHttpConfigurer::disable)
                // No server session, login page, Basic auth or logout page: JWT only.
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .exceptionHandling(handling -> handling
                        // No usable login on a protected URL.
                        .authenticationEntryPoint((request, response, e) ->
                                errorResponder.write(response, ErrorCode.LOGIN_REQUIRED))
                        // Logged in but the role is not allowed (for future admin APIs).
                        .accessDeniedHandler((request, response, e) ->
                                errorResponder.write(response, ErrorCode.ACCESS_DENIED)))
                .authorizeHttpRequests(auth -> auth
                        // Server errors are forwarded to /error. The JWT filter does not run again for that
                        // forward, so without these two lines a 500 would turn into 401.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_POST).permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_GET).permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider, authUserLookup, errorResponder),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
