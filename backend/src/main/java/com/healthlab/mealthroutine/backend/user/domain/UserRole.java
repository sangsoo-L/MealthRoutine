package com.healthlab.mealthroutine.backend.user.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum UserRole {
    USER,
    SUBSCRIBE_USER,
    CONTENT_ADMIN,
    PRIVACY_ADMIN,
    SUPER_ADMIN;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<UserRole> {
        public DbConverter() {
            super(UserRole.class);
        }
    }
}
