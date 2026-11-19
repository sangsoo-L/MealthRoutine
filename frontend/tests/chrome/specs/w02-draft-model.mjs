// [chrome 회귀] W02 초안 모델(실제 모듈 실행)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// W02-B 단위 검증: 초안 순수 함수·저장 모듈을 개발 서버의 실제 모듈로 실행한다(Chrome headless + CDP). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const t = await launch(
  'out-w02unit-' + Date.now(),
  9871,
  'http://localhost:5199',
)
const { ev, go, sleep, check } = t
await go('/exercises', 900)

// 페이지 안에서 모든 검사를 실행하고 [이름, 통과 여부, 상세] 목록을 돌려준다.
const results = await ev(`(async()=>{
  const M=await import('/src/exercise/workoutDraftModel.ts')
  const S=await import('/src/exercise/workoutDraftStorage.ts')
  const EX=(await import('/src/exercise/seed/seedData.ts')).getSeedCatalog().getAllExercises()
  const T=await import('/src/exercise/workoutDraftTypes.ts')
  const out=[]; const ok=(n,c,d='')=>out.push([n,!!c,String(d).slice(0,300)])
  const pick=(id)=>EX.find(e=>e.id===id)
  let tick=0; const now=()=>'2026-11-11T00:00:'+String(++tick).padStart(2,'0')+'.000Z'
  let n=0; const ids=()=>'id'+(++n)
  const deepFreeze=(o)=>{Object.freeze(o);Object.values(o).forEach(v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v)});return o}
  const base=()=>M.createEmptyDraft(now)

  // --- 기록 방식 기본값 ---
  const dt=Object.fromEntries(EX.map(e=>[e.id,M.resolveStoredRecordType(e)]))
  ok('기본 기록 방식: 시드 전체 운동이 카탈로그 기본 방식(weight_reps는 저장 코드 weight)과 일치', EX.every(e=>dt[e.id]===({weight_reps:'weight'}[e.recordModes.default]??e.recordModes.default)), JSON.stringify(Object.values(dt).reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{})))

  // --- 운동 추가 ---
  const d0=deepFreeze(base())
  const d1=M.addExercisesToDraft(d0,[pick('16'),pick('2'),pick('29')],now,ids)
  ok('운동 추가: 입력 순서 유지, 명시 기록 방식 저장, 이름 스냅샷', d1.items.map(i=>i.exerciseId).join()==='16,2,29'&&d1.items.map(i=>i.recordType).join()==='reps,weight,time'&&d1.items[0].name==='맨몸 스쿼트')
  ok('운동 추가: 기본 세트는 1세트·10회·60초(편집용 예시)', d1.items.every(i=>i.sets.length===1&&i.sets[0].reps===10&&i.sets[0].targetSeconds===60&&i.sets[0].weightKg===undefined))
  ok('운동 추가: 원본 초안은 변하지 않고(얼린 객체) 새 객체를 돌려줌, 시각 갱신', d0.items.length===0&&d1!==d0&&d1.updatedAt!==d0.updatedAt)
  ok('운동 추가: itemId는 모두 다름', new Set(d1.items.map(i=>i.itemId)).size===3)
  const d2=M.addExercisesToDraft(d1,[pick('16'),pick('22'),pick('22'),pick('29')],now,ids)
  ok('중복 방지: 이미 있는 id·입력 안의 중복은 건너뛰고 새 운동만 순서대로 추가(plank 1개)', d2.items.map(i=>i.exerciseId).join()==='16,2,29,22')
  ok('추가할 것이 없으면 같은 초안 객체를 돌려줌(불필요한 저장 없음)', M.addExercisesToDraft(d2,[pick('16')],now,ids)===d2&&M.addExercisesToDraft(d2,[],now,ids)===d2)

  // --- 삭제·이동 ---
  const itemOf=(d,id)=>d.items.find(i=>i.exerciseId===id)
  const d3=M.removeItemFromDraft(d2,itemOf(d2,'2').itemId,now)
  ok('운동 삭제: 해당 운동만 빠지고 나머지 순서·값 유지', d3.items.map(i=>i.exerciseId).join()==='16,29,22'&&d3.items[0]===d2.items[0])
  ok('없는 항목 삭제는 같은 초안', M.removeItemFromDraft(d3,'nope',now)===d3)
  let dl=d1; for(const it of d1.items) dl=M.removeItemFromDraft(dl,it.itemId,now)
  ok('마지막 운동도 삭제 가능 → 빈 초안', dl.items.length===0)
  const mv=M.moveItemInDraft(d2,itemOf(d2,'29').itemId,'up',now)
  ok('순서 이동(위로): 한 칸 이동, 다른 운동 객체는 그대로', mv.items.map(i=>i.exerciseId).join()==='16,29,2,22'&&mv.items[0]===d2.items[0]&&mv.items[3]===d2.items[3])
  ok('양 끝 이동은 같은 초안(첫 항목 위로·마지막 항목 아래로)', M.moveItemInDraft(d2,d2.items[0].itemId,'up',now)===d2&&M.moveItemInDraft(d2,d2.items[3].itemId,'down',now)===d2)

  // --- 기록 방식 변경·값 보존 ---
  let w=M.addExercisesToDraft(base(),[pick('2')],now,ids); const wid=w.items[0].itemId
  w=M.updateSetInItem(w,wid,0,{weightKg:12},now)
  const toTime=M.setItemRecordType(w,wid,'time',now)
  ok('기록 방식 변경(중량→시간): 중량 입력값 보존', toTime.items[0].recordType==='time'&&toTime.items[0].sets[0].weightKg===12)
  const back=M.setItemRecordType(toTime,wid,'weight',now)
  ok('다시 중량형으로 돌아오면 이전 중량 입력값 유지', back.items[0].sets[0].weightKg===12&&back.items[0].recordType==='weight')
  ok('같은 방식·알 수 없는 방식은 변화 없음', M.setItemRecordType(back,wid,'weight',now)===back&&M.setItemRecordType(back,wid,'bogus',now)===back)

  // --- 세트 추가·삭제·수정 ---
  const a=M.addSetToItem(w,wid,now)
  ok('세트 추가: 기본 10회·60초, 이전 세트의 중량을 복사하지 않음', a.items[0].sets.length===2&&a.items[0].sets[1].reps===10&&a.items[0].sets[1].targetSeconds===60&&a.items[0].sets[1].weightKg===undefined&&a.items[0].sets[0].weightKg===12)
  ok('세트 삭제: 지정 세트만 삭제', M.removeSetFromItem(a,wid,0,now).items[0].sets.length===1&&M.removeSetFromItem(a,wid,0,now).items[0].sets[0].weightKg===undefined)
  ok('마지막 세트는 삭제 불가(같은 초안)', M.removeSetFromItem(w,wid,0,now)===w)
  ok('범위 밖 세트 삭제·수정은 같은 초안', M.removeSetFromItem(a,wid,5,now)===a&&M.updateSetInItem(a,wid,9,{reps:3},now)===a&&M.removeSetFromItem(a,wid,-1,now)===a)
  const u=M.updateSetInItem(a,wid,1,{reps:5,weightKg:20},now)
  ok('세트 값 수정: 해당 세트만 바뀌고 나머지 유지', u.items[0].sets[1].reps===5&&u.items[0].sets[1].weightKg===20&&u.items[0].sets[0].weightKg===12)
  ok('값 비우기(undefined): 필드가 사라짐', !('weightKg' in M.updateSetInItem(u,wid,1,{weightKg:undefined},now).items[0].sets[1]))
  ok('유한하지 않은 숫자는 받지 않음(NaN·Infinity)', M.updateSetInItem(u,wid,1,{reps:NaN},now)===u&&M.updateSetInItem(u,wid,1,{reps:Infinity},now)===u)

  // --- 검증 ---
  const mk=(recordType,sets)=>({v:1,day:'today',updatedAt:'x',items:[{itemId:'a',exerciseId:'e1',name:'운동',recordType,sets}]})
  const bad=(d,known)=>{const r=M.validateDraft(d,known);return r.ok?[]:r.issues}
  ok('검증: 운동이 없으면 오류(items)', bad(base()).some(i=>i.field==='items'))
  ok('검증: 횟수형 reps 1 이상 정수만 통과(10 통과 / 0·2.5·-1·없음 오류)', bad(mk('reps',[{reps:10}])).length===0&&[0,2.5,-1,undefined].every(v=>bad(mk('reps',[v===undefined?{}:{reps:v}])).some(i=>i.field==='reps'&&i.setIndex===0)))
  ok('검증: 중량형 weightKg는 비어도 통과, 0·소수 통과, -1은 오류', bad(mk('weight',[{reps:5}])).length===0&&bad(mk('weight',[{reps:5,weightKg:0}])).length===0&&bad(mk('weight',[{reps:5,weightKg:7.5}])).length===0&&bad(mk('weight',[{reps:5,weightKg:-1}])).some(i=>i.field==='weightKg'))
  ok('검증: 중량형도 reps는 필요(없으면 오류)', bad(mk('weight',[{weightKg:5}])).some(i=>i.field==='reps'))
  ok('검증: 시간형 1~3600 정수만 통과(1·60·3600 통과 / 0·3601·60.5·없음 오류)', [1,60,3600].every(v=>bad(mk('time',[{targetSeconds:v}])).length===0)&&[0,3601,60.5,undefined].every(v=>bad(mk('time',[v===undefined?{}:{targetSeconds:v}])).some(i=>i.field==='targetSeconds')))
  ok('검증: 시간형은 보이지 않는 reps를 검사하지 않음(reps 0이어도 통과)', bad(mk('time',[{reps:0,targetSeconds:60}])).length===0)
  ok('검증: 횟수형은 목표 시간 값이 이상해도 검사하지 않음', bad(mk('reps',[{reps:3,targetSeconds:-5}])).length===0)
  ok('검증: 오류는 운동·세트를 가리킴(2번째 세트의 reps 오류)', (()=>{const i=bad(mk('reps',[{reps:3},{reps:0}]));return i.length===1&&i[0].itemId==='a'&&i[0].setIndex===1&&i[0].field==='reps'&&i[0].message.length>0})())
  ok('검증: 운동 id 중복·항목 id 중복·알 수 없는 기록 방식·빈 세트 배열 오류', (()=>{const d={v:1,day:'today',updatedAt:'x',items:[{itemId:'a',exerciseId:'e1',name:'x',recordType:'reps',sets:[{reps:1}]},{itemId:'a',exerciseId:'e1',name:'y',recordType:'zzz',sets:[]}]};const f=bad(d).map(i=>i.field);return f.includes('exercise')&&f.includes('items')&&f.includes('recordType')})())
  ok('검증: 알려진 운동 목록을 주면 목록에 없는 운동 id가 오류(주지 않으면 검사 안 함)', bad(mk('reps',[{reps:3}]),new Set(['other'])).some(i=>i.field==='exercise')&&bad(mk('reps',[{reps:3}]),new Set(['e1'])).length===0&&bad(mk('reps',[{reps:3}])).length===0)

  // --- 정규화 ---
  const rich={v:1,day:'today',updatedAt:'x',items:[
    {itemId:'1',exerciseId:'a',name:'A',recordType:'reps',sets:[{reps:10,weightKg:9,targetSeconds:60}]},
    {itemId:'2',exerciseId:'b',name:'B',recordType:'weight',sets:[{reps:8,weightKg:12,targetSeconds:60},{reps:8,targetSeconds:60}]},
    {itemId:'3',exerciseId:'c',name:'C',recordType:'time',sets:[{reps:10,weightKg:3,targetSeconds:45}]}]}
  const before=JSON.stringify(rich)
  const norm=M.normalizeDraft(deepFreeze(JSON.parse(before)))
  ok('정규화: 횟수형은 reps만, 중량형은 reps+weightKg(없으면 weightKg 필드 없음), 시간형은 targetSeconds만', JSON.stringify(norm.map(i=>i.sets))===JSON.stringify([[{reps:10}],[{reps:8,weightKg:12},{reps:8}],[{targetSeconds:45}]]), JSON.stringify(norm&&norm.map(i=>i.sets)))
  ok('정규화: 원본 초안을 바꾸지 않음(얼린 입력으로 실행됨)·exerciseId/name/recordType 유지', norm[0].exerciseId==='a'&&norm[2].recordType==='time'&&norm[1].name==='B')
  ok('정규화: 유효하지 않으면 null', M.normalizeDraft(base())===null&&M.normalizeDraft(mk('reps',[{reps:0}]))===null)

  // --- 소유자 지문 ---
  const fp=S.ownerFingerprint('member-123')
  ok('소유자 지문: 같은 입력은 같은 값, 다른 사용자는 다른 값, 16진수 문자열이며 사용자 ID가 그대로 들어 있지 않음', fp===S.ownerFingerprint('member-123')&&fp!==S.ownerFingerprint('member-124')&&/^[0-9a-f]+$/.test(fp)&&!fp.includes('member'), fp)
  ok('저장 키는 고정이며 계정 정리 접두어로 시작하고 사용자 ID를 포함하지 않음', S.WORKOUT_DRAFT_KEY==='mealthroutine.account.workout-draft')

  // --- 저장 파싱 ---
  const U='free'
  const valid=()=>({wv:1,owner:S.ownerFingerprint(U),draft:{v:1,day:'today',updatedAt:'2026-11-11T00:00:00.000Z',items:[{itemId:'i1',exerciseId:'16',name:'스쿼트',recordType:'reps',sets:[{reps:10,targetSeconds:60}]},{itemId:'i2',exerciseId:'2',name:'덤벨 로우',recordType:'weight',sets:[{reps:8,weightKg:12.5}]}]}})
  const parse=(o,u=U)=>S.parseStoredDraft(typeof o==='string'?o:JSON.stringify(o),u)
  const reason=(o,u)=>{const r=parse(o,u);return r.ok?'ok':r.reason}
  ok('파싱: 정상 값은 복구됨(운동 2개·값 유지)', (()=>{const r=parse(valid());return r.ok&&r.draft.items.length===2&&r.draft.items[1].sets[0].weightKg===12.5})())
  ok('파싱: JSON이 아니면 corrupt', reason('{bad json')==='corrupt'&&reason('')==='corrupt'&&reason('null')==='corrupt'&&reason('[]')==='corrupt'&&reason('"x"')==='corrupt')
  ok('파싱: 래퍼 버전이 다르면 version, 초안 버전이 다르면 version', reason({...valid(),wv:2})==='version'&&(()=>{const v=valid();v.draft.v=2;return reason(v)==='version'})())
  ok('파싱: 소유자 지문이 다르면 owner(다른 사용자로 읽을 때)', reason(valid(),'other')==='owner')
  ok('파싱: 필수 필드 누락은 corrupt(owner·draft·day·updatedAt·items)', (()=>{const miss=(fn)=>{const v=valid();fn(v);return reason(v)};return miss(v=>delete v.owner)==='corrupt'&&miss(v=>delete v.draft)==='corrupt'&&miss(v=>delete v.draft.day)==='corrupt'&&miss(v=>delete v.draft.updatedAt)==='corrupt'&&miss(v=>delete v.draft.items)==='corrupt'})())
  ok('파싱: day가 today가 아니면 corrupt(내일 초안 불가)', (()=>{const v=valid();v.draft.day='tomorrow';return reason(v)==='corrupt'})())
  ok('파싱: 잘못된 recordType·항목 필드 누락·빈 문자열은 corrupt', (()=>{const m=(fn)=>{const v=valid();fn(v.draft.items[0]);return reason(v)};return m(i=>i.recordType='zzz')==='corrupt'&&m(i=>delete i.itemId)==='corrupt'&&m(i=>delete i.exerciseId)==='corrupt'&&m(i=>i.name='')==='corrupt'&&m(i=>i.exerciseId=' x')==='corrupt'})())
  ok('파싱: 비정상 숫자(문자열·null=NaN·불리언·객체)는 corrupt', (()=>{const m=(v0)=>{const v=valid();v.draft.items[0].sets[0].reps=v0;return reason(v)};return m('10')==='corrupt'&&m(null)==='corrupt'&&m(true)==='corrupt'&&m({})==='corrupt'})())
  ok('파싱: Infinity·NaN을 직렬화하면(null) corrupt이고 유한한 음수·소수는 통과(검증은 별도)', (()=>{const v=valid();v.draft.items[0].sets[0].reps=-3.5;const r1=reason(v);const raw=JSON.stringify({...valid(),draft:{...valid().draft,items:[{...valid().draft.items[0],sets:[{reps:Infinity}]}]}});return r1==='ok'&&reason(raw)==='corrupt'})())
  ok('파싱: 세트 배열이 비었거나 배열이 아니면 corrupt', (()=>{const m=(s)=>{const v=valid();v.draft.items[0].sets=s;return reason(v)};return m([])==='corrupt'&&m({})==='corrupt'&&m('x')==='corrupt'&&m([null])==='corrupt'&&m([[]])==='corrupt'})())
  ok('파싱: 운동 id 중복·항목 id 중복은 corrupt', (()=>{const v=valid();v.draft.items[1].exerciseId='16';const w=valid();w.draft.items[1].itemId='i1';return reason(v)==='corrupt'&&reason(w)==='corrupt'})())
  ok('파싱: 항목이 비었거나 배열이 아니면 corrupt', (()=>{const v=valid();v.draft.items=[];const w=valid();w.draft.items={};return reason(v)==='corrupt'&&reason(w)==='corrupt'})())
  ok('파싱: editingListId는 문자열만 허용', (()=>{const v=valid();v.draft.editingListId=5;const w=valid();w.draft.editingListId='L1';const r=parse(w);return reason(v)==='corrupt'&&r.ok&&r.draft.editingListId==='L1'})())
  ok('파싱: 알 수 없는 추가 필드는 버려짐(재저장 시 남지 않음)', (()=>{const v=valid();v.draft.items[0].evil='x';v.draft.items[0].sets[0].extra=1;v.zzz=1;const r=parse(v);return r.ok&&!('evil' in r.draft.items[0])&&!('extra' in r.draft.items[0].sets[0])})())
  ok('파싱: 항목 수·세트 수 상한 초과는 corrupt', (()=>{const v=valid();v.draft.items[0].sets=Array.from({length:M.MAX_SETS_PER_ITEM+1},()=>({reps:1}));return reason(v)==='corrupt'})())

  // --- 저장·불러오기(가짜 저장소) ---
  const mem=()=>{const m=new Map();return{m,getItem:(k)=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,v)},removeItem:(k)=>{m.delete(k)}}}
  const st=mem(); const dd=M.addExercisesToDraft(base(),[pick('16')],now,ids)
  ok('저장→불러오기: 같은 사용자는 복구', S.saveWorkoutDraft(U,dd,st)===true&&(()=>{const l=S.loadWorkoutDraft(U,st);return l.draft&&l.draft.items[0].exerciseId==='16'&&!l.discarded&&!l.storageUnavailable})())
  ok('저장된 값에 사용자 ID가 문자 그대로 들어 있지 않음(지문만)', !st.m.get(S.WORKOUT_DRAFT_KEY).includes('"free"')&&!st.m.get(S.WORKOUT_DRAFT_KEY).includes(U+'@'))
  const l2=S.loadWorkoutDraft('someone-else',st)
  ok('다른 사용자로 불러오면 쓰지 않고 저장값을 지움, 손상 알림은 띄우지 않음(조용히 폐기)', l2.draft===null&&l2.discarded===false&&!st.m.has(S.WORKOUT_DRAFT_KEY))
  const st2=mem(); st2.setItem(S.WORKOUT_DRAFT_KEY,'{bad')
  const l3=S.loadWorkoutDraft(U,st2)
  ok('손상된 JSON: 빈 상태로 시작하고 저장값을 지우며 discarded=true', l3.draft===null&&l3.discarded===true&&!st2.m.has(S.WORKOUT_DRAFT_KEY))
  const st3=mem(); st3.setItem(S.WORKOUT_DRAFT_KEY,JSON.stringify({...valid(),wv:99}))
  ok('다른 스키마 버전: 폐기하고 discarded=true', (()=>{const l=S.loadWorkoutDraft(U,st3);return l.draft===null&&l.discarded&&!st3.m.has(S.WORKOUT_DRAFT_KEY)})())
  ok('빈 초안을 저장하면 저장값을 지움(저장하지 않음)', (()=>{const s=mem();S.saveWorkoutDraft(U,dd,s);const r=S.saveWorkoutDraft(U,base(),s);return r===true&&!s.m.has(S.WORKOUT_DRAFT_KEY)})())
  ok('저장된 것이 없으면 draft=null, 폐기·접근 불가 아님', (()=>{const l=S.loadWorkoutDraft(U,mem());return l.draft===null&&!l.discarded&&!l.storageUnavailable})())
  const boom=()=>{throw new DOMException('Quota','QuotaExceededError')}
  ok('저장 실패(용량 초과 등)는 예외 없이 false', S.saveWorkoutDraft(U,dd,{getItem:()=>null,setItem:boom,removeItem:()=>{}})===false)
  ok('저장소 접근 예외(getItem)는 예외 없이 storageUnavailable', (()=>{const l=S.loadWorkoutDraft(U,{getItem:boom,setItem:()=>{},removeItem:()=>{}});return l.draft===null&&l.storageUnavailable===true})())
  ok('저장소가 없으면(null) 저장은 false·불러오기는 storageUnavailable', S.saveWorkoutDraft(U,dd,null)===false&&S.loadWorkoutDraft(U,null).storageUnavailable===true)
  ok('손상값을 지우는 removeItem이 실패해도 예외 없음', (()=>{const l=S.loadWorkoutDraft(U,{getItem:()=>'{bad',setItem:()=>{},removeItem:boom});return l.draft===null&&l.discarded===true})())
  ok('clearWorkoutDraft: 저장값 삭제, removeItem 예외도 삼킴', (()=>{const s=mem();S.saveWorkoutDraft(U,dd,s);S.clearWorkoutDraft(s);S.clearWorkoutDraft({getItem:()=>null,setItem:()=>{},removeItem:boom});return !s.m.has(S.WORKOUT_DRAFT_KEY)})())
  ok('저장→불러오기→저장: 값이 변하지 않음(안정적 직렬화)', (()=>{const s=mem();S.saveWorkoutDraft(U,dd,s);const a=s.m.get(S.WORKOUT_DRAFT_KEY);const l=S.loadWorkoutDraft(U,s);S.saveWorkoutDraft(U,l.draft,s);return s.m.get(S.WORKOUT_DRAFT_KEY)===a})())

  // --- 검토 반영: 순수 읽기·파서 보강 ---
  const calls=[]; const spy={getItem:(k)=>{calls.push('get');return '{bad'},setItem:()=>calls.push('set'),removeItem:()=>calls.push('remove')}
  const rd=S.readWorkoutDraft(U,spy)
  ok('읽기 전용(readWorkoutDraft): 손상값을 돌려줄 때 저장소를 바꾸지 않고(get만) needsRemoval로 알림, 두 번 불러도 같은 결과', calls.join()==='get'&&rd.draft===null&&rd.discarded===true&&rd.needsRemoval===true&&JSON.stringify(S.readWorkoutDraft(U,spy))===JSON.stringify(rd)&&calls.join()==='get,get')
  ok('읽기 전용: 다른 소유자는 discarded=false(조용히)·needsRemoval=true, 정상값은 needsRemoval=false', (()=>{const s=mem();S.saveWorkoutDraft(U,dd,s);const a=S.readWorkoutDraft('other',s);const b=S.readWorkoutDraft(U,s);return a.draft===null&&a.discarded===false&&a.needsRemoval===true&&b.draft!==null&&b.needsRemoval===false&&s.m.has(S.WORKOUT_DRAFT_KEY)})())
  ok('읽기 전용: 저장소 접근 예외·저장소 없음은 storageUnavailable, 아무것도 지우지 않음', (()=>{const r1=S.readWorkoutDraft(U,{getItem:boom,setItem:()=>{},removeItem:()=>{throw new Error('호출되면 안 됨')}});const r2=S.readWorkoutDraft(U,null);return r1.storageUnavailable&&r2.storageUnavailable&&r1.needsRemoval===false})())
  ok('파서 보강: itemId에 공백·특수문자(DOM id로 위험)가 있으면 corrupt', (()=>{const m=(id)=>{const v=valid();v.draft.items[0].itemId=id;return reason(v)};return m('a b')==='corrupt'&&m('a"b')==='corrupt'&&m('a#b')==='corrupt'&&m('a.b')==='corrupt'&&m('ok-1_A')==='ok'})())
  ok('파서 보강: updatedAt이 날짜가 아니거나 너무 길면 corrupt', (()=>{const m=(u)=>{const v=valid();v.draft.updatedAt=u;return reason(v)};return m('x')==='corrupt'&&m('not-a-date')==='corrupt'&&m('2026-11-11T00:00:00.000Z'.padEnd(60,'0'))==='corrupt'&&m('2026-11-11T09:30:00.000Z')==='ok'})())
  ok('파서 보강: 원문이 지나치게 크면 파싱하지 않고 corrupt', S.parseStoredDraft(' '.repeat(2000001),U).ok===false&&S.parseStoredDraft(' '.repeat(2000001),U).reason==='corrupt')
  ok('상한: 세트 200개까지만 추가(201번째는 같은 초안), 상수 노출', (()=>{let d=M.addExercisesToDraft(base(),[pick('16')],now,ids);const id=d.items[0].itemId;for(let i=0;i<M.MAX_SETS_PER_ITEM+5;i++)d=M.addSetToItem(d,id,now);return d.items[0].sets.length===M.MAX_SETS_PER_ITEM})())
  return out
})()`)
for (const [name, pass, detail] of results)
  check(name, pass, pass ? '' : detail)
const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
const bad = t.problems.filter((p) => !/Download the React DevTools/.test(p))
if (bad.length)
  console.log('console problems:', JSON.stringify(bad.slice(0, 3)))
t.close()
process.exit(fails.length || bad.length ? 1 : 0)
