-- 개발용 테스트 사용자. 로그인이 개발되기 전 X-User-Id: 1 로 사용한다. 운영 DB에는 넣지 않는다.
SET NAMES utf8mb4;

INSERT INTO users (user_id, username, is_agreed_term) VALUES (1, '테스트사용자', TRUE);
