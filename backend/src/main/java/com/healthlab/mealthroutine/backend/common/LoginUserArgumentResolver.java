package com.healthlab.mealthroutine.backend.common;

import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

// shortcut: trusts the X-User-Id header, so anyone can act as any user. Dev only; replace here when login is built.
@Component
@RequiredArgsConstructor
public class LoginUserArgumentResolver implements HandlerMethodArgumentResolver {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ACTIVE_USER_SQL =
            "select count(*) from users where user_id = ? and account_status = 'active'";

    private final JdbcTemplate jdbcTemplate;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(LoginUser.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Long userId = findActiveUser(webRequest.getHeader(USER_ID_HEADER));
        if (userId == null && parameter.getParameterAnnotation(LoginUser.class).required()) {
            throw new BusinessException(ErrorCode.LOGIN_REQUIRED);
        }
        return userId;
    }

    private Long findActiveUser(String header) {
        if (header == null) {
            return null;
        }
        try {
            Long userId = Long.valueOf(header);
            Integer count = jdbcTemplate.queryForObject(ACTIVE_USER_SQL, Integer.class, userId);
            return count != null && count > 0 ? userId : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
