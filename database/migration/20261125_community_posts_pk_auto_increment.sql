-- [기존 DB용] community_posts.post_id에 AUTO_INCREMENT를 붙인다.
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
--
-- 왜 필요한가: PK에 자동 번호가 없으면 서버(JPA IDENTITY)가 게시글을 저장할 때
--   "Field 'post_id' doesn't have a default value"로 실패한다(글 작성 API가 500).
--   서버 시작 검사(ddl-auto: validate)는 AUTO_INCREMENT를 보지 않으므로, 이 파일을 실행하지 않아도 서버는 뜨지만 작성에서 실패한다.
--
-- 무엇이 바뀌나: post_id의 "자동 번호" 설정만. 타입(BIGINT NOT NULL)·PK·FK·기존 행의 ID는 그대로다.
--   이미 AUTO_INCREMENT이면 건너뛰므로 여러 번 실행해도 결과가 같다.
--
-- FK 검사를 잠깐 끄는 이유와 조건(20261123_health_pk_auto_increment.sql과 같은 방식, 결정 C1-D2):
--   community_comments.post_id와 community_posts_likes.post_id가 community_posts.post_id를 FK로 참조한다.
--   FK가 참조하는 컬럼은 MODIFY하면 "ERROR 1833 Cannot change column ... used in a foreign key constraint"로 막힌다.
--   그래서 "이 컬럼을 참조하는 FK가 있을 때"만 같은 연결에서 FOREIGN_KEY_CHECKS를 0으로 바꿔 ALTER하고 바로 1로 되돌린다.
--   다시 1로 켜도 MySQL은 기존 데이터를 재검사하지 않으므로, 아래 사후 확인에서 ID·참조 관계가 같은지 직접 비교한다.
--
-- 멈추는 경우: 아래 1)의 사전 확인이 통과하지 않으면 ALTER를 실행하지 않는다(STOP_... 오류가 보이고 아무것도 바뀌지 않음).
--   DB 미선택 / FOREIGN_KEY_CHECKS가 1이 아님 / post_id가 BIGINT NOT NULL PK가 아님 / ID가 0 이하인 행이 있음.
--   ID 0 행은 AUTO_INCREMENT를 붙일 때 MySQL이 새 번호(1 등)로 바꿔 버려 댓글·좋아요의 참조가 끊긴다. 이 경우 회원 파트에 공유한다.
--   사전 기록(2) 중 하나라도 실패하면(테이블·권한 문제 등) 비교 기준이 없으므로 ALTER하지 않는다(STOP_baseline_not_recorded).
--   ALTER가 다른 이유(권한·잠금 대기 등)로 실패하면 바로 다음 줄에서 FK 검사를 1로 되돌리고, 결과를 성공으로 표시하지 않는다.
--
-- 실행 방법(권장: 오류가 나면 그 자리에서 멈추는 방식). 대상 DB마다(mealthroutine, mealthroutine_test) 각각 실행한다.
--   Docker(맥·윈도우 공통, 한 줄씩. 마지막 줄의 DB 이름만 바꿔 실행, 비밀번호는 입력 요청 때 입력):
--     docker cp database/migration/20261125_community_posts_pk_auto_increment.sql mysqldb:/tmp/community_pk.sql
--     docker exec -it mysqldb sh -c "mysql --default-character-set=utf8mb4 -u root -p mealthroutine < /tmp/community_pk.sql"
--   IntelliJ Database 콘솔 / MySQL Workbench: DB를 선택하고 파일 전체를 한 번에 실행.
--   [참고] mysql에 접속한 뒤 "source /tmp/community_pk.sql"로 실행하면 오류가 나도 다음 줄로 계속 진행된다.
--     이때도 ALTER는 막히지만, 결과표를 끝까지 보고 STOP_·ERROR가 있었는지 확인한다.
--
-- [중요] 중간에 오류가 났다면 같은 콘솔에서 아래를 실행해 1인지 확인하거나, 콘솔(연결)을 닫는다(IntelliJ·Workbench는 연결이 남는다).
--     SET FOREIGN_KEY_CHECKS = 1;
--     SELECT @@foreign_key_checks;   -- 1이어야 한다
-- 마지막 결과표의 result가 applied_or_already_done이 아니거나 same_* 값이 하나라도 0 또는 NULL(비교 불가)이면 성공이 아니다.
--   직접 고치지 말고 회원 파트에 공유한다.
-- 운영 DB는 백업 후, 커뮤니티 기능이 들어간 앱을 배포하기 전에 실행한다. 앱을 이전 버전으로 되돌려도(rollback) 이 변경은 되돌아가지 않는다.

-- 사전 확인을 끝내기 전에는 "확인 안 됨" 상태다. 아래 계산이 오류로 끝나도 이 값이 남아 ALTER가 실행되지 않는다.
SET @stop = 'STOP_checks_not_finished';
-- 사전 기록 값도 비워 둔다. 같은 연결에서 전에 실행한 값이 남아 있으면, 이번 기록이 실패해도 예전 값으로 비교하게 되기 때문이다.
SET @b_cp_rows = NULL, @b_cp_max = NULL, @b_cp_sum = NULL,
    @b_cc_rows = NULL, @b_cc_refs = NULL, @b_cc_orphans = NULL,
    @b_cl_rows = NULL, @b_cl_refs = NULL, @b_cl_orphans = NULL, @recorded = 0;
SET @db = DATABASE();
SELECT @db AS target_db, @@foreign_key_checks AS fk_checks_before;

-- 1) 사전 확인: 하나라도 걸리면 STOP_... 오류를 보이고, 이후 ALTER는 실행되지 않는다(아무것도 바뀌지 않음).
SET @stop = CASE
    WHEN @db IS NULL THEN 'STOP_no_database_selected'
    WHEN @@foreign_key_checks <> 1 THEN 'STOP_foreign_key_checks_is_not_1_open_a_new_connection'
    WHEN (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = @db AND table_name = 'community_posts' AND column_name = 'post_id'
            AND data_type = 'bigint' AND is_nullable = 'NO' AND column_key = 'PRI') <> 1
        THEN 'STOP_post_id_is_not_bigint_not_null_primary_key'
    WHEN (SELECT COUNT(*) FROM community_posts WHERE post_id <= 0) > 0
        THEN 'STOP_community_posts_has_id_0_or_less'
    ELSE NULL END;
SET @sql = IF(@stop IS NULL, 'SELECT ''checks_passed'' AS result', CONCAT('SELECT * FROM `', @stop, '`'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 사전 기록: 행 수, 최대·합계 ID, 자식(댓글·좋아요)의 참조 지문과 고아 수.
SET @b_cp_rows = (SELECT COUNT(*) FROM community_posts);
SET @b_cp_max = (SELECT COALESCE(MAX(post_id), 0) FROM community_posts);
SET @b_cp_sum = (SELECT COALESCE(SUM(post_id), 0) FROM community_posts);
SET @b_cc_rows = (SELECT COUNT(*) FROM community_comments);
SET @b_cc_refs = (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(comment_id, ':', post_id))), 0) FROM community_comments);
SET @b_cc_orphans = (SELECT COUNT(*) FROM community_comments c
                     LEFT JOIN community_posts p ON p.post_id = c.post_id WHERE p.post_id IS NULL);
SET @b_cl_rows = (SELECT COUNT(*) FROM community_posts_likes);
SET @b_cl_refs = (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(community_posts_like_id, ':', post_id))), 0)
                  FROM community_posts_likes);
SET @b_cl_orphans = (SELECT COUNT(*) FROM community_posts_likes l
                     LEFT JOIN community_posts p ON p.post_id = l.post_id WHERE p.post_id IS NULL);
-- 기록이 모두 끝났을 때만 1. 하나라도 실패했으면(값이 NULL로 남음) 0이고, 아래 3)에서 ALTER를 막는다.
SET @recorded = IF(@b_cp_rows IS NOT NULL AND @b_cp_max IS NOT NULL AND @b_cp_sum IS NOT NULL
                   AND @b_cc_rows IS NOT NULL AND @b_cc_refs IS NOT NULL AND @b_cc_orphans IS NOT NULL
                   AND @b_cl_rows IS NOT NULL AND @b_cl_refs IS NOT NULL AND @b_cl_orphans IS NOT NULL, 1, 0);
SELECT 'before' AS phase, @recorded AS baseline_recorded, @b_cp_rows AS post_rows, @b_cp_max AS post_max_id,
       @b_cc_rows AS comment_rows, @b_cc_orphans AS comment_orphans,
       @b_cl_rows AS like_rows, @b_cl_orphans AS like_orphans;

-- 3) ALTER: 사전 확인을 통과하고 사전 기록까지 끝났을 때만. 이미 AUTO_INCREMENT면 건너뜀.
SET @stop = IF(@stop IS NULL AND COALESCE(@recorded, 0) <> 1, 'STOP_baseline_not_recorded', @stop);
--    참조 FK가 있으면(= ERROR 1833 조건) 이 연결에서만 검사를 잠깐 끄고, ALTER 바로 뒤에 다시 켠다.
SET SESSION lock_wait_timeout = 30;
SET @cp_ai = (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = @db AND table_name = 'community_posts'
                AND column_name = 'post_id' AND extra LIKE '%auto_increment%');
SET @cp_fk = (SELECT COUNT(*) FROM information_schema.key_column_usage
              WHERE referenced_table_schema = @db AND referenced_table_name = 'community_posts'
                AND referenced_column_name = 'post_id');
SET FOREIGN_KEY_CHECKS = IF(@stop IS NULL AND @cp_ai = 0 AND @cp_fk > 0, 0, 1);
SET @sql = CASE
    WHEN @stop IS NOT NULL THEN 'SELECT ''community_posts'' AS not_altered_checks_failed'
    WHEN @cp_ai = 1 THEN 'SELECT ''community_posts'' AS skipped_already_auto_increment'
    ELSE 'ALTER TABLE community_posts MODIFY post_id BIGINT NOT NULL AUTO_INCREMENT' END;
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 위 ALTER가 실패해도(오류 뒤 계속 진행하는 실행 방식) 이 줄에서 검사를 다시 켠다.
SET FOREIGN_KEY_CHECKS = 1;
-- ALTER가 실제로 적용되지 않았으면 성공으로 표시하지 않는다.
SET @stop = IF(@stop IS NULL AND (SELECT COUNT(*) FROM information_schema.columns
                                  WHERE table_schema = @db AND table_name = 'community_posts'
                                    AND column_name = 'post_id' AND extra LIKE '%auto_increment%') = 0,
               'STOP_community_posts_alter_failed', @stop);

-- 4) 사후 확인: result = applied_or_already_done, same_* 모두 1, fk_checks_after = 1, auto_increment, FK 3개.
SELECT 'after' AS phase,
       IF(@stop IS NULL, 'applied_or_already_done', @stop) AS result,
       @@foreign_key_checks AS fk_checks_after,
       (SELECT COUNT(*) FROM community_posts) = @b_cp_rows
           AND (SELECT COALESCE(MAX(post_id), 0) FROM community_posts) = @b_cp_max
           AND (SELECT COALESCE(SUM(post_id), 0) FROM community_posts) = @b_cp_sum AS same_post_ids,
       (SELECT COUNT(*) FROM community_comments) = @b_cc_rows
           AND (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(comment_id, ':', post_id))), 0)
                FROM community_comments) = @b_cc_refs AS same_comment_refs,
       (SELECT COUNT(*) FROM community_comments c
        LEFT JOIN community_posts p ON p.post_id = c.post_id WHERE p.post_id IS NULL) = @b_cc_orphans
           AS same_comment_orphans,
       (SELECT COUNT(*) FROM community_posts_likes) = @b_cl_rows
           AND (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(community_posts_like_id, ':', post_id))), 0)
                FROM community_posts_likes) = @b_cl_refs AS same_like_refs,
       (SELECT COUNT(*) FROM community_posts_likes l
        LEFT JOIN community_posts p ON p.post_id = l.post_id WHERE p.post_id IS NULL) = @b_cl_orphans
           AS same_like_orphans;

SELECT table_name, column_name, column_type, is_nullable, column_key, extra
  FROM information_schema.columns
 WHERE table_schema = @db AND table_name = 'community_posts' AND column_name = 'post_id';

-- FK 3개(community_posts→users, community_comments→community_posts, community_posts_likes→community_posts)가 남아 있어야 한다.
SELECT constraint_name, table_name, referenced_table_name
  FROM information_schema.referential_constraints
 WHERE constraint_schema = @db
   AND (referenced_table_name = 'community_posts' OR table_name = 'community_posts')
 ORDER BY constraint_name;
