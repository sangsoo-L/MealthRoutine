package com.healthlab.mealthroutine.backend.community.repository;

import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import java.time.LocalDateTime;

/** A visible post with the author's status and nickname, read in one query. */
public record PostDetailRow(Long postId, PostType postType, String title, String content, LocalDateTime createdAt,
        AccountStatus authorStatus, String authorDisplayName) {
}
