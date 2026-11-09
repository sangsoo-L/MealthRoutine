package com.healthlab.mealthroutine.backend.common;

import jakarta.persistence.AttributeConverter;
import java.util.Locale;

/** DB ENUM values are lowercase while Java constants follow the team's UPPER_SNAKE_CASE rule. */
public abstract class LowerCaseEnumConverter<E extends Enum<E>> implements AttributeConverter<E, String> {

    private final Class<E> type;

    protected LowerCaseEnumConverter(Class<E> type) {
        this.type = type;
    }

    @Override
    public String convertToDatabaseColumn(E attribute) {
        return attribute == null ? null : attribute.name().toLowerCase(Locale.ROOT);
    }

    @Override
    public E convertToEntityAttribute(String dbData) {
        return dbData == null ? null : Enum.valueOf(type, dbData.toUpperCase(Locale.ROOT));
    }
}
