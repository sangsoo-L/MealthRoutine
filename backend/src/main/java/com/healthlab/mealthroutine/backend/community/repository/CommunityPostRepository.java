package com.healthlab.mealthroutine.backend.community.repository;

import com.healthlab.mealthroutine.backend.community.domain.CommunityPost;
import com.healthlab.mealthroutine.backend.community.domain.PostType;
import com.healthlab.mealthroutine.backend.community.domain.PostVisibility;
import java.util.Collection;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
                p.postId, p.postType, p.title, p.content, p.createdAt, u.accountStatus, pr.displayName)
            from CommunityPost p
            join p.user u
            left join UserProfile pr on pr.userId = u.userId
            where p.postId = :postId and p.visibility = :visibility and p.postType in :types
            """)
    Optional<PostDetailRow> findDetail(@Param("postId") Long postId,
            @Param("visibility") PostVisibility visibility, @Param("types") Collection<PostType> types);
}
