package com.healthlab.mealthroutine.backend.community.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostCreateRequest;
import com.healthlab.mealthroutine.backend.community.dto.PostDetailResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostIdResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostSummaryResponse;
import com.healthlab.mealthroutine.backend.community.service.CommunityPostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Community posts (C1). The two GETs are public (SecurityConfig, D-02) and need no member data in this unit.
 * POST needs login; the author comes from the access token only.
 */
@RestController
@RequestMapping("/api/v1/community/posts")
@RequiredArgsConstructor
public class CommunityPostController {

    private final CommunityPostService postService;

    @GetMapping
    public ApiResponse<PageResponse<PostSummaryResponse>> list(
            @RequestParam(required = false) String postType,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ApiResponse.ok(postService.list(postType, page, size));
    }

    @GetMapping("/{postId}")
    public ApiResponse<PostDetailResponse> get(@PathVariable long postId) {
        return ApiResponse.ok(postService.get(postId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PostIdResponse> create(@LoginUser Long userId, @RequestBody PostCreateRequest request) {
        return ApiResponse.ok(postService.create(userId, request));
    }
}
