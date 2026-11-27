package com.healthlab.mealthroutine.backend.community.repository;

import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import java.time.LocalDateTime;

/**
 * A visible post with the author's status and nickname, read in one query. authorUserId is only compared on the
 * server to fill PostDetailResponse.mine (C2-D1); it is never sent.
 */
public record PostDetailRow(Long postId, PostType postType, String title, String content, LocalDateTime createdAt,
        Long authorUserId, AccountStatus authorStatus, String authorDisplayName) {
}
