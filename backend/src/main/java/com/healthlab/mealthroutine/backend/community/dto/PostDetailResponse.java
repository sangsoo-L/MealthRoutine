package com.healthlab.mealthroutine.backend.community.dto;

import java.time.LocalDateTime;

/** One visible post. createdAt is Seoul time without an offset, like the other APIs. */
public record PostDetailResponse(Long postId, String postType, String title, String content, String authorName,
        LocalDateTime createdAt) {
}
