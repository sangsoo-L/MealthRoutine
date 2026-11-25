# 운영 배포 안내 (RUNBOOK)

밀스루틴 운영 서버를 만들고, 배포하고, 문제가 생겼을 때 되돌리는 방법이다.
비밀값(DB 비밀번호, JWT 키, SSH 개인키)은 **이 저장소·채팅·커밋 메시지에 절대 적지 않는다.**

## 구성

```
브라우저 ──HTTPS──▶ EC2 1대 (Docker Compose, /opt/mealthroutine)
                    ├─ caddy   : 80/443, Let's Encrypt 인증서 자동 발급·갱신, 화면(dist) 제공, /api/* → backend
                    ├─ backend : eclipse-temurin:21-jre 로 releases/current/app.jar 실행 (외부 비공개)
                    └─ mysql   : mysql:8.4, 데이터는 볼륨에 저장 (외부 비공개)
```

- 화면과 API를 **같은 주소**에서 제공한다. 프론트는 같은 출처의 `/api`를 부르고, refresh 쿠키는 `Secure`라서 HTTPS가 필요하다.
- 외부에 여는 포트는 22(SSH, 키 로그인만)·80·443뿐이다. 3306·8080은 열지 않는다.
- 사진 분석과 식단 추천은 로그인한 사용자가 Spring의 `/api/v1/ai/`에 요청한다. AI 컨테이너의 포트는 호스트에 게시하지 않는다.
- 운영에서 AI를 연결할 때 Spring의 `AI_BASE_URL`에 `http://ai-server:8000`을 지정하고, Spring과 FastAPI의 `AI_INTERNAL_KEY`에 같은 내부 비밀값을 설정한다. FastAPI의 헬스체크는 `GET /health`를 사용한다.
- 먼저 내부 키를 사용하는 AI 이미지를 준비하고, Spring 컨테이너를 새 환경으로 재생성한 뒤 앱 릴리스를 반영한다. 로그인 없이 요청하면 401, 올바른 내부 키 없이 FastAPI에 요청하면 403인지 각각 확인한다.

| 파일 | 서버 위치 | 설명 |
|---|---|---|
| `compose.yml` | `/opt/mealthroutine/compose.yml` | 세 서비스 정의. 비밀값은 `.env`에서 읽는다 |
| `Caddyfile` | `/opt/mealthroutine/Caddyfile` | HTTPS, `/api` 전달, 화면 경로(SPA), 캐시 |
| `.env.example` | (예시) → 서버 `/opt/mealthroutine/.env` | 키 이름만. 실제 값은 서버에서 만든다 |
| `release.sh` | `/opt/mealthroutine/release.sh` | 버전 전환·점검·자동 되돌리기 |

서버 폴더: `releases/<릴리스>/{app.jar,dist/,COMMIT}`, `releases/current`(지금 버전 링크), `releases/previous`(직전 릴리스 이름), `db-init/`(첫 DB 초기화 SQL), `backups/`(DB 백업).

## 1. 서버 처음 만들기 (1회)

1. EC2: Ubuntu Server LTS(x86_64), t3.small 이상, 디스크 30GiB gp3, 탄력적 IP 연결. 보안 그룹은 22·80·443만.
2. 서버 준비(ssh 접속 후):
   ```bash
   sudo timedatectl set-timezone Asia/Seoul
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
   Docker는 공식 안내(https://docs.docker.com/engine/install/ubuntu/)의 apt 저장소 방식으로 설치하고 `sudo usermod -aG docker ubuntu` 후 다시 접속한다.
   ```bash
   sudo mkdir -p /opt/mealthroutine/releases /opt/mealthroutine/db-init /opt/mealthroutine/backups && sudo chown -R ubuntu:ubuntu /opt/mealthroutine
   ```
3. 이 폴더의 `compose.yml`·`Caddyfile`·`release.sh`를 서버 `/opt/mealthroutine/`에 복사하고 `chmod +x release.sh`.
4. `.env` 만들기(서버에서 직접. 값은 화면에 나오지 않는다):
   ```bash
   cd /opt/mealthroutine && umask 077 && cat > .env <<EOF
   SITE_ADDRESS=<도메인 또는 a-b-c-d.sslip.io>
   ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory
   DB_PASSWORD=$(openssl rand -hex 24)
   JWT_SECRET=$(openssl rand -base64 32)
   EOF
   chmod 600 .env
   ```
   - `ACME_CA`는 첫 시험용(staging 인증서)이다. 확인 후 이 줄을 지우고 `docker compose up -d caddy`로 실제 인증서를 받는다.
   - **`DB_PASSWORD`는 DB를 처음 만든 뒤에 바꾸지 않는다**(MySQL이 첫 실행 때 이 값으로 계정을 만든다).
   - 값은 `cat .env`로 직접 보고 팀장 비밀번호 관리자에만 보관한다.
5. 운영 DB 초기화 SQL을 `db-init/`에 둔다(빈 DB로 처음 시작할 때 이름 순서대로 한 번만 실행된다):

   | 서버 파일 | 저장소 원본 |
   |---|---|
   | `001_schema.sql` | `database/schema/001_create_tables.sql` |
   | `002_exercises.sql` | `database/seed/001_insert_exercises.sql` |
   | `003_rewards.sql` | `database/seed/003_insert_rewards.sql` |
   | `004_quizzes.sql` | `database/seed/004_insert_quizzes.sql` |
   | `005_foods.sql` | `database/seed/005_insert_foods.sql` |

   **넣지 않는다:** `database/seed/002_insert_test_users.sql`(테스트 사용자), `database/docker/create-test-db.sql`(테스트 DB), `database/migration/*`(001에 이미 반영됨).
6. 첫 버전은 아래 2장의 CD로 배포한다(또는 `releases/<SHA>/`에 `app.jar`·`dist/`를 직접 올리고 `./release.sh activate <SHA>`).
   릴리스 이름은 `<SHA 7~40자>` 또는 `<SHA>-<숫자>[-<숫자>]` 형식이다. CD는 `<짧은SHA>-<실행번호>-<시도번호>`로 매번 새 폴더를 만든다.
7. 확인: `SELECT COUNT(*) FROM users` = 0, `SHOW DATABASES`에 `mealthroutine_test` 없음.

## 2. 배포 (GitHub Actions 수동 CD)

1. 배포할 커밋을 정한다. develop 또는 main에 있는 커밋만 배포할 수 있다.
2. GitHub → Actions → **Deploy (manual)** → Run workflow → `sha`에 커밋 SHA 입력 → Run.
3. 테스트(CI와 같은 검사)가 끝나면 `production` 환경 승인 요청이 온다. 팀장이 승인한다.
4. Actions가 jar·dist를 빌드해 서버 **새 폴더** `releases/<짧은SHA>-<실행번호>-<시도번호>/`에 올리고(같은 이름이 있으면 덮어쓰지 않고 중단) `release.sh activate`를 실행한다.
   같은 SHA를 다시 배포해도 운영 중인 폴더를 건드리지 않으므로 직전 버전으로 돌아갈 수 있다.
5. **자동 복귀하는 경우:** 서버 안에서 `docker compose up`·`restart` 명령이 실패하거나, 서버 안 점검(Caddy를 거친 `/`와 `GET /api/v1/exercises`)이 실패하면 `release.sh`가 직전 버전으로 되돌리고 Actions는 실패로 끝난다.
   `release.sh` 끝 상태: 0 성공 / 1 실패·직전 버전으로 복구함 / 2 입력·사전 조건 오류(변경 없음) / 3 실패·복구도 실패(수동 조치) / 4 실패·되돌릴 직전 버전 없음 / 5 전환·점검은 성공했지만 직전 버전 기록(`releases/previous`) 저장 실패(앱은 새 버전으로 동작, 출력된 안내대로 기록을 고친다).
6. **자동 복귀하지 않는 경우:** 서버 안 점검은 통과했는데 GitHub에서 하는 외부 점검(`SITE_URL`)이 실패하면 Actions만 실패로 표시한다. 원인은 보통 인증서·DNS·보안 그룹 쪽이므로, 사이트를 직접 확인한 뒤 새 버전 문제라면 서버에서 `./release.sh rollback`을 실행한다.
7. 배포한 SHA·릴리스 이름과 결과를 작업현황에 적는다.

push나 머지만으로는 배포되지 않는다. 발표·시연 직전에는 배포하지 않는다(배포 동결).

### GitHub에 필요한 설정 (`production` Environment)

| 종류 | 이름 | 내용 |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | 배포 전용 SSH 개인키(관리자 키와 따로 만든다) |
| Secret | `DEPLOY_KNOWN_HOSTS` | 서버 지문(`ssh-keyscan -t ed25519 <서버IP>` 결과) |
| Secret | `DEPLOY_HOST` | 서버 IP |
| Variable | `SITE_URL` | `https://<사이트 주소>` (비밀 아님) |

- Environment의 **Required reviewers**에 팀장을 넣어 승인 없이는 배포되지 않게 한다.
- 저장소가 공개라 Actions 로그도 공개된다. 비밀값을 출력하는 단계를 만들지 않는다.
- 배포 전용 공개키는 서버 `~/.ssh/authorized_keys`에 추가한다. 키가 새면 그 줄만 지우면 된다.

## 3. 되돌리기·복구

| 상황 | 방법 |
|---|---|
| 새 버전에 문제 | 서버에서 `cd /opt/mealthroutine && ./release.sh rollback` (직전 버전으로 전환·재시작·점검) |
| 특정 버전으로 | `./release.sh activate <릴리스>` (`releases/`에 남아 있는 폴더 이름) |
| 오래된 릴리스 정리 | `current`·`previous`가 아닌 오래된 `releases/<릴리스>` 폴더만 지운다 |
| 지금 상태 보기 | `./release.sh status`, 로그는 `docker compose logs --tail=200 backend` |
| DB 백업 | `docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -umealthroutine --single-transaction --no-tablespaces mealthroutine' > backups/$(date +%Y%m%d-%H%M).sql` |
| DB 복원 | `docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -umealthroutine mealthroutine' < backups/<파일>.sql` (덮어쓰므로 먼저 현재 상태를 백업) |
| 스키마를 바꾸는 배포 | **배포 전에 반드시 DB 백업.** 코드 되돌리기만으로는 DB가 돌아가지 않는다 |
| 비밀값 노출 | 폐기 → 새로 만들기 → `.env` 교체 → `docker compose up -d`. JWT 키를 바꾸면 모든 사용자가 다시 로그인한다. GitHub Secret이면 Secret 교체·배포 키는 `authorized_keys`에서 삭제 |
| 인증서 | Caddy가 자동 갱신한다. 실패하면 `docker compose logs caddy`를 본다 |

## 4. 알려진 한계 (발표 후 정리)

- 아이디 찾기 시도 제한(IP당 1분 5회)은 프록시 뒤라 **모든 사용자가 하나의 IP로 합산**된다(DEPLOY-10). `server.forward-headers-strategy` 설정으로 풀 수 있다.
- SSH 22를 전체에 열어 둔다(GitHub Actions IP가 바뀌기 때문, DEPLOY-5). AWS SSM + OIDC로 닫는 것을 검토한다.
- DB 자동 백업(S3 보관)은 아직 없다.
- `backend/gradlew`가 Git에 실행 권한 없이 저장돼 있어 CI·CD는 `sh ./gradlew`로 실행한다.
