#!/usr/bin/env bash
# 밀스루틴 릴리스 전환·되돌리기 (서버 위치: /opt/mealthroutine/release.sh)
#
#   ./release.sh activate <릴리스>   releases/<릴리스>로 전환 → 재시작 → 점검. 실패하면 직전 버전으로 자동 복귀.
#   ./release.sh rollback            직전 버전(releases/previous에 적힌 릴리스)으로 되돌린다.
#   ./release.sh status              지금 버전과 직전 버전을 보여 준다.
#
# <릴리스>는 releases/ 아래 폴더 이름이다. 형식: <SHA 7~40자> 또는 <SHA>-<숫자>[-<숫자>]
#   (수동 첫 배포는 57b730c, CD는 <짧은SHA>-<실행번호>-<시도번호>처럼 매번 새 이름을 쓴다.
#    운영 중인 폴더를 덮어쓰지 않아서 같은 SHA를 다시 배포해도 직전 버전으로 돌아갈 수 있다. CICD-R1)
#
# 끝 상태(exit code):
#   0 성공 / 1 실패했고 직전 버전으로 복구함 / 2 입력·사전 조건 오류(아무것도 바꾸지 않음)
#   3 실패했고 복구도 실패(수동 조치 필요) / 4 실패했는데 되돌릴 직전 버전이 없음
#   5 전환·점검은 성공했지만 직전 버전 기록(releases/previous) 저장 실패 — 앱은 새 버전으로 동작 중,
#     다음 rollback 대상이 틀릴 수 있으므로 안내대로 기록을 직접 고쳐야 한다(CICD-R2a)
#
# 재시작 명령(docker compose)이 실패해도 복귀 처리에 도달하도록, 전환 뒤 단계는 set -e에 맡기지 않고
# 명령마다 실패를 직접 확인한다(CICD-R2).
# 비밀값을 읽거나 출력하지 않는다(SITE_ADDRESS만 .env에서 읽는다).
set -uo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
RELEASES="$BASE_DIR/releases"
cd "$BASE_DIR" || exit 2

RELEASE_RE='^[0-9a-f]{7,40}(-[0-9]+){0,2}$'

site_address() {
  grep -E '^SITE_ADDRESS=' .env | head -n1 | cut -d= -f2-
}

current_release() {
  if [ -L "$RELEASES/current" ]; then readlink "$RELEASES/current"; else echo ""; fi
}

# current 링크를 한 번에 바꾼다(임시 링크를 만든 뒤 이름을 바꿔서 링크가 없는 순간이 없게 한다).
switch_link() {
  local rel="$1"
  ln -sfn "$rel" "$RELEASES/current.tmp" || return 1
  mv -Tf "$RELEASES/current.tmp" "$RELEASES/current" || return 1
}

# 직전 버전 기록을 임시 파일에 쓴 뒤 한 번에 교체한다(중간에 실패해도 기존 기록이 잘리거나 반쯤 쓰이지 않는다).
# 실패하면 1을 돌려준다. 호출하는 쪽이 성공으로 보고하지 않는다(CICD-R2a).
write_previous() {
  local rel="$1"
  if ! printf '%s\n' "$rel" > "$RELEASES/previous.tmp" 2>/dev/null; then
    rm -f "$RELEASES/previous.tmp" 2>/dev/null
    return 1
  fi
  if ! mv -Tf "$RELEASES/previous.tmp" "$RELEASES/previous" 2>/dev/null; then
    rm -f "$RELEASES/previous.tmp" 2>/dev/null
    return 1
  fi
  [ "$(cat "$RELEASES/previous" 2>/dev/null)" = "$rel" ] || return 1
}

# 전환은 성공했는데 기록 저장만 실패했을 때 지금 상태와 고치는 방법을 알린다.
report_previous_failure() {
  local now="$1" should_be="$2" recorded
  recorded="$(cat "$RELEASES/previous" 2>/dev/null || echo '(읽을 수 없음)')"
  echo "주의: 전환·점검은 성공했지만 직전 버전 기록 저장에 실패했습니다." >&2
  echo "  지금 버전(current): $now / 기록돼 있는 직전 버전(previous): $recorded / 기록돼야 할 값: $should_be" >&2
  echo "  다음 rollback이 틀린 버전으로 갈 수 있습니다. 디스크·권한을 확인한 뒤 releases/previous 내용을 '$should_be'로 고치세요." >&2
}

check_release_dir() {
  local rel="$1"
  if ! [[ "$rel" =~ $RELEASE_RE ]]; then echo "릴리스 이름 형식이 아닙니다: $rel" >&2; return 1; fi
  if [ ! -f "$RELEASES/$rel/app.jar" ]; then echo "없음: releases/$rel/app.jar" >&2; return 1; fi
  if [ ! -f "$RELEASES/$rel/dist/index.html" ]; then echo "없음: releases/$rel/dist/index.html" >&2; return 1; fi
}

# 점검: 화면(index.html)과 공개 API(GET /api/v1/exercises, seed가 있어야 200)를 Caddy를 거쳐 확인한다.
# --resolve로 이 서버(127.0.0.1)에 직접 묻는다. staging 인증서여도 통과하도록 -k를 쓴다
# (인증서 자체는 deploy.yml의 외부 점검과 브라우저 점검 목록에서 확인한다).
health_check() {
  local site; site="$(site_address)"
  if [ -z "$site" ]; then echo ".env에 SITE_ADDRESS가 없습니다" >&2; return 1; fi
  local resolve="$site:443:127.0.0.1"
  local i
  for i in $(seq 1 40); do
    if curl -fsSk -o /dev/null --max-time 5 --resolve "$resolve" "https://$site/" \
      && curl -fsSk -o /dev/null --max-time 5 --resolve "$resolve" "https://$site/api/v1/exercises"; then
      echo "점검 통과 (${i}번째 시도)"
      return 0
    fi
    sleep 3
  done
  echo "점검 실패: https://$site/ 또는 /api/v1/exercises 가 응답하지 않습니다" >&2
  return 1
}

# 재시작 + 점검. 어느 단계가 실패해도 1을 돌려준다(종료하지 않는다).
start_and_check() {
  docker compose up -d || { echo "실패: docker compose up -d" >&2; return 1; }
  docker compose restart backend || { echo "실패: docker compose restart backend" >&2; return 1; }
  health_check || return 1
}

# target으로 전환하고 시작·점검한다. 실패하면 from(직전 버전)으로 되돌린다.
# 돌려주는 값: 0 성공 / 1 실패·복구함 / 3 실패·복구 실패 / 4 실패·되돌릴 버전 없음
switch_with_recovery() {
  local target="$1" from="$2"
  if ! switch_link "$target"; then
    echo "실패: current 링크를 바꾸지 못했습니다(지금 버전 그대로)" >&2
    return 3
  fi
  echo "전환: ${from:-(없음)} -> $target"
  if start_and_check; then
    return 0
  fi
  if [ -z "$from" ] || [ "$from" = "$target" ]; then
    echo "되돌릴 직전 버전이 없습니다. 로그 확인: docker compose logs --tail=200 backend" >&2
    return 4
  fi
  echo "직전 버전 $from 으로 되돌립니다." >&2
  if switch_link "$from" && start_and_check; then
    echo "복구 완료: 지금 버전은 $from 입니다." >&2
    return 1
  fi
  echo "복구도 실패했습니다. 수동 조치 필요: docker compose ps / docker compose logs --tail=200 backend" >&2
  return 3
}

cmd="${1:-status}"
case "$cmd" in
  activate)
    target="${2:-}"
    if [ -z "$target" ]; then echo "사용법: ./release.sh activate <릴리스>" >&2; exit 2; fi
    check_release_dir "$target" || exit 2
    prev="$(current_release)"
    if [ -n "$prev" ] && [ "$prev" = "$target" ]; then
      echo "이미 $target 입니다. 재시작과 점검만 합니다(되돌릴 대상 없음)."
      start_and_check && exit 0
      exit 4
    fi
    switch_with_recovery "$target" "$prev"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      # 성공했을 때만 직전 버전을 기록한다(실패 시 기록이 바뀌지 않게). 기록 저장 실패는 성공으로 보고하지 않는다.
      if [ -n "$prev" ] && ! write_previous "$prev"; then
        report_previous_failure "$target" "$prev"
        exit 5
      fi
      echo "배포 완료: $target"
    fi
    exit "$rc"
    ;;
  rollback)
    if [ ! -f "$RELEASES/previous" ]; then echo "되돌릴 직전 버전 기록이 없습니다" >&2; exit 2; fi
    target="$(cat "$RELEASES/previous")"
    check_release_dir "$target" || exit 2
    cur="$(current_release)"
    if [ "$cur" = "$target" ]; then echo "이미 $target 입니다." >&2; exit 2; fi
    switch_with_recovery "$target" "$cur"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      if [ -n "$cur" ] && ! write_previous "$cur"; then
        report_previous_failure "$target" "$cur"
        exit 5
      fi
      echo "되돌림 완료: ${cur:-(없음)} -> $target"
    fi
    exit "$rc"
    ;;
  status)
    echo "현재: $(current_release)"
    if [ -f "$RELEASES/previous" ]; then echo "직전: $(cat "$RELEASES/previous")"; else echo "직전: (없음)"; fi
    docker compose ps
    ;;
  *)
    echo "사용법: ./release.sh activate <릴리스> | rollback | status" >&2
    exit 2
    ;;
esac
