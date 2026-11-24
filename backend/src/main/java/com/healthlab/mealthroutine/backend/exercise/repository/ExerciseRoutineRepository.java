package com.healthlab.mealthroutine.backend.exercise.repository;

import com.healthlab.mealthroutine.backend.exercise.domain.ExerciseRoutineEntity;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExerciseRoutineRepository extends JpaRepository<ExerciseRoutineEntity, Long> {

    @Query("""
            select r from ExerciseRoutineEntity r
            where r.visibility = com.healthlab.mealthroutine.backend.exercise.domain.RoutineVisibility.PUBLIC
               or r.ownerUserId = :userId
            order by r.routineId desc
            """)
    Page<ExerciseRoutineEntity> findVisible(@Param("userId") Long userId, Pageable pageable);

    /** Plain (non-locking) existence check, so a request for an id that does not exist never takes a lock. */
    @Query("select count(r) > 0 from ExerciseRoutineEntity r where r.routineId = :routineId")
    boolean routineExists(@Param("routineId") Long routineId);

    /** Plain (non-locking) ownership check, so another member's request never locks this routine's row. */
    @Query("select count(r) > 0 from ExerciseRoutineEntity r"
            + " where r.routineId = :routineId and r.ownerUserId = :userId")
    boolean isOwnedBy(@Param("routineId") Long routineId, @Param("userId") Long userId);

    /**
     * Reads the routine with a row lock (SELECT ... FOR UPDATE) so that two updates of the same routine run one after
     * the other: the second one sees the first one's revision and its expectedRevision check fails as it should.
     * Call it only after routineExists and isOwnedBy passed, so only the owner ever locks the row.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ExerciseRoutineEntity r where r.routineId = :routineId")
    Optional<ExerciseRoutineEntity> findForUpdate(@Param("routineId") Long routineId);

    Optional<ExerciseRoutineEntity> findByOwnerUserIdAndRequestId(Long ownerUserId, String requestId);

    /**
     * Locks the member's users row (SELECT ... FOR UPDATE) until the transaction ends, so creates with a requestId
     * from one member run one at a time. The second one waits for the first to commit, then its requestId lookup
     * finds the first routine instead of hitting the UNIQUE key. Returns null if the member does not exist.
     */
    @Query(nativeQuery = true, value = "select user_id from users where user_id = :userId for update")
    Long lockOwner(@Param("userId") Long userId);
}
