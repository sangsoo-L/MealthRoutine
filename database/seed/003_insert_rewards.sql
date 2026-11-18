-- 보상 규칙 (정민재)
SET NAMES utf8mb4;
INSERT INTO reward_rules (rule_code, rule_description, xp_amount, points_amount, conditions_json)
VALUES ('MEAL_RECORDED', '식단 기록', 10, 5, '{"dailyLimit": 3}'),      -- 하루 3번까지만 지급
       ('WORKOUT_COMPLETED', '운동 완료', 30, 10, '{"dailyLimit": 1}'), -- 하루 1번
       ('QUIZ_CORRECT', '오늘의 퀴즈 정답', 20, 10, '{"dailyLimit": 1}'),
       ('QUIZ_ATTEMPT', '오늘의 퀴즈 참여', 5, 0, '{"dailyLimit": 1}');
-- 틀려도 참여 보상

-- 레벨 기준: 이 경험치 이상이면 해당 레벨
INSERT INTO level_rules (level_number, required_total_xp, level_name)
VALUES (1, 0, '입문'),
       (2, 100, '초보'),
       (3, 300, '초보'),
       (4, 600, '중급'),
       (5, 1000, '중급'),
       (6, 1500, '숙련'),
       (7, 2100, '숙련'),
       (8, 2800, '고수'),
       (9, 3600, '고수'),
       (10, 4500, '마스터');