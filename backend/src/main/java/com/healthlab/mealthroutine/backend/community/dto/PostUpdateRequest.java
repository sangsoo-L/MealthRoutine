package com.healthlab.mealthroutine.backend.community.dto;

import com.healthlab.mealthroutine.backend.user.dto.StrictStringDeserializer;
import tools.jackson.databind.annotation.JsonDeserialize;

/**
 * PATCH /community/posts/{postId} body (C2). Both values are required and must be real JSON strings, checked by the
 * same PostRules as create (decision C2-D2). Any other field (postType, userId, visibility, ...) is ignored: the board,
 * the author and the visibility never change through this API.
 */
public record PostUpdateRequest(
        @JsonDeserialize(using = StrictStringDeserializer.class) String title,
        @JsonDeserialize(using = StrictStringDeserializer.class) String content) {
}
