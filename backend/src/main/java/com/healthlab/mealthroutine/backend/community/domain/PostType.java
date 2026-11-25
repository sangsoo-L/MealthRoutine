package com.healthlab.mealthroutine.backend.community.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;
import java.util.Locale;
import java.util.Optional;

/** community_posts.post_type (Q-11): free board = general, routine sharing = routine, beginner Q&A = question. */
public enum PostType {
    GENERAL,
    ROUTINE,
    QUESTION,
    /** In the DB enum but never used (Q-11). */
    NOTICE;

    /** The lowercase API value; NOTICE and unknown values are empty. Exact lowercase only ("General" is refused). */
    public static Optional<PostType> fromApiValue(String value) {
        if (value == null) {
            return Optional.empty();
        }
        for (PostType type : values()) {
            if (type != NOTICE && type.apiValue().equals(value)) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }

    public String apiValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<PostType> {
        public DbConverter() {
            super(PostType.class);
        }
    }
}
