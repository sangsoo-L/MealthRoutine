package com.healthlab.mealthroutine.backend.community.dto;

import java.time.LocalDateTime;

/**
 * One list item. Counts (comments, likes) and likedByMe are added by the comment and like units as new fields.
 * createdAt is Seoul time without an offset, like the other APIs.
 */
public record PostSummaryResponse(Long postId, String postType, String title, String authorName,
        LocalDateTime createdAt) {
}
