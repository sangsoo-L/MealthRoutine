package com.healthlab.mealthroutine.backend.user.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

public enum AccountStatus {
    ACTIVE,
    SUSPENDED,
    PENDING_DELETION,
    DELETED;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<AccountStatus> {
        public DbConverter() {
            super(AccountStatus.class);
        }
    }
}
