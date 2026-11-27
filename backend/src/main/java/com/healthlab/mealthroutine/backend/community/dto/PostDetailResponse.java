package com.healthlab.mealthroutine.backend.community.dto;

import java.time.LocalDateTime;

/**
 * One visible post. createdAt is Seoul time without an offset, like the other APIs.
 * <p>
 * mine (C2-D1) is true only when the access token's member wrote the post; guests always get false. It only decides
 * whether the screen shows the edit and delete buttons: the server checks the author again on PATCH and DELETE. The
 * author's member id is never sent.
 */
public record PostDetailResponse(Long postId, String postType, String title, String content, String authorName,
        LocalDateTime createdAt, boolean mine) {
}
