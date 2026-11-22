package com.healthlab.mealthroutine.backend.common;

import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Fills {@code @LoginUser Long userId} with the user that JwtAuthenticationFilter verified from the access token.
 * The X-User-Id header used during early development is no longer read.
 */
@Component
public class LoginUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(LoginUser.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Long userId = currentUserId();
        // Protected URLs never reach here without a user; this guards a public URL that still requires one.
        if (userId == null && parameter.getParameterAnnotation(LoginUser.class).required()) {
            throw new BusinessException(ErrorCode.LOGIN_REQUIRED);
        }
        return userId;
    }

    /** The verified user id, or null for a guest (Spring Security's anonymous user is not a Long). */
    private static Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof Long userId) {
            return userId;
        }
        return null;
    }
}
