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
import org.springframework.transaction.annotation.Transactional;

/** Free board list, detail and create (C1). Only visible posts are ever shown. */
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

    @Transactional(readOnly = true)
    public PostDetailResponse get(long postId) {
        if (postId <= 0) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        // NOTICE is never shown (Q-11): a visible notice row is a 404 here too, like in the list.
        PostDetailRow row = postRepository.findDetail(postId, PostVisibility.VISIBLE, PostRules.LISTABLE)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        return new PostDetailResponse(row.postId(), row.postType().apiValue(), row.title(), row.content(),
                authorName(row.authorStatus(), row.authorDisplayName()), row.createdAt());
    }

    /** The author is the logged-in member only; the JWT filter has already checked the account. */
    @Transactional
    public PostIdResponse create(long userId, PostCreateRequest request) {
        PostType type = PostRules.creatableType(request.postType());
        String title = PostRules.text(request.title(), PostRules.TITLE_MAX);
        String content = PostRules.text(request.content(), PostRules.CONTENT_MAX);
        // DATETIME has no fractions; dropping them avoids MySQL rounding up to the next second.
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        CommunityPost post = postRepository.save(
                new CommunityPost(userRepository.getReferenceById(userId), type, title, content, now));
        return new PostIdResponse(post.getPostId());
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
