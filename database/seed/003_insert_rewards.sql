-- 보상 규칙 (정민재)
SET NAMES utf8mb4;
-- 보상은 일일 점수 확정 때 한 번 지급 (지급량은 코드에서 점수로 계산)
INSERT INTO reward_rules (rule_code, rule_description, xp_amount, points_amount, conditions_json)
VALUES ('DAILY_SCORE', '일일 점수 확정 보상 (경험치 = 점수, 포인트 = 점수 ÷ 2)', 0, 0);

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