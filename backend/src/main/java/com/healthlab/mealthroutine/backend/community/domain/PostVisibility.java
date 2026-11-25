package com.healthlab.mealthroutine.backend.community.domain;

import com.healthlab.mealthroutine.backend.common.LowerCaseEnumConverter;
import jakarta.persistence.Converter;

/** community_posts.visibility. Only VISIBLE posts are shown; DELETED is the soft delete (Q-14). */
public enum PostVisibility {
    VISIBLE,
    HIDDEN,
    DELETED;

    @Converter(autoApply = true)
    public static class DbConverter extends LowerCaseEnumConverter<PostVisibility> {
        public DbConverter() {
            super(PostVisibility.class);
        }
    }
}
