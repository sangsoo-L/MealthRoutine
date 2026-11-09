-- erdclould 기준. 운동 테이블 8개만 변경: PK AUTO_INCREMENT, 복합 UNIQUE, updated_at 자동 갱신,
-- workout_session_exercises.exercise_id 추가, 루틴 삭제 시 운동 기록의 연결만 해제(ON DELETE SET NULL).
SET NAMES utf8mb4;

CREATE TABLE `meal_record_items` (
	`meal_item_id`	BIGINT	NOT NULL,
	`meal_record_id`	BIGINT	NOT NULL,
	`food_id`	BIGINT	NULL,
	`food_name_snapshot`	VARCHAR(200)	NOT NULL	COMMENT '음식이름',
	`quantity`	DECIMAL(8,2)	NOT NULL	DEFAULT 1	COMMENT '중량',
	`quantity_unit`	VARCHAR(30)	NULL	COMMENT '식사 단위',
	`calories_kcal`	DECIMAL(9,2)	NULL	COMMENT '칼로리',
	`carbohydrate_g`	DECIMAL(8,2)	NULL	COMMENT '탄수화물',
	`protein_g`	DECIMAL(8,2)	NULL	COMMENT '단백질',
	`fat_g`	DECIMAL(8,2)	NULL	COMMENT '지방',
	`sugar_g`	DECIMAL(8,2)	NULL	COMMENT '당류',
	`salt_g`	DECIMAL(8,2)	NULL	COMMENT '염화나트륨',
	`nutrients_snapshot`	JSON	NULL	COMMENT '영양정보'
);

CREATE TABLE `diet_goals` (
	`diet_goal_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`target_calories_kcal`	DECIMAL(8,2)	NULL	COMMENT '목표칼로리',
	`target_weight_kg`	DECIMAL(5,2)	NULL	COMMENT '목표 몸무게',
	`target_protein_g`	DECIMAL(8,2)	NULL	COMMENT '목표 단백질',
	`target_carbohydrate_g`	DECIMAL(8,2)	NULL	COMMENT '목표 탄수화물',
	`target_fat_g`	DECIMAL(8,2)	NULL	COMMENT '목표 지방',
	`target_sugar_g`	DECIMAL(8,2)	NULL	COMMENT '목표 당분',
	`target_salt_g`	DECIMAL(8,2)	NULL	COMMENT '목표 나트륨 섭취',
	`start_date`	DATE	NOT NULL	COMMENT '시작일',
	`end_date`	DATE	NULL	COMMENT '종료일',
	`status`	ENUM('active','completed','paused','cancelled')	NOT NULL	DEFAULT 'active'	COMMENT '목표 상태',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `exercise_routine_items` (
	`exercise_routine_item_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`exercise_id`	BIGINT	NOT NULL,
	`routine_id`	BIGINT	NOT NULL	COMMENT '운동순서와 묶어서 UNIQUE',
	`sequence_number`	SMALLINT	NOT NULL	COMMENT '루틴 내 운동 순서',
	`target_sets`	SMALLINT	NOT NULL	COMMENT '목표 세트 수',
	`target_reps`	SMALLINT	NULL	COMMENT '목표 반복 횟수',
	`target_duration_seconds`	INT	NULL	COMMENT '목표 운동 시간',
	`rest_seconds`	INT	NULL	COMMENT '세트 간 휴식 시간',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	UNIQUE KEY `UK_ROUTINE_ITEM_SEQUENCE` (`routine_id`, `sequence_number`)
);

CREATE TABLE `user_auth_identities` (
	`auth_identity_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`provider`	ENUM('local','google','kakao','apple','naver','other')	NOT NULL	COMMENT '소셜로그인 플랫폼',
	`provider_email`	VARCHAR(255)	NULL	COMMENT '소셜 이메일',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성시각',
	`provider_user_id`	VARCHAR(255) UNIQUE	NOT NULL	COMMENT '소셜별 고유값(플랫폼과 묶음)'
);

CREATE TABLE `exercise_routines` (
	`routine_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`owner_user_id`	BIGINT	NULL	COMMENT '운동루틴 제작자',
	`routine_name`	VARCHAR(160)	NOT NULL	COMMENT '운동루틴 제목',
	`description`	TEXT	NULL	COMMENT '운동루틴 설명',
	`difficulty`	ENUM('beginner','intermediate','advanced')	NULL	COMMENT '운동 난이도',
	`is_template`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '다른사람 운동루틴 가져오기',
	`visibility`	ENUM('private','shared','public')	NOT NULL	DEFAULT 'private'	COMMENT '루틴 공개 여부',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	ON UPDATE CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `quiz_questions` (
	`quiz_question_id`	BIGINT	NOT NULL,
	`question_text`	TEXT	NOT NULL	COMMENT '퀴즈 질문',
	`explanation`	TEXT	NULL	COMMENT '퀴즈 설명',
	`topic`	VARCHAR(100)	NULL	COMMENT '주제',
	`difficulty`	ENUM('easy','medium','hard')	NOT NULL	DEFAULT 'easy'	COMMENT '난이도',
	`quiz_answer`	ENUM('O','X','A','B','C','D','E')	NOT NULL	COMMENT '시스템 정답',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `workout_session_sets` (
	`workout_session_set_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`workout_session_exercises_id`	BIGINT	NOT NULL	COMMENT '세트와 묶어서 UNIQUE',
	`set_number`	SMALLINT	NOT NULL	COMMENT '몇 세트',
	`reps`	SMALLINT	NULL	COMMENT '몇 회',
	`weight_kg`	DECIMAL(7,2)	NULL	COMMENT '증량 kg',
	`duration_seconds`	INT	NULL	COMMENT '몇 초 했는지',
	`distance_m`	DECIMAL(9,2)	NULL	COMMENT '몇 미터 갔는지(유산소 운동)',
	`rest_seconds`	INT	NULL	COMMENT '쉰 시간',
	UNIQUE KEY `UK_SESSION_SET_NUMBER` (`workout_session_exercises_id`, `set_number`)
);

CREATE TABLE `foods` (
	`food_id`	BIGINT	NOT NULL,
	`source_id`	BIGINT	NULL,
	`name`	VARCHAR(200)	NOT NULL	COMMENT '음식 이름',
	`brand`	VARCHAR(160)	NULL	COMMENT '음식 브랜드',
	`serving_size`	DECIMAL(8,2)	NULL	COMMENT '음식데이터 기준량',
	`serving_unit`	VARCHAR(30)	NULL	COMMENT '기준 단위',
	`calories_kcal`	DECIMAL(8,2)	NULL	COMMENT '칼로리 양',
	`carbohydrate_g`	DECIMAL(8,2)	NULL	COMMENT '탄수화물 양',
	`protein_g`	DECIMAL(8,2)	NULL	COMMENT '단백질 양',
	`fat_g`	DECIMAL(8,2)	NULL	COMMENT '지방 양',
	`sugar_g`	DECIMAL(8,2)	NULL	COMMENT '당분 양',
	`salt_mg`	DECIMAL(8,2)	NULL	COMMENT '소금 양',
	`external_food_id`	VARCHAR(255)	NULL	COMMENT '다른음식/source_id와 UNIQUE 처리',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `users` (
	`user_id`	BIGINT	NOT NULL,
	`email`	VARCHAR(255) UNIQUE	NULL	COMMENT '이메일',
	`username`	VARCHAR(50)	NOT NULL	COMMENT '사용자 실명',
	`password_hash`	VARCHAR(255)	NULL	COMMENT '비밀번호 원문 저장 금지',
	`pin_hash`	VARCHAR(255)	NULL	COMMENT '2차비밀번호',
	`account_status`	ENUM('active', 'suspended', 'pending_deletion', 'deleted')	NOT NULL	DEFAULT 'active'	COMMENT '계정 상태',
	`user_role`	ENUM('user', 'subscribe_user','content_admin', 'privacy_admin', 'super_admin')	NOT NULL	DEFAULT 'user'	COMMENT '계정 권한',
	`is_agreed_term`	BOOLEAN	NOT NULL	COMMENT '약관동의여부',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자',
	`deleted_at`	DATETIME	NULL	COMMENT '삭제일자'
);

CREATE TABLE `diet_recommendation_items` (
	`diet_recommendation_item_id`	BIGINT	NOT NULL,
	`diet_recommendation_id`	BIGINT	NOT NULL,
	`meal_type`	ENUM('breakfast','lunch','dinner','snack','other')	NOT NULL	COMMENT '식사 유형',
	`suggested_foods`	JSON	NULL	COMMENT '추천 음식들',
	`calories_kcal`	DECIMAL(8,2)	NULL	COMMENT '칼로리',
	`carbohydrate_g`	DECIMAL(8,2)	NULL	COMMENT '탄수화물',
	`protein_g`	DECIMAL(8,2)	NULL	COMMENT '단백질',
	`fat_g`	DECIMAL(8,2)	NULL	COMMENT '지방',
	`sugar_g`	DECIMAL(8,2)	NULL	COMMENT '당류',
	`salt_g`	DECIMAL(8,2)	NULL	COMMENT '나트륨',
	`notes`	VARCHAR(1000)	NULL	COMMENT '간단한 메모'
);

CREATE TABLE `diet_recommendation_foods` (
	`diet_recommendation_food_id`	BIGINT	NOT NULL,
	`diet_recommendation_item_id`	BIGINT	NOT NULL,
	`food_id`	BIGINT	NOT NULL,
	`quantity`	DECIMAL(8,2)	NULL	COMMENT '중량',
	`quantity_unit`	VARCHAR(30)	NULL	COMMENT '식사 단위'
);

CREATE TABLE `notification_preferences` (
	`category`	VARCHAR(80)	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`is_enabled`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '활성화 여부',
	`delivery_channel`	ENUM('in_app','email','push','sms','undecided')	NOT NULL	DEFAULT 'in_app'	COMMENT '알림 전달 수단',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '알람 전송 시각'
);

CREATE TABLE `level_rules` (
	`level_rule_id`	BIGINT	NOT NULL,
	`level_number`	INT UNIQUE	NOT NULL	COMMENT '현재 레벨',
	`required_total_xp`	BIGINT	NOT NULL	COMMENT '필요한 경험치량',
	`level_name`	VARCHAR(100)	NULL	COMMENT '레벨 이름',
	`benefits`	JSON	NULL	COMMENT '추가이득'
);

CREATE TABLE `quiz_attempts` (
	`quiz_attempt_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`quiz_question_id`	BIGINT	NOT NULL,
	`user_guess_questions`	ENUM('O','X','A','B','C','D','E')	NULL	COMMENT '사용자 입력 정답',
	`is_correct`	BOOLEAN	NOT NULL	COMMENT '정답 적중 여부',
	`points_awarded`	INT	NOT NULL	DEFAULT 0	COMMENT '포인트 수령 값',
	`attempted_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성 시각'
);

CREATE TABLE `workout_sessions` (
	`workout_session_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`user_id`	BIGINT	NOT NULL,
	`routine_id`	BIGINT	NULL,
	`started_at`	DATETIME	NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '시작 시간',
	`ended_at`	DATETIME	NULL	COMMENT '종료시간',
	`status`	ENUM('standby','in_progress','completed','interrupted','cancelled')	NOT NULL	DEFAULT 'standby'	COMMENT '기록상태',
	`feedback_rating`	TINYINT	NULL	COMMENT '운동 후기 (별점 시스템)',
	`feedback_note`	VARCHAR(1000)	NULL	COMMENT '짧은 후기 메모'
);

CREATE TABLE `community_comments` (
	`comment_id`	BIGINT	NOT NULL,
	`post_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`parent_comment_id`	BIGINT	NULL,
	`content`	TEXT	NOT NULL	COMMENT '내용',
	`visibility`	ENUM('visible','hidden','deleted')	NOT NULL	DEFAULT 'visible'	COMMENT '공개범위',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `preference_meal` (
	`preference_meal_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`food_id`	BIGINT	NOT NULL	COMMENT 'user_id랑 묶어서 UNIQUE처리',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `reward_rules` (
	`reward_rule_id`	BIGINT	NOT NULL,
	`rule_code`	VARCHAR(100) UNIQUE	NOT NULL	COMMENT '룰 넘버링',
	`rule_description`	VARCHAR(500)	NULL	COMMENT '룰 설명',
	`points_amount`	INT	NOT NULL	DEFAULT 0	COMMENT '포인트 수량',
	`xp_amount`	INT	NOT NULL	DEFAULT 0	COMMENT '경험치 수량',
	`conditions_json`	JSON	NULL	COMMENT 'json',
	`is_active`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '중복보상 방지'
);

CREATE TABLE `food_analysis_results` (
	`food_analysis_result_id`	BIGINT	NOT NULL,
	`food_analysis_job_id`	BIGINT	NOT NULL,
	`suggested_food_id`	BIGINT	NULL,
	`candidate_food_name`	VARCHAR(200)	NOT NULL	COMMENT '식별 음식 이름',
	`estimated_quantity`	DECIMAL(8,2)	NULL	COMMENT '추정 중량',
	`confidence_score`	DECIMAL(5,4)	NULL	COMMENT '예측점수',
	`accepted_by_user`	BOOLEAN	NULL	COMMENT '예측 음식 판정',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일시'
);

CREATE TABLE `workout_session_exercises` (
	`workout_session_exercises_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`workout_session_id`	BIGINT	NOT NULL,
	`exercise_id`	BIGINT	NOT NULL	COMMENT '수행한 운동',
	`exercise_routine_item_id`	BIGINT	NULL	COMMENT '루틴에서 시작한 운동만 연결'
);

CREATE TABLE `user_profiles` (
	`user_id`	BIGINT	NOT NULL,
	`display_name`	VARCHAR(80)	NULL	COMMENT '닉네임',
	`birth_date`	DATE	NULL	COMMENT '생일',
	`gender`	ENUM('female','male','other','undisclosed')	NULL	COMMENT '성별',
	`region_code`	VARCHAR(30)	NULL	COMMENT '주소',
	`profile_image_url`	VARCHAR(1000)	NULL	COMMENT '프로필 이미지',
	`exercise_level`	ENUM('beginner','intermediate','advanced','undecided')	NOT NULL	DEFAULT 'undecided'	COMMENT '사용자 분류',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자',
	`phone_number`	VARCHAR(20)	NULL	COMMENT '핸드폰 번호'
);

CREATE TABLE `user_progress` (
	`user_id`	BIGINT	NOT NULL,
	`total_xp`	BIGINT	NOT NULL	COMMENT '토탈경험치 기본값 0주면됨',
	`level`	INT	NOT NULL	COMMENT '레벨 기본값  1'
);

CREATE TABLE `user_health_preferences` (
	`user_id`	BIGINT	NOT NULL,
	`allergies`	JSON	NULL	COMMENT '알러지여부',
	`dietary_preferences`	JSON	NULL	COMMENT '개인적 호불호',
	`health_cautions`	JSON	NULL	COMMENT '건강 유의사항',
	`menstrual_cycle_tracking_enabled`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '생리주기 추적여부',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `community_posts_likes` (
	`community_posts_like_id`	BIGINT	NOT NULL,
	`post_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT  UNIQUE	NOT NULL	COMMENT '게시물,유저 묶어서 UNIQUE설정',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `food_data_sources` (
	`source_id`	BIGINT	NOT NULL,
	`source_name`	VARCHAR(160)	NOT NULL	COMMENT '음식 이름',
	`source_url`	VARCHAR(1000)	NULL	COMMENT '저장 url',
	`terms_note`	VARCHAR(1000)	NULL	COMMENT '음식 세부정보',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일시'
);

CREATE TABLE `preference_exercises` (
	`preference_exercises_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`exercise_id`	BIGINT	NOT NULL	COMMENT 'user_id랑 묶어서 UNIQUE',
	`user_id`	BIGINT	NOT NULL,
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY `UK_PREFERENCE_EXERCISE_USER` (`user_id`, `exercise_id`)
);

CREATE TABLE `user_type_results` (
	`type_result_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`recommended_type`	ENUM('knowledge_limited','practice_constrained','persistence_failure','other')	NOT NULL	COMMENT '추천유형',
	`selected_type`	ENUM('knowledge_limited','practice_constrained','persistence_failure','other')	NULL	COMMENT '선택된 유형',
	`result_detail`	JSON	NULL	COMMENT '결과 세부 설명',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `food_analysis_jobs` (
	`food_analysis_job_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`meal_photo_id`	BIGINT	NULL,
	`status`	ENUM('queued','processing','completed','failed','review_required')	NOT NULL	DEFAULT 'queued'	COMMENT '현재상태',
	`provider`	VARCHAR(100)	NULL	COMMENT '모델명',
	`model_version`	VARCHAR(100)	NULL	COMMENT '모델버전',
	`error_message`	VARCHAR(1000)	NULL	COMMENT '에러메세지',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`completed_at`	DATETIME	NULL	COMMENT '완료일자'
);

CREATE TABLE `health_measurements` (
	`measurement_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`measured_at`	DATETIME	NOT NULL	COMMENT '측정시점',
	`height_cm`	DECIMAL(5,2)	NULL	COMMENT '키',
	`weight_kg`	DECIMAL(5,2)	NULL	COMMENT '몸무게',
	`body_fat_pct`	DECIMAL(5,2)	NULL	COMMENT '체지방률',
	`skeletal_muscle_kg`	DECIMAL(5,2)	NULL	COMMENT '골격근량',
	`bmi`	DECIMAL(5,2)	NULL	COMMENT 'bmi',
	`source`	ENUM('manual','device','estimated','imported')	NOT NULL	DEFAULT 'manual'	COMMENT '측정방법',
	`is_estimated`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '추정값 수치인지 확인',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `notification_events` (
	`notification_event_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`category`	VARCHAR(80)	NOT NULL	COMMENT '카테고리',
	`title`	VARCHAR(200)	NOT NULL	COMMENT '제목',
	`body`	TEXT	NULL	COMMENT '내용',
	`payload`	JSON	NULL	COMMENT '페이로드',
	`scheduled_at`	DATETIME	NULL	COMMENT '예약일자',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `meal_photos` (
	`meal_photo_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`meal_record_id`	BIGINT	NULL,
	`storage_url`	VARCHAR(1000)	NOT NULL	COMMENT 'url',
	`uploaded_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '업로드 시간'
);

CREATE TABLE `exercise_goals` (
	`exercise_goal_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`user_id`	BIGINT	NOT NULL,
	`goal_name`	VARCHAR(160)	NOT NULL	COMMENT '건강관리목표',
	`target_value`	DECIMAL(10,2)	NULL	COMMENT '목표체중',
	`start_date`	DATE	NOT NULL	COMMENT '시작일',
	`end_date`	DATE	NULL	COMMENT '종료일',
	`exercise_min`	SMALLINT	NOT NULL	COMMENT '운동가능시간',
	`status`	ENUM('active','completed','paused','cancelled')	NOT NULL	DEFAULT 'active'	COMMENT '현재상태',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`preference_exercise_equipment`	ENUM('body','dumbbell','band')	NULL	COMMENT '선호 운동 도구'
);

CREATE TABLE `diet_recommendation_feedback` (
	`diet_feedback_id`	BIGINT	NOT NULL,
	`diet_recommendation_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`feedback`	ENUM('accepted','modified','rejected','helpful','not_helpful')	NOT NULL	COMMENT '유저 피드백',
	`comment`	VARCHAR(1000)	NULL	COMMENT '식단 개선사항 안내',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `content_reports` (
	`content_report_id`	BIGINT	NOT NULL,
	`reporter_user_id`	BIGINT	NOT NULL,
	`content_type`	ENUM('post','comment','user','routine','other')	NOT NULL	COMMENT '신고 유형',
	`content_id`	BIGINT	NOT NULL	COMMENT '신고유형 id',
	`reason_code`	VARCHAR(80)	NOT NULL	COMMENT '신고 사유 제목',
	`detail`	VARCHAR(2000)	NULL	COMMENT '신고사유 본문',
	`status`	ENUM('submitted','reviewing','actioned','dismissed')	NOT NULL	DEFAULT 'submitted'	COMMENT '신고현황',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `exercise_recommendations` (
	`exercise_recommendation_id`	BIGINT	NOT NULL,
	`measurement_id`	BIGINT	NOT NULL,
	`exercise_id`	BIGINT	NULL,
	`routine_id`	BIGINT	NULL,
	`exercise_min`	TINYINT	NOT NULL	COMMENT '예상 운동 시간',
	`reason`	TEXT	NULL	COMMENT '추천이유',
	`model_version`	VARCHAR(80)	NULL	COMMENT '모델 버전',
	`feedback`	ENUM('accepted','rejected','completed','not_rated')	NOT NULL	DEFAULT 'not_rated'	COMMENT '운동 사용자 피드백',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `exercises` (
	`exercise_id`	BIGINT	NOT NULL	AUTO_INCREMENT	PRIMARY KEY,
	`name`	VARCHAR(160)	NOT NULL	COMMENT '운동이름',
	`instructions`	TEXT	NULL	COMMENT '운동 소개',
	`difficulty`	ENUM('beginner','intermediate','advanced')	NULL	COMMENT '온동 대분류(난이도)',
	`exercise_type`	VARCHAR(60)	NULL	COMMENT '운동 중분류(운동 부위 분류)',
	`exercise_equipment`	VARCHAR(60)	NULL	COMMENT '운동 소분류(기구여부)',
	`description`	TEXT	NULL	COMMENT '운동 수행 방법',
	`cautions`	TEXT	NULL	COMMENT '운동시 주의사항',
	`source_url`	VARCHAR(1000)	NULL	COMMENT '참고자료URL',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	ON UPDATE CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `audit_logs` (
	`audit_log_id`	BIGINT	NOT NULL,
	`actor_user_id`	BIGINT	NULL,
	`action_type`	VARCHAR(100)	NOT NULL	COMMENT '약관구분',
	`target_type`	VARCHAR(100)	NULL,
	`target_id`	VARCHAR(120)	NULL,
	`ip_address`	VARBINARY(16)	NULL,
	`user_agent`	VARCHAR(500)	NULL,
	`details`	JSON	NULL,
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `meal_records` (
	`meal_record_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`meal_at`	DATETIME	NOT NULL	COMMENT '식사시각',
	`meal_type`	ENUM('breakfast','lunch','dinner','snack','other')	NOT NULL	DEFAULT 'other'	COMMENT '식사유형',
	`total_calories_kcal`	DECIMAL(9,2)	NULL	COMMENT '총 칼로리',
	`total_carbohydrate_g`	DECIMAL(8,2)	NULL	COMMENT '총 탄수화물',
	`total_protein_g`	DECIMAL(8,2)	NULL	COMMENT '총 단백질',
	`total_fat_g`	DECIMAL(8,2)	NULL	COMMENT '총 지방',
	`total_sugar_g`	DECIMAL(8,2)	NULL	COMMENT '총 당 섭취량',
	`total_salt_g`	DECIMAL(8,2)	NULL	COMMENT '총 나트륨 섭취',
	`notes`	VARCHAR(1000)	NULL	COMMENT '오늘의 식사 메모',
	`record_status`	ENUM('draft','confirmed','deleted')	NOT NULL	DEFAULT 'confirmed'	COMMENT '저장상태',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성시간',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정시간'
);

CREATE TABLE `diet_recommendations` (
	`diet_recommendation_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`diet_goal_id`	BIGINT	NULL,
	`recommendation_date`	DATE	NOT NULL	COMMENT '추천날짜',
	`status`	ENUM('generated','accepted','modified','rejected','expired')	NOT NULL	DEFAULT 'generated'	COMMENT '생성상태',
	`summary`	TEXT	NULL	COMMENT '식단 추천 설명',
	`model_version`	VARCHAR(100)	NULL	COMMENT '모델 버전',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일시'
);

CREATE TABLE `point_accounts` (
	`user_id`	BIGINT	NOT NULL,
	`balance`	BIGINT	NOT NULL	DEFAULT 0	COMMENT '포인트 총액',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정 시각'
);

CREATE TABLE `point_transactions` (
	`point_transaction_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`amount`	INT	NOT NULL	COMMENT '총량',
	`transaction_type`	ENUM('earn','spend','expire','adjustment','refund')	NOT NULL	COMMENT '기록',
	`source_type`	VARCHAR(60)	NULL	COMMENT '획득 유형',
	`description`	VARCHAR(500)	NULL	COMMENT '설명',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`point_idempotency_key`	VARCHAR(150) UNIQUE	NOT NULL	COMMENT '포인트 중복 지급 방지 키'
);

CREATE TABLE `community_posts` (
	`post_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`post_type`	ENUM('general','routine','question','notice')	NOT NULL	DEFAULT 'general'	COMMENT '게시물 유형',
	`title`	VARCHAR(250)	NOT NULL	COMMENT '제목',
	`content`	MEDIUMTEXT	NOT NULL	COMMENT '내용',
	`visibility`	ENUM('visible','hidden','deleted')	NOT NULL	DEFAULT 'visible'	COMMENT '공개범위',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일자'
);

CREATE TABLE `report_actions` (
	`report_action_id`	BIGINT	NOT NULL,
	`content_report_id`	BIGINT	NOT NULL,
	`admin_user_id`	BIGINT	NOT NULL,
	`action_type`	VARCHAR(80)	NOT NULL	COMMENT '신고 결과',
	`action_note`	VARCHAR(2000)	NULL	COMMENT '신고 세부 처리결과',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자'
);

CREATE TABLE `experience_transactions` (
	`experience_transaction_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`xp_amount`	INT	NOT NULL	COMMENT '경험치 값',
	`source_type`	VARCHAR(60)	NOT NULL	COMMENT '생성 유형',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일자',
	`exp_idempotency_key`	VARCHAR(150) UNIQUE	NOT NULL	COMMENT '경험치 중복 지급 방지 키'
);

CREATE TABLE `health_goals` (
	`health_goal_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`goal_type`	ENUM('weight','fitness','health','habit','other')	NOT NULL	COMMENT '목표 유형',
	`target_value`	DECIMAL(8,2)	NULL	COMMENT '목표량',
	`target_unit`	VARCHAR(30)	NULL	COMMENT '목표부위(지방,근육)',
	`goal_description`	VARCHAR(500)	NULL	COMMENT '목표 설명',
	`start_date`	DATE	NOT NULL	COMMENT '시작일',
	`target_date`	DATE	NULL	COMMENT '지정 종료일',
	`status`	ENUM('active','completed','paused','cancelled')	NOT NULL	DEFAULT 'active'	COMMENT '상태',
	`created_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일시',
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일시'
);

ALTER TABLE `meal_record_items` ADD CONSTRAINT `PK_MEAL_RECORD_ITEMS` PRIMARY KEY (
	`meal_item_id`
);

ALTER TABLE `diet_goals` ADD CONSTRAINT `PK_DIET_GOALS` PRIMARY KEY (
	`diet_goal_id`
);

ALTER TABLE `user_auth_identities` ADD CONSTRAINT `PK_USER_AUTH_IDENTITIES` PRIMARY KEY (
	`auth_identity_id`
);

ALTER TABLE `quiz_questions` ADD CONSTRAINT `PK_QUIZ_QUESTIONS` PRIMARY KEY (
	`quiz_question_id`
);

ALTER TABLE `foods` ADD CONSTRAINT `PK_FOODS` PRIMARY KEY (
	`food_id`
);

ALTER TABLE `users` ADD CONSTRAINT `PK_USERS` PRIMARY KEY (
	`user_id`
);

ALTER TABLE `diet_recommendation_items` ADD CONSTRAINT `PK_DIET_RECOMMENDATION_ITEMS` PRIMARY KEY (
	`diet_recommendation_item_id`
);

ALTER TABLE `diet_recommendation_foods` ADD CONSTRAINT `PK_DIET_RECOMMENDATION_FOODS` PRIMARY KEY (
	`diet_recommendation_food_id`
);

ALTER TABLE `notification_preferences` ADD CONSTRAINT `PK_NOTIFICATION_PREFERENCES` PRIMARY KEY (
	`category`,
	`user_id`
);

ALTER TABLE `level_rules` ADD CONSTRAINT `PK_LEVEL_RULES` PRIMARY KEY (
	`level_rule_id`
);

ALTER TABLE `quiz_attempts` ADD CONSTRAINT `PK_QUIZ_ATTEMPTS` PRIMARY KEY (
	`quiz_attempt_id`
);

ALTER TABLE `community_comments` ADD CONSTRAINT `PK_COMMUNITY_COMMENTS` PRIMARY KEY (
	`comment_id`
);

ALTER TABLE `preference_meal` ADD CONSTRAINT `PK_PREFERENCE_MEAL` PRIMARY KEY (
	`preference_meal_id`
);

ALTER TABLE `reward_rules` ADD CONSTRAINT `PK_REWARD_RULES` PRIMARY KEY (
	`reward_rule_id`
);

ALTER TABLE `food_analysis_results` ADD CONSTRAINT `PK_FOOD_ANALYSIS_RESULTS` PRIMARY KEY (
	`food_analysis_result_id`
);

ALTER TABLE `user_profiles` ADD CONSTRAINT `PK_USER_PROFILES` PRIMARY KEY (
	`user_id`
);

ALTER TABLE `user_progress` ADD CONSTRAINT `PK_USER_PROGRESS` PRIMARY KEY (
	`user_id`
);

ALTER TABLE `user_health_preferences` ADD CONSTRAINT `PK_USER_HEALTH_PREFERENCES` PRIMARY KEY (
	`user_id`
);

ALTER TABLE `community_posts_likes` ADD CONSTRAINT `PK_COMMUNITY_POSTS_LIKES` PRIMARY KEY (
	`community_posts_like_id`
);

ALTER TABLE `food_data_sources` ADD CONSTRAINT `PK_FOOD_DATA_SOURCES` PRIMARY KEY (
	`source_id`
);

ALTER TABLE `user_type_results` ADD CONSTRAINT `PK_USER_TYPE_RESULTS` PRIMARY KEY (
	`type_result_id`
);

ALTER TABLE `food_analysis_jobs` ADD CONSTRAINT `PK_FOOD_ANALYSIS_JOBS` PRIMARY KEY (
	`food_analysis_job_id`
);

ALTER TABLE `health_measurements` ADD CONSTRAINT `PK_HEALTH_MEASUREMENTS` PRIMARY KEY (
	`measurement_id`
);

ALTER TABLE `notification_events` ADD CONSTRAINT `PK_NOTIFICATION_EVENTS` PRIMARY KEY (
	`notification_event_id`
);

ALTER TABLE `meal_photos` ADD CONSTRAINT `PK_MEAL_PHOTOS` PRIMARY KEY (
	`meal_photo_id`
);

ALTER TABLE `diet_recommendation_feedback` ADD CONSTRAINT `PK_DIET_RECOMMENDATION_FEEDBACK` PRIMARY KEY (
	`diet_feedback_id`
);

ALTER TABLE `content_reports` ADD CONSTRAINT `PK_CONTENT_REPORTS` PRIMARY KEY (
	`content_report_id`
);

ALTER TABLE `exercise_recommendations` ADD CONSTRAINT `PK_EXERCISE_RECOMMENDATIONS` PRIMARY KEY (
	`exercise_recommendation_id`
);

ALTER TABLE `audit_logs` ADD CONSTRAINT `PK_AUDIT_LOGS` PRIMARY KEY (
	`audit_log_id`
);

ALTER TABLE `meal_records` ADD CONSTRAINT `PK_MEAL_RECORDS` PRIMARY KEY (
	`meal_record_id`
);

ALTER TABLE `diet_recommendations` ADD CONSTRAINT `PK_DIET_RECOMMENDATIONS` PRIMARY KEY (
	`diet_recommendation_id`
);

ALTER TABLE `point_accounts` ADD CONSTRAINT `PK_POINT_ACCOUNTS` PRIMARY KEY (
	`user_id`
);

ALTER TABLE `point_transactions` ADD CONSTRAINT `PK_POINT_TRANSACTIONS` PRIMARY KEY (
	`point_transaction_id`
);

ALTER TABLE `community_posts` ADD CONSTRAINT `PK_COMMUNITY_POSTS` PRIMARY KEY (
	`post_id`
);

ALTER TABLE `report_actions` ADD CONSTRAINT `PK_REPORT_ACTIONS` PRIMARY KEY (
	`report_action_id`
);

ALTER TABLE `experience_transactions` ADD CONSTRAINT `PK_EXPERIENCE_TRANSACTIONS` PRIMARY KEY (
	`experience_transaction_id`
);

ALTER TABLE `health_goals` ADD CONSTRAINT `PK_HEALTH_GOALS` PRIMARY KEY (
	`health_goal_id`
);

ALTER TABLE `meal_record_items` ADD CONSTRAINT `FK_meal_records_TO_meal_record_items_1` FOREIGN KEY (
	`meal_record_id`
)
REFERENCES `meal_records` (
	`meal_record_id`
);

ALTER TABLE `meal_record_items` ADD CONSTRAINT `FK_foods_TO_meal_record_items_1` FOREIGN KEY (
	`food_id`
)
REFERENCES `foods` (
	`food_id`
);

ALTER TABLE `diet_goals` ADD CONSTRAINT `FK_users_TO_diet_goals_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `exercise_routine_items` ADD CONSTRAINT `FK_exercises_TO_exercise_routine_items_1` FOREIGN KEY (
	`exercise_id`
)
REFERENCES `exercises` (
	`exercise_id`
);

ALTER TABLE `exercise_routine_items` ADD CONSTRAINT `FK_exercise_routines_TO_exercise_routine_items_1` FOREIGN KEY (
	`routine_id`
)
REFERENCES `exercise_routines` (
	`routine_id`
);

ALTER TABLE `user_auth_identities` ADD CONSTRAINT `FK_users_TO_user_auth_identities_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `exercise_routines` ADD CONSTRAINT `FK_users_TO_exercise_routines_1` FOREIGN KEY (
	`owner_user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `workout_session_sets` ADD CONSTRAINT `FK_workout_session_exercises_TO_workout_session_sets_1` FOREIGN KEY (
	`workout_session_exercises_id`
)
REFERENCES `workout_session_exercises` (
	`workout_session_exercises_id`
);

ALTER TABLE `foods` ADD CONSTRAINT `FK_food_data_sources_TO_foods_1` FOREIGN KEY (
	`source_id`
)
REFERENCES `food_data_sources` (
	`source_id`
);

ALTER TABLE `diet_recommendation_items` ADD CONSTRAINT `FK_diet_recommendations_TO_diet_recommendation_items_1` FOREIGN KEY (
	`diet_recommendation_id`
)
REFERENCES `diet_recommendations` (
	`diet_recommendation_id`
);

ALTER TABLE `diet_recommendation_foods` ADD CONSTRAINT `FK_diet_recommendation_items_TO_diet_recommendation_foods_1` FOREIGN KEY (
	`diet_recommendation_item_id`
)
REFERENCES `diet_recommendation_items` (
	`diet_recommendation_item_id`
);

ALTER TABLE `diet_recommendation_foods` ADD CONSTRAINT `FK_foods_TO_diet_recommendation_foods_1` FOREIGN KEY (
	`food_id`
)
REFERENCES `foods` (
	`food_id`
);

ALTER TABLE `notification_preferences` ADD CONSTRAINT `FK_users_TO_notification_preferences_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `quiz_attempts` ADD CONSTRAINT `FK_users_TO_quiz_attempts_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `quiz_attempts` ADD CONSTRAINT `FK_quiz_questions_TO_quiz_attempts_1` FOREIGN KEY (
	`quiz_question_id`
)
REFERENCES `quiz_questions` (
	`quiz_question_id`
);

ALTER TABLE `workout_sessions` ADD CONSTRAINT `FK_users_TO_workout_sessions_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `workout_sessions` ADD CONSTRAINT `FK_exercise_routines_TO_workout_sessions_1` FOREIGN KEY (
	`routine_id`
)
REFERENCES `exercise_routines` (
	`routine_id`
) ON DELETE SET NULL;

ALTER TABLE `community_comments` ADD CONSTRAINT `FK_community_posts_TO_community_comments_1` FOREIGN KEY (
	`post_id`
)
REFERENCES `community_posts` (
	`post_id`
);

ALTER TABLE `community_comments` ADD CONSTRAINT `FK_users_TO_community_comments_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `community_comments` ADD CONSTRAINT `FK_community_comments_TO_community_comments_1` FOREIGN KEY (
	`parent_comment_id`
)
REFERENCES `community_comments` (
	`comment_id`
);

ALTER TABLE `preference_meal` ADD CONSTRAINT `FK_users_TO_preference_meal_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `preference_meal` ADD CONSTRAINT `FK_foods_TO_preference_meal_1` FOREIGN KEY (
	`food_id`
)
REFERENCES `foods` (
	`food_id`
);

ALTER TABLE `food_analysis_results` ADD CONSTRAINT `FK_food_analysis_jobs_TO_food_analysis_results_1` FOREIGN KEY (
	`food_analysis_job_id`
)
REFERENCES `food_analysis_jobs` (
	`food_analysis_job_id`
);

ALTER TABLE `food_analysis_results` ADD CONSTRAINT `FK_foods_TO_food_analysis_results_1` FOREIGN KEY (
	`suggested_food_id`
)
REFERENCES `foods` (
	`food_id`
);

ALTER TABLE `workout_session_exercises` ADD CONSTRAINT `FK_workout_sessions_TO_workout_session_exercises_1` FOREIGN KEY (
	`workout_session_id`
)
REFERENCES `workout_sessions` (
	`workout_session_id`
);

ALTER TABLE `workout_session_exercises` ADD CONSTRAINT `FK_exercise_routine_items_TO_workout_session_exercises_1` FOREIGN KEY (
	`exercise_routine_item_id`
)
REFERENCES `exercise_routine_items` (
	`exercise_routine_item_id`
) ON DELETE SET NULL;

ALTER TABLE `workout_session_exercises` ADD CONSTRAINT `FK_exercises_TO_workout_session_exercises_1` FOREIGN KEY (
	`exercise_id`
)
REFERENCES `exercises` (
	`exercise_id`
);

ALTER TABLE `user_profiles` ADD CONSTRAINT `FK_users_TO_user_profiles_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `user_progress` ADD CONSTRAINT `FK_users_TO_user_progress_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `user_health_preferences` ADD CONSTRAINT `FK_users_TO_user_health_preferences_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `community_posts_likes` ADD CONSTRAINT `FK_community_posts_TO_community_posts_likes_1` FOREIGN KEY (
	`post_id`
)
REFERENCES `community_posts` (
	`post_id`
);

ALTER TABLE `community_posts_likes` ADD CONSTRAINT `FK_users_TO_community_posts_likes_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `preference_exercises` ADD CONSTRAINT `FK_exercises_TO_preference_exercises_1` FOREIGN KEY (
	`exercise_id`
)
REFERENCES `exercises` (
	`exercise_id`
);

ALTER TABLE `preference_exercises` ADD CONSTRAINT `FK_users_TO_preference_exercises_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `user_type_results` ADD CONSTRAINT `FK_users_TO_user_type_results_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `food_analysis_jobs` ADD CONSTRAINT `FK_users_TO_food_analysis_jobs_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `food_analysis_jobs` ADD CONSTRAINT `FK_meal_photos_TO_food_analysis_jobs_1` FOREIGN KEY (
	`meal_photo_id`
)
REFERENCES `meal_photos` (
	`meal_photo_id`
);

ALTER TABLE `health_measurements` ADD CONSTRAINT `FK_users_TO_health_measurements_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `notification_events` ADD CONSTRAINT `FK_users_TO_notification_events_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `meal_photos` ADD CONSTRAINT `FK_users_TO_meal_photos_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `meal_photos` ADD CONSTRAINT `FK_meal_records_TO_meal_photos_1` FOREIGN KEY (
	`meal_record_id`
)
REFERENCES `meal_records` (
	`meal_record_id`
);

ALTER TABLE `exercise_goals` ADD CONSTRAINT `FK_users_TO_exercise_goals_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `diet_recommendation_feedback` ADD CONSTRAINT `FK_diet_recommendations_TO_diet_recommendation_feedback_1` FOREIGN KEY (
	`diet_recommendation_id`
)
REFERENCES `diet_recommendations` (
	`diet_recommendation_id`
);

ALTER TABLE `diet_recommendation_feedback` ADD CONSTRAINT `FK_users_TO_diet_recommendation_feedback_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `content_reports` ADD CONSTRAINT `FK_users_TO_content_reports_1` FOREIGN KEY (
	`reporter_user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `exercise_recommendations` ADD CONSTRAINT `FK_health_measurements_TO_exercise_recommendations_1` FOREIGN KEY (
	`measurement_id`
)
REFERENCES `health_measurements` (
	`measurement_id`
);

ALTER TABLE `exercise_recommendations` ADD CONSTRAINT `FK_exercises_TO_exercise_recommendations_1` FOREIGN KEY (
	`exercise_id`
)
REFERENCES `exercises` (
	`exercise_id`
);

ALTER TABLE `exercise_recommendations` ADD CONSTRAINT `FK_exercise_routines_TO_exercise_recommendations_1` FOREIGN KEY (
	`routine_id`
)
REFERENCES `exercise_routines` (
	`routine_id`
);

ALTER TABLE `audit_logs` ADD CONSTRAINT `FK_users_TO_audit_logs_1` FOREIGN KEY (
	`actor_user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `meal_records` ADD CONSTRAINT `FK_users_TO_meal_records_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `diet_recommendations` ADD CONSTRAINT `FK_users_TO_diet_recommendations_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `diet_recommendations` ADD CONSTRAINT `FK_diet_goals_TO_diet_recommendations_1` FOREIGN KEY (
	`diet_goal_id`
)
REFERENCES `diet_goals` (
	`diet_goal_id`
);

ALTER TABLE `point_accounts` ADD CONSTRAINT `FK_users_TO_point_accounts_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `point_transactions` ADD CONSTRAINT `FK_users_TO_point_transactions_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `community_posts` ADD CONSTRAINT `FK_users_TO_community_posts_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `report_actions` ADD CONSTRAINT `FK_content_reports_TO_report_actions_1` FOREIGN KEY (
	`content_report_id`
)
REFERENCES `content_reports` (
	`content_report_id`
);

ALTER TABLE `report_actions` ADD CONSTRAINT `FK_users_TO_report_actions_1` FOREIGN KEY (
	`admin_user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `experience_transactions` ADD CONSTRAINT `FK_users_TO_experience_transactions_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);

ALTER TABLE `health_goals` ADD CONSTRAINT `FK_users_TO_health_goals_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`user_id`
);
