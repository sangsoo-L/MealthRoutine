"""식약처 CSV(database/raw) → database/seed/005_insert_foods.sql 변환 (정민재)
실행: python database/tools/gen_foods.py  (원본 CSV는 공공데이터포털에서 받아 database/raw에 두기)
"""
import csv, re, sys, os
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # database 폴더
srcs = [
  (1, "식약처 전국통합식품영양성분정보(음식)", "https://www.data.go.kr/data/15100070/standard.do",
   "raw/전국통합식품영양성분정보_음식_표준데이터.csv"),
  (2, "식약처 전국통합식품영양성분정보(원재료성식품)", "https://www.data.go.kr/data/15100065/standard.do",
   "raw/전국통합식품영양성분정보_원재료성식품_표준데이터.csv"),
]

# 다이어트 단골 원재료는 검색하기 쉬운 이름으로 변경 (원본 이름 → 표시 이름)
ALIASES = {
    "닭고기_가슴(껍질 제거)_삶은것": "닭가슴살(삶은것)",
    "닭고기_가슴(껍질 제거)_구운것(팬)": "닭가슴살(구운것)",
    "닭고기_가슴(껍질 제거)_생것": "닭가슴살(생것)",
    "고구마_분질(밤) 고구마_찐것": "고구마(찐것)",
    "고구마_분질(밤) 고구마_구운것": "고구마(구운것)",
    "고구마_점질(호박) 고구마_찐것": "호박고구마(찐것)",
    "감자_대지_찐것": "감자(찐것)",
    "달걀_삶은것": "삶은 달걀",
    "달걀_생것": "달걀(생것)",
    "달걀_난백_삶은것": "삶은 달걀흰자",
    "멥쌀밥_신동진_현미": "현미밥",
    "멥쌀밥_신동진_백미": "흰쌀밥",
    "귀리밥_도정": "귀리밥",
    "브로콜리_데친것": "브로콜리(데친것)",
    "시금치_노지_데친것": "시금치(데친것)",
    "양배추_찐것": "양배추(찐것)",
    "호박_단호박_찐것": "단호박(찐것)",
    "토마토_생것": "토마토",
    "토마토_방울토마토_생것": "방울토마토",
    "바나나_생것": "바나나",
    "사과_생것": "사과",
    "돼지고기_안심(안심살)_구운것(팬)": "돼지 안심(구운것)",
    "소고기_수입산(미국산)_안심(안심살)_구운것": "소고기 안심(구운것)",
    "연어류_연어_전체_구운것_수입_평균": "연어(구운것)",
    "새우류_보리새우_육_삶은것_대표_평균": "새우(삶은것)",
    "아몬드_볶은것": "아몬드(볶은것)",
}

def s(v, n=None):
    v = (v or "").strip()
    if not v or v == "해당없음": return "NULL"
    if n: v = v[:n]
    return "'" + v.replace("\\", "\\\\").replace("'", "''") + "'"
def num(v):
    v = (v or "").strip().replace(",", "")
    try:
        x = float(v)
    except ValueError:
        return "NULL"
    if x < 0 or x > 999999.99: return "NULL"
    return ("%.2f" % x).rstrip("0").rstrip(".")
def amount(v):  # '100g' -> (100, 'g')
    m = re.fullmatch(r"\s*([\d.]+)\s*([a-zA-Z]+)\s*", v or "")
    return (m.group(1), m.group(2).lower()) if m else (None, None)
out = ["-- 식약처 식품영양성분 데이터 (정민재). database/raw의 원본 CSV를 변환해 생성, 직접 수정하지 말 것.",
       "SET NAMES utf8mb4;", ""]
out.append("INSERT INTO food_data_sources (source_id, source_name, source_url, terms_note) VALUES")
out.append(",\n".join(f"({i}, {s(n)}, {s(u)}, '공공데이터포털 표준데이터 (2026-11-19 내려받음)')" for i, n, u, _ in srcs) + ";")
total = 0
for sid, _, _, fn in srcs:
    rows = list(csv.DictReader(open(os.path.join(base, fn), encoding="cp949")))
    vals = []
    for r in rows:
        size, unit = amount(r["영양성분함량기준량"])
        if not size or not r["식품명"].strip(): continue
        ref = "NULL"
        w, wu = amount(r.get("식품중량", ""))
        if w and wu == unit: ref = num(w)          # 1인분 = 제품 1개 중량 (단위가 같을 때만)
        vals.append("(" + ", ".join([
            str(sid), s(ALIASES.get(r["식품명"].strip(), r["식품명"]), 200), s(r["식품대분류명"], 100), s(r.get("업체명"), 160),
            num(size), s(unit), num(r["에너지(kcal)"]), num(r["탄수화물(g)"]), num(r["단백질(g)"]),
            num(r["지방(g)"]), num(r["당류(g)"]), num(r["나트륨(mg)"]), ref, s(r["식품코드"], 255)]) + ")")
    total += len(vals)
    out.append(f"\n-- source {sid}: {len(vals)}건")
    for i in range(0, len(vals), 1000):
        out.append("INSERT INTO foods (source_id, name, category, brand, serving_size, serving_unit, calories_kcal, "
                   "carbohydrate_g, protein_g, fat_g, sugar_g, sodium_mg, reference_serving_size, external_food_id) VALUES")
        out.append(",\n".join(vals[i:i+1000]) + ";")
path = os.path.join(base, "seed/005_insert_foods.sql")
open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
print("총", total, "건 →", path, os.path.getsize(path), "bytes")
