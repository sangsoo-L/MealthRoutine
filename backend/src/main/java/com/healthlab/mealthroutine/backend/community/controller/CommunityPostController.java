package com.healthlab.mealthroutine.backend.community.controller;

import com.healthlab.mealthroutine.backend.common.ApiResponse;
import com.healthlab.mealthroutine.backend.common.LoginUser;
import com.healthlab.mealthroutine.backend.common.PageResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostCreateRequest;
import com.healthlab.mealthroutine.backend.community.dto.PostDetailResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostIdResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostSummaryResponse;
import com.healthlab.mealthroutine.backend.community.dto.PostUpdateRequest;
import com.healthlab.mealthroutine.backend.community.service.CommunityPostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Community posts (C1, C2). The two GETs are public (SecurityConfig, D-02); the detail reads the token's member, if
 * any, only to fill mine (C2-D1). POST, PATCH and DELETE need login (only GET is listed as public) and the author or
 * editor always comes from the access token.
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
    public ApiResponse<PostDetailResponse> get(@LoginUser(required = false) Long userId,
            @PathVariable long postId) {
        return ApiResponse.ok(postService.get(postId, userId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<PostIdResponse> create(@LoginUser Long userId, @RequestBody PostCreateRequest request) {
        return ApiResponse.ok(postService.create(userId, request));
    }

    /** The author edits the title and content; 200 with the same body as the detail (C2). */
    @PatchMapping("/{postId}")
    public ApiResponse<PostDetailResponse> update(@LoginUser Long userId, @PathVariable long postId,
            @RequestBody PostUpdateRequest request) {
        return ApiResponse.ok(postService.update(userId, postId, request));
    }

    /** The author deletes the post (soft delete). 200 {"success":true,"message":...}: null data is left out (C2-D5). */
    @DeleteMapping("/{postId}")
    public ApiResponse<Void> delete(@LoginUser Long userId, @PathVariable long postId) {
        postService.delete(userId, postId);
        return ApiResponse.ok();
    }
}
