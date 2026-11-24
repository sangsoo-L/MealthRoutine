-- [기존 DB용] 운동 카탈로그에 기록 방식 컬럼 2개를 추가한다(운동 파트, 운동 카탈로그를 프론트 시드와 맞추기).
-- 새로 만드는 DB는 schema/001_create_tables.sql에 이미 들어 있으므로 실행할 필요가 없다.
--
-- 왜 필요한가: 서버 시작 검사(ddl-auto: validate)가 엔티티의 새 컬럼을 찾지 못하면 서버가 뜨지 않는다.
--
-- 무엇이 바뀌나(추가만 한다. 기존 컬럼·기존 행의 값은 그대로다):
--   exercises
--     default_record_mode   ENUM('time','reps','weight_reps','time_reps','weight_time') NULL   기본 기록 방식(카탈로그 코드)
--     allowed_record_modes  JSON NULL   고를 수 있는 기록 방식 목록. 기존 행은 둘 다 NULL이다.
--
-- 이 파일을 실행한 뒤 seed/001_insert_exercises.sql을 다시 실행해야 운동 105개와 기록 방식이 들어간다.
--
-- 시드는 기존 운동의 참조를 다른 운동으로 바꾸지 않는다. 예전 시드로 들어간 운동(id 1~20)은 같은 id의 새 운동과 이름이 다른데,
--   그중 하나라도 즐겨찾기(preference_exercises)·루틴 항목(exercise_routine_items)·운동 기록(workout_session_exercises)·
--   운동 추천(exercise_recommendations)이 참조하고 있거나, 새 시드에 없는 id의 운동이 있으면 시드는 아무것도 바꾸지 않고
--   "seed_blocked__... doesn't exist" 오류로 멈춘다(바로 위에 막힌 운동 목록이 출력된다).
--   예: 1번 푸시업을 즐겨찾기한 회원이 있으면 막힌다. 덮어쓰면 그 즐겨찾기가 1번 밴드 로우로 보이게 되기 때문이다.
--   참조되지 않는 예전 운동만 있으면 새 운동으로 덮어쓴다(가리키는 데이터가 없어 바뀌는 참조가 없다).
-- 막혔을 때 개발 DB에 지켜야 할 데이터가 없다면 DB를 새로 만든다
--   (docker compose down -v 후 docker compose up -d. 볼륨의 모든 데이터가 지워지고 스키마와 시드가 처음부터 들어간다).
--
-- 여러 번 실행해도 결과가 같다: 이미 있는 컬럼은 건너뛴다(information_schema로 확인).
--
-- 실행 방법: 대상 DB마다(mealthroutine, mealthroutine_test) 각각 실행한다.
--   docker compose로 띄운 DB(맥·윈도우 공통, 한 줄씩. 마지막 줄의 DB 이름만 바꿔 실행, 비밀번호는 .env의 DB_PASSWORD):
--     docker cp database/migration/20261124_exercise_record_mode_columns.sql mealthroutine-mysql-1:/tmp/exercise_record_mode.sql
--     docker exec -it mealthroutine-mysql-1 sh -c "mysql --default-character-set=utf8mb4 -u mealthroutine -p mealthroutine < /tmp/exercise_record_mode.sql"
--   이어서 시드(개발 DB만. 테스트 DB는 테스트가 운동을 직접 넣으므로 필요 없다):
--     docker cp database/seed/001_insert_exercises.sql mealthroutine-mysql-1:/tmp/exercises.sql
--     docker exec -it mealthroutine-mysql-1 sh -c "mysql --default-character-set=utf8mb4 -u mealthroutine -p mealthroutine < /tmp/exercises.sql"
--   (compose는 root 비밀번호를 무작위로 만들므로 mealthroutine 계정을 쓴다. 이 계정은 두 DB에 모든 권한이 있다.
--    컨테이너 이름이 다르면 docker ps로 확인한다.)
--   IntelliJ Database 콘솔 / MySQL Workbench: DB를 선택하고 파일 전체를 한 번에 실행.
--
-- 마지막 결과표의 값이 모두 1이면 적용된 것이다. 0이 있으면 직접 고치지 말고 운동 파트에 공유한다.

SET @db = DATABASE();
SELECT @db AS target_db;

-- 1) exercises.default_record_mode
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'default_record_mode') = 0,
    'ALTER TABLE `exercises` ADD COLUMN `default_record_mode` ENUM(''time'',''reps'',''weight_reps'',''time_reps'',''weight_time'') NULL COMMENT ''기본 기록 방식(카탈로그 코드, 중량+횟수는 weight_reps)'' AFTER `updated_at`',
    'SELECT ''skip: exercises.default_record_mode'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) exercises.allowed_record_modes
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'allowed_record_modes') = 0,
    'ALTER TABLE `exercises` ADD COLUMN `allowed_record_modes` JSON NULL COMMENT ''고를 수 있는 기록 방식 목록(카탈로그 코드 배열)'' AFTER `default_record_mode`',
    'SELECT ''skip: exercises.allowed_record_modes'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 사후 확인: 모두 1이어야 한다.
SELECT
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'default_record_mode'
        AND COLUMN_TYPE = 'enum(''time'',''reps'',''weight_reps'',''time_reps'',''weight_time'')') AS has_default_record_mode,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exercises' AND COLUMN_NAME = 'allowed_record_modes'
        AND DATA_TYPE = 'json') AS has_allowed_record_modes;
