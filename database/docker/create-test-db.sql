-- 자동 테스트 전용 DB. 개발 데이터와 섞이지 않도록 분리한다.
CREATE DATABASE mealthroutine_test;
GRANT ALL ON mealthroutine_test.* TO 'mealthroutine'@'%';
USE mealthroutine_test;
SOURCE /database/schema/001_create_tables.sql;
