package com.healthlab.mealthroutine.backend.community.repository;

import com.healthlab.mealthroutine.backend.community.domain.CommunityPost;
import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.community.domain.PostVisibility;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {

    /** Newest first; post_id breaks ties between posts made in the same second. */
    @Query(value = """
            select new com.healthlab.mealthroutine.backend.community.repository.PostListRow(
                p.postId, p.postType, p.title, p.createdAt, u.accountStatus, pr.displayName)
            from CommunityPost p
            join p.user u
            left join UserProfile pr on pr.userId = u.userId
            where p.visibility = :visibility and p.postType in :types
            order by p.createdAt desc, p.postId desc
            """,
            countQuery = """
            select count(p) from CommunityPost p
            where p.visibility = :visibility and p.postType in :types
            """)
    Page<PostListRow> findList(@Param("visibility") PostVisibility visibility,
            @Param("types") Collection<PostType> types, Pageable pageable);

    @Query("""
            select new com.healthlab.mealthroutine.backend.community.repository.PostDetailRow(
                p.postId, p.postType, p.title, p.content, p.createdAt, u.userId, u.accountStatus, pr.displayName)
            from CommunityPost p
            join p.user u
            left join UserProfile pr on pr.userId = u.userId
            where p.postId = :postId and p.visibility = :visibility and p.postType in :types
            """)
    Optional<PostDetailRow> findDetail(@Param("postId") Long postId,
            @Param("visibility") PostVisibility visibility, @Param("types") Collection<PostType> types);

    // ---------- edit and delete (C2-IMPL-1, same order as ExerciseRoutineRepository) ----------

    /**
     * Plain (non-locking) check that the post is an edit target: a visible post of the given type (C2-D3). A missing
     * id never reaches SELECT ... FOR UPDATE.
     */
    @Query("select count(p) > 0 from CommunityPost p"
            + " where p.postId = :postId and p.visibility = :visibility and p.postType = :type")
    boolean existsTarget(@Param("postId") Long postId, @Param("visibility") PostVisibility visibility,
            @Param("type") PostType type);

    /** Plain (non-locking) author check, so another member's request never locks this post's row. */
    @Query("select count(p) > 0 from CommunityPost p where p.postId = :postId and p.user.userId = :userId")
    boolean isWrittenBy(@Param("postId") Long postId, @Param("userId") Long userId);

    /**
     * Reads the post with a row lock (SELECT ... FOR UPDATE) until the transaction ends, so an edit and a delete of
     * the same post run one after the other and the second sees what the first committed. Call it only after
     * existsTarget and isWrittenBy passed, so only the author ever locks the row.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from CommunityPost p where p.postId = :postId")
    Optional<CommunityPost> findForUpdate(@Param("postId") Long postId);
}
