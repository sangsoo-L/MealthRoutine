-- [기존 DB용] health_measurements.measurement_id, health_goals.health_goal_id에 AUTO_INCREMENT를 붙인다.
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
--
-- 왜 필요한가: 두 PK에 자동 번호가 없으면 서버(JPA IDENTITY)가 신체정보를 저장할 때 실패한다.
-- 서버 시작 검사(ddl-auto: validate)는 AUTO_INCREMENT를 보지 않으므로, 이 파일을 실행하지 않아도 서버는 뜨지만 저장에서 실패한다.
--
-- 무엇이 바뀌나: 두 컬럼의 "자동 번호" 설정만. 타입(BIGINT NOT NULL)·PK·FK·기존 행의 ID는 그대로다.
--   이미 AUTO_INCREMENT인 테이블은 건너뛰므로 여러 번 실행해도 결과가 같다(하나만 적용된 상태에서 다시 실행해도 안전).
--
-- FK 검사를 잠깐 끄는 이유와 조건(2026-11-23 MySQL 8.4.13에서 실측, 결정 HEALTH8-C 개정):
--   exercise_recommendations.measurement_id가 health_measurements.measurement_id를 FK로 참조한다.
--   FK가 참조하는 컬럼은 MODIFY하면 "ERROR 1833 Cannot change column ... used in a foreign key constraint"로 막힌다.
--   일반 SQL 파일은 오류 번호를 보고 분기할 수 없으므로, "이 컬럼을 참조하는 FK가 있을 때"(= 1833이 나는 조건)만
--   같은 연결에서 FOREIGN_KEY_CHECKS를 0으로 바꿔 ALTER하고 바로 1로 되돌린다.
--   health_goals는 참조하는 FK가 없어 검사를 끄지 않는다.
--   다시 1로 켜도 MySQL은 기존 데이터를 재검사하지 않으므로, 아래 사후 확인에서 ID·참조 관계가 같은지 직접 비교한다.
--
-- 멈추는 경우: 아래 1)의 사전 확인이 통과하지 않으면 ALTER를 실행하지 않는다(STOP_... 오류가 보이고 아무것도 바뀌지 않음).
--   DB 미선택 / FOREIGN_KEY_CHECKS가 1이 아님 / 두 PK 컬럼이 BIGINT NOT NULL PK가 아님 / ID가 0 이하인 행이 있음.
--   ID 0 행은 AUTO_INCREMENT를 붙일 때 MySQL이 새 번호(1 등)로 바꿔 버려 자식 행의 참조가 끊긴다(실측). 이 경우 회원 파트에 공유한다.
--   첫 ALTER가 다른 이유(권한·잠금 대기 등)로 실패하면 FK 검사를 1로 되돌리고 두 번째 ALTER도 실행하지 않는다.
--   실행 방식에 따라 오류 뒤에 다음 줄이 실행될 수도 있지만(아래), 그래도 ALTER는 위 조건을 통과해야만 실행된다.
--
-- 실행 방법(권장: 오류가 나면 그 자리에서 멈추는 방식). 대상 DB마다(mealthroutine, mealthroutine_test) 각각 실행한다.
--   Docker(맥·윈도우 공통, 한 줄씩. 마지막 줄의 DB 이름만 바꿔 실행, 비밀번호는 입력 요청 때 입력):
--     docker cp database/migration/20261123_health_pk_auto_increment.sql mysqldb:/tmp/health_pk.sql
--     docker exec -it mysqldb sh -c "mysql --default-character-set=utf8mb4 -u root -p mealthroutine < /tmp/health_pk.sql"
--   IntelliJ Database 콘솔 / MySQL Workbench: DB를 선택하고 파일 전체를 한 번에 실행.
--   [참고] mysql에 접속한 뒤 "source /tmp/health_pk.sql"로 실행하면 오류가 나도 다음 줄로 계속 진행된다(실측).
--     이때도 ALTER는 막히지만, 결과표를 끝까지 보고 STOP_·ERROR가 있었는지 확인한다.
--
-- [중요] 중간에 오류가 났다면 같은 콘솔에서 아래를 실행해 1인지 확인하거나, 콘솔(연결)을 닫는다(IntelliJ·Workbench는 연결이 남는다).
--     SET FOREIGN_KEY_CHECKS = 1;
--     SELECT @@foreign_key_checks;   -- 1이어야 한다
-- 마지막 결과표의 result가 applied_or_already_done이 아니거나 same_* 값이 하나라도 0이면 직접 고치지 말고 회원 파트에 공유한다.

-- 사전 확인을 끝내기 전에는 "확인 안 됨" 상태다. 아래 계산이 오류로 끝나도 이 값이 남아 ALTER가 실행되지 않는다.
SET @stop = 'STOP_checks_not_finished';
SET @db = DATABASE();
SELECT @db AS target_db, @@foreign_key_checks AS fk_checks_before;

-- 1) 사전 확인: 하나라도 걸리면 STOP_... 오류를 보이고, 이후 ALTER는 실행되지 않는다(아무것도 바뀌지 않음).
SET @stop = CASE
    WHEN @db IS NULL THEN 'STOP_no_database_selected'
    WHEN @@foreign_key_checks <> 1 THEN 'STOP_foreign_key_checks_is_not_1_open_a_new_connection'
    WHEN (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = @db AND data_type = 'bigint' AND is_nullable = 'NO' AND column_key = 'PRI'
            AND ((table_name = 'health_measurements' AND column_name = 'measurement_id')
              OR (table_name = 'health_goals' AND column_name = 'health_goal_id'))) <> 2
        THEN 'STOP_pk_columns_are_not_bigint_not_null_primary_key'
    WHEN (SELECT COUNT(*) FROM health_measurements WHERE measurement_id <= 0) > 0
        THEN 'STOP_health_measurements_has_id_0_or_less'
    WHEN (SELECT COUNT(*) FROM health_goals WHERE health_goal_id <= 0) > 0
        THEN 'STOP_health_goals_has_id_0_or_less'
    ELSE NULL END;
SET @sql = IF(@stop IS NULL, 'SELECT ''checks_passed'' AS result', CONCAT('SELECT * FROM `', @stop, '`'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 사전 기록: 행 수, 최대 ID, 자식(exercise_recommendations)의 참조 지문.
SET @b_hm_rows = (SELECT COUNT(*) FROM health_measurements);
SET @b_hm_max = (SELECT COALESCE(MAX(measurement_id), 0) FROM health_measurements);
SET @b_hm_sum = (SELECT COALESCE(SUM(measurement_id), 0) FROM health_measurements);
SET @b_hg_rows = (SELECT COUNT(*) FROM health_goals);
SET @b_hg_max = (SELECT COALESCE(MAX(health_goal_id), 0) FROM health_goals);
SET @b_hg_sum = (SELECT COALESCE(SUM(health_goal_id), 0) FROM health_goals);
SET @b_er_rows = (SELECT COUNT(*) FROM exercise_recommendations);
SET @b_er_refs = (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(exercise_recommendation_id, ':', measurement_id))), 0)
                  FROM exercise_recommendations);
SET @b_er_orphans = (SELECT COUNT(*) FROM exercise_recommendations er
                     LEFT JOIN health_measurements hm ON hm.measurement_id = er.measurement_id
                     WHERE hm.measurement_id IS NULL);
SELECT 'before' AS phase, @b_hm_rows AS hm_rows, @b_hm_max AS hm_max_id, @b_hg_rows AS hg_rows,
       @b_hg_max AS hg_max_id, @b_er_rows AS recommendation_rows, @b_er_orphans AS recommendation_orphans;

-- 3) health_measurements: 사전 확인을 통과했을 때만. 이미 AUTO_INCREMENT면 건너뜀.
--    참조 FK가 있으면(= ERROR 1833 조건) 이 연결에서만 검사를 잠깐 끄고, ALTER 바로 뒤에 다시 켠다.
SET SESSION lock_wait_timeout = 30;
SET @hm_ai = (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = @db AND table_name = 'health_measurements'
                AND column_name = 'measurement_id' AND extra LIKE '%auto_increment%');
SET @hm_fk = (SELECT COUNT(*) FROM information_schema.key_column_usage
              WHERE referenced_table_schema = @db AND referenced_table_name = 'health_measurements'
                AND referenced_column_name = 'measurement_id');
SET FOREIGN_KEY_CHECKS = IF(@stop IS NULL AND @hm_ai = 0 AND @hm_fk > 0, 0, 1);
SET @sql = CASE
    WHEN @stop IS NOT NULL THEN 'SELECT ''health_measurements'' AS not_altered_checks_failed'
    WHEN @hm_ai = 1 THEN 'SELECT ''health_measurements'' AS skipped_already_auto_increment'
    ELSE 'ALTER TABLE health_measurements MODIFY measurement_id BIGINT NOT NULL AUTO_INCREMENT' END;
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 위 ALTER가 실패해도(오류 뒤 계속 진행하는 실행 방식) 이 줄에서 검사를 다시 켠다.
SET FOREIGN_KEY_CHECKS = 1;
-- 첫 ALTER가 끝나지 않았으면 다음 ALTER도 하지 않는다.
SET @stop = IF(@stop IS NULL AND (SELECT COUNT(*) FROM information_schema.columns
                                  WHERE table_schema = @db AND table_name = 'health_measurements'
                                    AND column_name = 'measurement_id' AND extra LIKE '%auto_increment%') = 0,
               'STOP_health_measurements_alter_failed', @stop);

-- 4) health_goals: 사전 확인과 3)을 통과했을 때만. 참조 FK가 없어 검사를 끄지 않는다.
SET @hg_ai = (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = @db AND table_name = 'health_goals'
                AND column_name = 'health_goal_id' AND extra LIKE '%auto_increment%');
SET @sql = CASE
    WHEN @stop IS NOT NULL THEN 'SELECT ''health_goals'' AS not_altered_checks_failed'
    WHEN @hg_ai = 1 THEN 'SELECT ''health_goals'' AS skipped_already_auto_increment'
    ELSE 'ALTER TABLE health_goals MODIFY health_goal_id BIGINT NOT NULL AUTO_INCREMENT' END;
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- 두 번째 ALTER가 실패했는데 실행이 계속된 경우에도 성공으로 표시하지 않는다.
SET @stop = IF(@stop IS NULL AND (SELECT COUNT(*) FROM information_schema.columns
                                  WHERE table_schema = @db AND table_name = 'health_goals'
                                    AND column_name = 'health_goal_id' AND extra LIKE '%auto_increment%') = 0,
               'STOP_health_goals_alter_failed', @stop);

-- 5) 사후 확인: result = applied_or_already_done, same_* 모두 1, fk_checks_after = 1, 두 컬럼 auto_increment, FK 3개.
SELECT 'after' AS phase,
       IF(@stop IS NULL, 'applied_or_already_done', @stop) AS result,
       @@foreign_key_checks AS fk_checks_after,
       (SELECT COUNT(*) FROM health_measurements) = @b_hm_rows
           AND (SELECT COALESCE(MAX(measurement_id), 0) FROM health_measurements) = @b_hm_max
           AND (SELECT COALESCE(SUM(measurement_id), 0) FROM health_measurements) = @b_hm_sum AS same_hm_ids,
       (SELECT COUNT(*) FROM health_goals) = @b_hg_rows
           AND (SELECT COALESCE(MAX(health_goal_id), 0) FROM health_goals) = @b_hg_max
           AND (SELECT COALESCE(SUM(health_goal_id), 0) FROM health_goals) = @b_hg_sum AS same_hg_ids,
       (SELECT COUNT(*) FROM exercise_recommendations) = @b_er_rows
           AND (SELECT COALESCE(BIT_XOR(CRC32(CONCAT(exercise_recommendation_id, ':', measurement_id))), 0)
                FROM exercise_recommendations) = @b_er_refs AS same_recommendation_refs,
       (SELECT COUNT(*) FROM exercise_recommendations er
        LEFT JOIN health_measurements hm ON hm.measurement_id = er.measurement_id
        WHERE hm.measurement_id IS NULL) = @b_er_orphans AS same_recommendation_orphans;

SELECT table_name, column_name, column_type, is_nullable, column_key, extra
  FROM information_schema.columns
 WHERE table_schema = @db
   AND ((table_name = 'health_measurements' AND column_name = 'measurement_id')
     OR (table_name = 'health_goals' AND column_name = 'health_goal_id'))
 ORDER BY table_name;

-- FK 3개(health_measurements→users, health_goals→users, exercise_recommendations→health_measurements)가 남아 있어야 한다.
SELECT constraint_name, table_name, referenced_table_name
  FROM information_schema.referential_constraints
 WHERE constraint_schema = @db
   AND (referenced_table_name IN ('health_measurements', 'health_goals')
     OR table_name IN ('health_measurements', 'health_goals'))
 ORDER BY constraint_name;
