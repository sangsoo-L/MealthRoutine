package com.healthlab.mealthroutine.backend.community.domain;

import com.healthlab.mealthroutine.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * community_posts table: one row per post (C1, edit and delete in C2). The author (user) is always the logged-in
 * member; it never comes from the request body.
 * <p>
 * visibility is left out of INSERT so the DB default 'visible' fills it. created_at and updated_at are set from the
 * application clock instead of the DB default: a local MySQL started with the team command runs in UTC, while the
 * app and the production DB run in Asia/Seoul, so the DB default would be 9 hours off locally.
 * <p>
 * Hibernate writes every updatable column on UPDATE, visibility included. An edit that read the row before another
 * request deleted it would therefore write 'visible' back. CommunityPostService only changes a post after locking
 * its row and checking it again (C2-IMPL-1).
 */
@Entity
@Table(name = "community_posts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CommunityPost {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long postId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", updatable = false)
    private User user;

    @Column(updatable = false)
    private PostType postType;

    private String title;

    @Column(columnDefinition = "MEDIUMTEXT")
    private String content;

    @Column(insertable = false)
    private PostVisibility visibility;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public CommunityPost(User user, PostType postType, String title, String content, LocalDateTime now) {
        this.user = user;
        this.postType = postType;
        this.title = title;
        this.content = content;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Only visible free board posts may be edited or deleted (decision C2-D3); anything else is a 404. */
    public boolean isEditableTarget() {
        return visibility == PostVisibility.VISIBLE && postType == PostType.GENERAL;
    }

    /** Reading the id of the lazy author proxy does not load the users row. */
    public boolean isWrittenBy(long userId) {
        return user.getUserId() == userId;
    }

    /**
     * Replaces the title and content (C2). Nothing changes, updated_at included, when both are the same.
     *
     * @return whether anything changed
     */
    public boolean edit(String title, String content, LocalDateTime now) {
        if (this.title.equals(title) && this.content.equals(content)) {
            return false;
        }
        this.title = title;
        this.content = content;
        this.updatedAt = now;
        return true;
    }

    /** Soft delete (Q-14): the row, title and content stay; lists and detail stop showing it. */
    public void markDeleted(LocalDateTime now) {
        this.visibility = PostVisibility.DELETED;
        this.updatedAt = now;
    }
}
