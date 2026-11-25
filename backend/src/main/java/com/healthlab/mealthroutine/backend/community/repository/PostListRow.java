package com.healthlab.mealthroutine.backend.community.repository;

import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import java.time.LocalDateTime;

/** One list row read in a single query with the author's status and nickname (no N+1). */
public record PostListRow(Long postId, PostType postType, String title, LocalDateTime createdAt,
        AccountStatus authorStatus, String authorDisplayName) {
}
