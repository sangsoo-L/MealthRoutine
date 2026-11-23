package com.healthlab.mealthroutine.backend.common;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Injects the id of the user in the access token ("Authorization: Bearer ..."). Without a user:
 * 401 LOGIN_REQUIRED, or null when required is false. A URL that guests may call (required = false)
 * must also be listed as public in common/security/SecurityConfig.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface LoginUser {
    boolean required() default true;
}
