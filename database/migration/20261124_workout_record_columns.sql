-- [기존 DB용] 운동 기록에 완료 기록 업로드용 컬럼 3개와 UNIQUE 키 1개를 추가한다(운동 파트, 완료 기록 저장).
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
-- 20261124_routine_contract_columns.sql과 따로 실행한다(순서는 상관없다).
--
-- 왜 필요한가: 서버 시작 검사(ddl-auto: validate)가 엔티티의 새 컬럼을 찾지 못하면 서버가 뜨지 않는다.
--
-- 무엇이 바뀌나(모두 추가만 한다. 기존 컬럼·기존 행의 값은 그대로다):
--   workout_sessions
--     request_id  VARCHAR(100) NULL   완료 기록 업로드 요청 식별자(같은 기록을 다시 보내도 하나만 저장). 기존 행은 NULL.
--                                     utf8mb4_bin이라 대소문자를 구분한다(프론트와 같은 규칙).
--     UNIQUE KEY UK_SESSION_USER_REQUEST (user_id, request_id)
--       NULL은 서로 겹쳐도 되므로 기존 기록(request_id NULL)은 영향이 없다.
--   workout_session_exercises
--     record_type ENUM('reps','weight','time','time_reps','weight_time') NULL   수행한 운동의 기록 방식
--     set_targets JSON NULL           수행 당시 세트별 목표 스냅샷. 기존 행은 NULL.
--
-- 여러 번 실행해도 결과가 같다: 이미 있는 컬럼·키는 건너뛴다(information_schema로 확인).
--
-- 실행 방법: 대상 DB마다(mealthroutine, mealthroutine_test) 각각 실행한다.
--   Docker(맥·윈도우 공통, 한 줄씩. 마지막 줄의 DB 이름만 바꿔 실행, 비밀번호는 입력 요청 때 입력):
--     docker cp database/migration/20261124_workout_record_columns.sql mysqldb:/tmp/workout_record.sql
--     docker exec -it mysqldb sh -c "mysql --default-character-set=utf8mb4 -u root -p mealthroutine < /tmp/workout_record.sql"
--   (컨테이너 이름은 docker ps로 확인한다. docker compose로 띄웠다면 mealthroutine-mysql-1 등일 수 있다.)
--   IntelliJ Database 콘솔 / MySQL Workbench: DB를 선택하고 파일 전체를 한 번에 실행.
--
-- 마지막 결과표의 값이 모두 1이면 적용된 것이다. 0이 있으면 직접 고치지 말고 운동 파트에 공유한다.

SET @db = DATABASE();
SELECT @db AS target_db;

-- 1) workout_sessions.request_id
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_sessions' AND COLUMN_NAME = 'request_id') = 0,
    'ALTER TABLE `workout_sessions` ADD COLUMN `request_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT ''완료 기록 업로드 요청 식별자(중복 저장 방지, 대소문자 구분)'' AFTER `feedback_note`',
    'SELECT ''skip: workout_sessions.request_id'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1-1) request_id가 대소문자를 구분하게 한다(utf8mb4_bin). 이 파일의 이전 버전으로 이미 컬럼을 만든 DB도 여기서 바뀐다.
--      기본 정렬(utf8mb4_0900_ai_ci)이면 REC-1과 rec-1이 같은 키가 되는데, 프론트는 둘을 다른 요청으로 본다.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_sessions' AND COLUMN_NAME = 'request_id'
        AND COLLATION_NAME <> 'utf8mb4_bin') = 1,
    'ALTER TABLE `workout_sessions` MODIFY COLUMN `request_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT ''완료 기록 업로드 요청 식별자(중복 저장 방지, 대소문자 구분)''',
    'SELECT ''skip: workout_sessions.request_id collation'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) UNIQUE (user_id, request_id)
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_sessions' AND INDEX_NAME = 'UK_SESSION_USER_REQUEST') = 0,
    'ALTER TABLE `workout_sessions` ADD UNIQUE KEY `UK_SESSION_USER_REQUEST` (`user_id`, `request_id`)',
    'SELECT ''skip: UK_SESSION_USER_REQUEST'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) workout_session_exercises.record_type
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_session_exercises' AND COLUMN_NAME = 'record_type') = 0,
    'ALTER TABLE `workout_session_exercises` ADD COLUMN `record_type` ENUM(''reps'',''weight'',''time'',''time_reps'',''weight_time'') NULL COMMENT ''기록 방식(set_targets와 함께 있거나 함께 없음)'' AFTER `exercise_routine_item_id`',
    'SELECT ''skip: workout_session_exercises.record_type'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) workout_session_exercises.set_targets
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_session_exercises' AND COLUMN_NAME = 'set_targets') = 0,
    'ALTER TABLE `workout_session_exercises` ADD COLUMN `set_targets` JSON NULL COMMENT ''수행 당시 세트별 목표 스냅샷 [{reps,weightKg,targetSeconds}]'' AFTER `record_type`',
    'SELECT ''skip: workout_session_exercises.set_targets'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 사후 확인: 모두 1이어야 한다.
SELECT
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_sessions' AND COLUMN_NAME = 'request_id'
        AND COLLATION_NAME = 'utf8mb4_bin') AS has_case_sensitive_request_id,
    (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_sessions' AND INDEX_NAME = 'UK_SESSION_USER_REQUEST'
        AND NON_UNIQUE = 0) AS has_unique_key,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_session_exercises' AND COLUMN_NAME = 'record_type') AS has_record_type,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'workout_session_exercises' AND COLUMN_NAME = 'set_targets'
        AND DATA_TYPE = 'json') AS has_set_targets;
