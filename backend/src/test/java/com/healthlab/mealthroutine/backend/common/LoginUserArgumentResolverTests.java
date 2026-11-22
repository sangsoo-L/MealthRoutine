package com.healthlab.mealthroutine.backend.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/** The resolver only reads the user the JWT filter verified. Plain unit tests, no Spring context. */
class LoginUserArgumentResolverTests {

    private final LoginUserArgumentResolver resolver = new LoginUserArgumentResolver();

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsTheVerifiedUserId() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(5L, null, List.of()));

        assertThat(resolve("required")).isEqualTo(5L);
        assertThat(resolve("optional")).isEqualTo(5L);
    }

    @Test
    void guestIsNullOnlyWhenOptional() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

        assertThat(resolve("optional")).isNull();
        assertThatThrownBy(() -> resolve("required"))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.LOGIN_REQUIRED));
    }

    @Test
    void noAuthenticationAtAllIsAGuest() throws Exception {
        assertThat(resolve("optional")).isNull();
        assertThatThrownBy(() -> resolve("required")).isInstanceOf(BusinessException.class);
    }

    private Object resolve(String methodName) throws Exception {
        MethodParameter parameter = MethodParameter.forExecutable(
                Handlers.class.getDeclaredMethod(methodName, Long.class), 0);
        return resolver.resolveArgument(parameter, null, null, null);
    }

    @SuppressWarnings("unused")
    static class Handlers {
        void required(@LoginUser Long userId) {
        }

        void optional(@LoginUser(required = false) Long userId) {
        }
    }
}
