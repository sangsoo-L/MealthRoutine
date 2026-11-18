-- [기존 DB용] users에 최신 ERD의 토큰·PIN 컬럼 6개를 "없는 것만" 추가한다.
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
--
-- 왜 이렇게 하나: 팀원마다 DB를 만든 SQL이 달라(이전 팀 SQL / 최신 ERD SQL) 컬럼이 이미 있을 수 있다.
-- MySQL 8.4에는 ADD COLUMN IF NOT EXISTS가 없어서, 컬럼마다 information_schema로 존재를 확인한 뒤
-- 없을 때만 ALTER를 실행하고 있으면 'skipped_existing_column'을 출력한다. 여러 번 실행해도 결과가 같다.
-- FK와 관계없는 컬럼 추가이므로 FOREIGN_KEY_CHECKS를 끌 필요가 없다. 기존 데이터는 바뀌지 않는다.
--
-- 실행 방법: 대상 DB(mealthroutine, 테스트용 mealthroutine_test 각각)를 선택한 상태에서 파일 전체 실행.
--   IntelliJ Database 콘솔 / MySQL Workbench: DB 선택 후 붙여 넣고 전체 실행
--   Docker: docker cp database/migration/20261118_users_token_pin_columns.sql mysqldb:/tmp/users_cols.sql
--           docker exec -it mysqldb mysql --default-character-set=utf8mb4 -u root -p mealthroutine
--           접속 후: source /tmp/users_cols.sql
-- 마지막 결과표의 타입·NULL·기본값이 기대값과 다르면 직접 고치지 말고 회원 파트에 공유한다.
--
-- [실행 전 대상 DB 확인] 이 파일은 "지금 선택된 DB"의 users 테이블을 바꾼다. 실행 전에 아래 한 줄만 먼저 실행해
--   SELECT DATABASE() AS current_db,
--          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users') AS users_table;
-- current_db가 바꾸려는 DB(mealthroutine 또는 mealthroutine_test)이고 users_table이 1인지 확인한다.
--   - current_db가 NULL이면 DB가 선택되지 않은 것: USE mealthroutine; 후 다시 확인한다.
--   - 다른 DB(다른 프로젝트 등)가 선택돼 있으면 실행하지 않는다.
--   - 두 DB 모두 바꾸려면 DB마다 USE로 바꾼 뒤 이 확인과 파일 실행을 각각 한다.
-- 파일을 실행해도 맨 처음과 맨 마지막 결과에 대상 DB 이름이 다시 출력된다.

SET @db = DATABASE();
SELECT @db AS target_db,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = @db AND table_name = 'users') AS users_table;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'refresh_token_hash') = 0,
    'ALTER TABLE users ADD COLUMN `refresh_token_hash` VARCHAR(255) NULL COMMENT ''리프레시 토큰 해시(원문 저장 금지)''',
    'SELECT ''refresh_token_hash'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'refresh_token_expires_at') = 0,
    'ALTER TABLE users ADD COLUMN `refresh_token_expires_at` DATETIME NULL COMMENT ''리프레시 토큰 만료일시''',
    'SELECT ''refresh_token_expires_at'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'reset_token_hash') = 0,
    'ALTER TABLE users ADD COLUMN `reset_token_hash` VARCHAR(255) NULL COMMENT ''비밀번호 재설정 토큰 해시(원문 저장 금지)''',
    'SELECT ''reset_token_hash'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'reset_token_expires_at') = 0,
    'ALTER TABLE users ADD COLUMN `reset_token_expires_at` DATETIME NULL COMMENT ''비밀번호 재설정 토큰 만료일시''',
    'SELECT ''reset_token_expires_at'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'pin_failed_count') = 0,
    'ALTER TABLE users ADD COLUMN `pin_failed_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''2차비밀번호 연속 실패 횟수''',
    'SELECT ''pin_failed_count'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = @db AND table_name = 'users' AND column_name = 'pin_locked_until') = 0,
    'ALTER TABLE users ADD COLUMN `pin_locked_until` DATETIME NULL COMMENT ''2차비밀번호 잠금 해제일시''',
    'SELECT ''pin_locked_until'' AS skipped_existing_column');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 결과 확인: 6줄이 나와야 하고, 이미 있던 컬럼의 타입·NULL·기본값이 아래와 다르면 실행한 사람이 공유한다(자동 수정하지 않음).
-- 기대값: refresh_token_hash varchar(255) YES NULL / refresh_token_expires_at datetime YES NULL /
--         reset_token_hash varchar(255) YES NULL / reset_token_expires_at datetime YES NULL /
--         pin_failed_count tinyint unsigned NO 0 / pin_locked_until datetime YES NULL
SELECT @db AS target_db, column_name, column_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = @db AND table_name = 'users'
   AND column_name IN ('refresh_token_hash', 'refresh_token_expires_at', 'reset_token_hash',
                       'reset_token_expires_at', 'pin_failed_count', 'pin_locked_until')
 ORDER BY ordinal_position;
