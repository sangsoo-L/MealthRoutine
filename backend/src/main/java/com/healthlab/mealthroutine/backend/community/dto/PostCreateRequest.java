package com.healthlab.mealthroutine.backend.community.dto;

import tools.jackson.databind.annotation.JsonDeserialize;
import com.healthlab.mealthroutine.backend.user.dto.StrictStringDeserializer;

/**
 * POST /community/posts body. Each value must be a real JSON string (12 or true is a 400, not "12" or "true").
 * A JSON null or a missing field arrives as null and is refused by PostRules. There is no author field: the author is
 * always the logged-in member, and any extra field such as userId is ignored.
 */
public record PostCreateRequest(
        @JsonDeserialize(using = StrictStringDeserializer.class) String postType,
        @JsonDeserialize(using = StrictStringDeserializer.class) String title,
        @JsonDeserialize(using = StrictStringDeserializer.class) String content) {
}
