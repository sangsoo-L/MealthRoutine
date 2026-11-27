package com.healthlab.mealthroutine.backend.community.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.community.domain.CommunityPost;
import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.community.domain.PostVisibility;
import com.healthlab.mealthroutine.backend.community.dto.PostCreateRequest;
import com.healthlab.mealthroutine.backend.community.dto.PostDetailResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostIdResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostSummaryResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostUpdateRequest;
import com.healthlab.mealthroutine.backend.community.repository.CommunityPostRepository;
import com.healthlab.mealthroutine.backend.community.repository.PostDetailRow;
import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Free board list, detail and create (C1), and the author's edit and delete (C2). Only visible posts are ever shown.
 */
@Service
@RequiredArgsConstructor
public class CommunityPostService {

    /** Author name of a deleted account (withdrawal plan A): the old nickname is never shown. */
    static final String WITHDRAWN_AUTHOR = "탈퇴한 회원";
    /** Author name when the profile or its nickname is missing (decision C1-D5). */
    static final String UNNAMED_AUTHOR = "회원";

    private final CommunityPostRepository postRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    @Transactional(readOnly = true)
    public PageResponse<PostSummaryResponse> list(String postType, Integer page, Integer size) {
        List<PostType> types = PostRules.listTypes(postType);
        PageRequest pageable = PageRequest.of(PostRules.page(page), PostRules.size(size));
        return PageResponse.from(postRepository.findList(PostVisibility.VISIBLE, types, pageable)
                .map(row -> new PostSummaryResponse(row.postId(), row.postType().apiValue(), row.title(),
                        authorName(row.authorStatus(), row.authorDisplayName()), row.createdAt())));
    }

    /** viewerId is the access token's member, or null for a guest (C2-D1: mine is false for guests). */
    @Transactional(readOnly = true)
    public PostDetailResponse get(long postId, Long viewerId) {
        if (postId <= 0) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        // NOTICE is never shown (Q-11): a visible notice row is a 404 here too, like in the list.
        PostDetailRow row = postRepository.findDetail(postId, PostVisibility.VISIBLE, PostRules.LISTABLE)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        boolean mine = viewerId != null && viewerId.equals(row.authorUserId());
        return new PostDetailResponse(row.postId(), row.postType().apiValue(), row.title(), row.content(),
                authorName(row.authorStatus(), row.authorDisplayName()), row.createdAt(), mine);
    }

    /**
     * The author replaces the title and content (C2). Order of failures (C2-D6): 400 for a bad body (checked before
     * anything is read), 404 when the post is not a visible free board post, 403 when someone else wrote it.
     * Two edits of the same post are applied one after the other and the later one stays (C2-D4).
     * <p>
     * READ COMMITTED (see findAuthoredForUpdate): after waiting for the row lock, the row read below must be the one
     * the previous request committed, not a snapshot from before the wait.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PostDetailResponse update(long userId, long postId, PostUpdateRequest request) {
        String title = PostRules.text(request.title(), PostRules.TITLE_MAX);
        String content = PostRules.text(request.content(), PostRules.CONTENT_MAX);
        CommunityPost post = findAuthoredForUpdate(userId, postId);
        post.edit(title, content, now());
        // Flush so the detail below reads the new title and content from the same transaction.
        postRepository.flush();
        return get(postId, userId);
    }

    /** Soft delete by the author (Q-14, C2-D5). The same order of failures as update; a second delete is a 404. */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void delete(long userId, long postId) {
        CommunityPost post = findAuthoredForUpdate(userId, postId);
        post.markDeleted(now());
    }

    /** The author is the logged-in member only; the JWT filter has already checked the account. */
    @Transactional
    public PostIdResponse create(long userId, PostCreateRequest request) {
        PostType type = PostRules.creatableType(request.postType());
        String title = PostRules.text(request.title(), PostRules.TITLE_MAX);
        String content = PostRules.text(request.content(), PostRules.CONTENT_MAX);
        CommunityPost post = postRepository.save(
                new CommunityPost(userRepository.getReferenceById(userId), type, title, content, now()));
        return new PostIdResponse(post.getPostId());
    }

    /**
     * Checks the target and the author with plain reads first and locks the row only for its author (C2-IMPL-1, the
     * RoutineService order that passed security review): another member's request never holds or waits for the lock,
     * and an id that does not exist never reaches SELECT ... FOR UPDATE. Both checks are repeated after the lock,
     * because the post may have been deleted while this request waited; so an edit never brings a deleted post back.
     */
    private CommunityPost findAuthoredForUpdate(long userId, long postId) {
        if (postId <= 0 || !postRepository.existsTarget(postId, PostVisibility.VISIBLE, PostType.GENERAL)) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        if (!postRepository.isWrittenBy(postId, userId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        CommunityPost post = postRepository.findForUpdate(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        if (!post.isEditableTarget()) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        if (!post.isWrittenBy(userId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return post;
    }

    /** DATETIME has no fractions; dropping them avoids MySQL rounding up to the next second. */
    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    static String authorName(AccountStatus status, String displayName) {
        if (status == AccountStatus.DELETED) {
            return WITHDRAWN_AUTHOR;
        }
        if (displayName == null || PostRules.trimBlank(displayName).isEmpty()) {
            return UNNAMED_AUTHOR;
        }
        return displayName;
    }
}
