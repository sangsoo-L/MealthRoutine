-- [기존 DB용] 운동 루틴에 프론트 저장 모델용 컬럼 4개와 UNIQUE 키 1개를 추가한다(운동 파트, 루틴 계약 맞추기).
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
--
-- 왜 필요한가: 서버 시작 검사(ddl-auto: validate)가 엔티티의 새 컬럼을 찾지 못하면 서버가 뜨지 않는다.
--
-- 무엇이 바뀌나(모두 추가만 한다. 기존 컬럼·기존 행의 값은 그대로다):
--   exercise_routines
--     revision    INT NOT NULL DEFAULT 1   수정할 때마다 1 증가(동시 수정 감지). 기존 행은 1이 된다.
--     request_id  VARCHAR(100) NULL        생성 요청 식별자(같은 저장 요청을 다시 보내도 루틴이 하나만 생김). 기존 행은 NULL.
--                                          utf8mb4_bin이라 대소문자를 구분한다(RT-1과 rt-1은 다른 키, 프론트와 같은 규칙).
--     UNIQUE KEY UK_ROUTINE_OWNER_REQUEST (owner_user_id, request_id)
--       NULL은 서로 겹쳐도 되므로 기존 루틴(request_id NULL)은 영향이 없다.
--   exercise_routine_items
--     record_type ENUM('reps','weight','time','time_reps','weight_time') NULL   운동별 기록 방식
--     set_targets JSON NULL                세트별 목표 [{reps, weightKg, targetSeconds}]. 기존 행은 NULL(예전 방식 항목).
--
-- 여러 번 실행해도 결과가 같다: 이미 있는 컬럼·키는 건너뛴다(information_schema로 확인).
--
-- 실행 방법: 대상 DB마다(mealthroutine, mealthroutine_test) 각각 실행한다.
--   Docker(맥·윈도우 공통, 한 줄씩. 마지막 줄의 DB 이름만 바꿔 실행, 비밀번호는 입력 요청 때 입력):
--     docker cp database/migration/20261124_routine_contract_columns.sql mysqldb:/tmp/routine_contract.sql
--     docker exec -it mysqldb sh -c "mysql --default-character-set=utf8mb4 -u root -p mealthroutine < /tmp/routine_contract.sql"
--   (컨테이너 이름은 docker ps로 확인한다. docker compose로 띄웠다면 mealthroutine-mysql-1 등일 수 있다.)
--   IntelliJ Database 콘솔 / MySQL Workbench: DB를 선택하고 파일 전체를 한 번에 실행.
--
-- 마지막 결과표의 값이 모두 1이면 적용된 것이다. 0이 있으면 직접 고치지 말고 운동 파트에 공유한다.

SET @db = DATABASE();
SELECT @db AS target_db;

-- 1) exercise_routines.revision
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND COLUMN_NAME = 'revision') = 0,
    'ALTER TABLE `exercise_routines` ADD COLUMN `revision` INT NOT NULL DEFAULT 1 COMMENT ''수정할 때마다 1 증가(동시 수정 감지)'' AFTER `visibility`',
    'SELECT ''skip: exercise_routines.revision'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) exercise_routines.request_id
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND COLUMN_NAME = 'request_id') = 0,
    'ALTER TABLE `exercise_routines` ADD COLUMN `request_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT ''생성 요청 식별자(중복 저장 방지, 대소문자 구분)'' AFTER `revision`',
    'SELECT ''skip: exercise_routines.request_id'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2-1) request_id가 대소문자를 구분하게 한다(utf8mb4_bin). 이 파일의 이전 버전으로 이미 컬럼을 만든 DB도 여기서 바뀐다.
--      기본 정렬(utf8mb4_0900_ai_ci)이면 RT-1과 rt-1이 같은 키가 되는데, 프론트는 둘을 다른 요청으로 본다.
--      이전 버전으로 만든 컬럼에 대소문자만 다른 값이 이미 있으면 UNIQUE 때문에 들어갈 수 없었으므로, 바꿔도 충돌하지 않는다.
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND COLUMN_NAME = 'request_id'
        AND COLLATION_NAME <> 'utf8mb4_bin') = 1,
    'ALTER TABLE `exercise_routines` MODIFY COLUMN `request_id` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT ''생성 요청 식별자(중복 저장 방지, 대소문자 구분)''',
    'SELECT ''skip: exercise_routines.request_id collation'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) UNIQUE (owner_user_id, request_id)
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND INDEX_NAME = 'UK_ROUTINE_OWNER_REQUEST') = 0,
    'ALTER TABLE `exercise_routines` ADD UNIQUE KEY `UK_ROUTINE_OWNER_REQUEST` (`owner_user_id`, `request_id`)',
    'SELECT ''skip: UK_ROUTINE_OWNER_REQUEST'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) exercise_routine_items.record_type
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routine_items' AND COLUMN_NAME = 'record_type') = 0,
    'ALTER TABLE `exercise_routine_items` ADD COLUMN `record_type` ENUM(''reps'',''weight'',''time'',''time_reps'',''weight_time'') NULL COMMENT ''기록 방식(set_targets와 함께 있거나 함께 없음)'' AFTER `rest_seconds`',
    'SELECT ''skip: exercise_routine_items.record_type'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) exercise_routine_items.set_targets
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routine_items' AND COLUMN_NAME = 'set_targets') = 0,
    'ALTER TABLE `exercise_routine_items` ADD COLUMN `set_targets` JSON NULL COMMENT ''세트별 목표 [{reps,weightKg,targetSeconds}]'' AFTER `record_type`',
    'SELECT ''skip: exercise_routine_items.set_targets'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 사후 확인: 모두 1이어야 한다.
SELECT
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND COLUMN_NAME = 'revision'
        AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '1') AS has_revision,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND COLUMN_NAME = 'request_id'
        AND COLLATION_NAME = 'utf8mb4_bin') AS has_case_sensitive_request_id,
    (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routines' AND INDEX_NAME = 'UK_ROUTINE_OWNER_REQUEST'
        AND NON_UNIQUE = 0) AS has_unique_key,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routine_items' AND COLUMN_NAME = 'record_type') AS has_record_type,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercise_routine_items' AND COLUMN_NAME = 'set_targets'
        AND DATA_TYPE = 'json') AS has_set_targets;
