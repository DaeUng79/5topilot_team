// Local screen prototype. All identities are synthetic; no database or authentication.
export const FIELD_GROUPS = [
  ['정보시스템',28],['AI',2],['사업관리',13],['정보통신',15],['ICT전략',20],
  ['데이터, 정보시스템',1],['콘텐츠',5],['',5],['인공지능',19],
  ['정보통신, 정보보안, 정보시스템',1],['데이터',11],['정보화',1],['정보보안',7],['ICT신기술',1],
];
export function normalizedFields(text){return [...new Set(text.split(',').map(v=>v.trim()).filter(Boolean).map(v=>v==='AI'?'인공지능':v))];}
export function createDemoPool(){
  let id=0;
  return FIELD_GROUPS.flatMap(([raw,count])=>Array.from({length:count},()=>{
    id++;
    return {id,name:`예시위원 ${String(id).padStart(3,'0')}`,organization:['가상대학교','예시연구원','모의공공기관'][id%3],
      position:['교수','연구원','팀장'][id%3],category:['교수','민간','공공기관'][id%3],region:'가상 지역',department:'예시 부서',
      phone:`010-****-${String(id).padStart(4,'0')}`,raw,fields:normalizedFields(raw),active:Boolean(raw)};
  }));
}
export function eligiblePool(pool,fields){return pool.filter(c=>c.active&&c.fields.some(f=>fields.has(f)));}
export function counts(pool,fields,target){
  if(![7,8,9].includes(target))throw new Error('최종 인원은 7·8·9명 중 선택합니다.');
  const eligible=eligiblePool(pool,fields);return {eligible:eligible.length,required:target*3,shortage:Math.max(0,target*3-eligible.length)};
}
export function canFinalize(roster,selected,status,target){return selected.size===target&&[...selected].every(id=>roster.some(c=>c.id===id)&&status.get(id)==='참여 가능');}

if(typeof document!=='undefined'){
  const pool=createDemoPool();
  const fieldNames=[...new Set(pool.flatMap(c=>c.fields))];
  let state;
  const reset=()=>{state={fields:new Set(['정보시스템','인공지능','데이터']),target:7,project:'(가상) 2026년 정보화사업 제안평가',reviewed:false,roster:[],selected:new Set(),status:new Map(),notes:new Map(),confirmed:false,assigned:false,page:'pool',query:''};};
  reset();
  const main=document.getElementById('main');
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let toastTimer;
  function toast(text){const el=document.getElementById('toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},4500);}
  function head(step,title,description,actions=''){return `<div class="page-head"><div><p class="eyebrow">COMMITTEE MANAGEMENT / ${step}</p><h1>${title}</h1><p class="subtle">${description}</p></div><div class="head-actions">${actions}</div></div>`;}
  function empty(title,text,href,label){return `<section class="card empty"><div class="empty-icon">◎</div><h2>${title}</h2><p class="subtle">${text}</p><a href="#${href}"><button class="primary">${label}</button></a></section>`;}
  function render(){
    const page=location.hash.slice(1)||'pool';state.page=['pool','draw','final','assignment'].includes(page)?page:'pool';
    document.querySelectorAll('[data-page]').forEach(a=>{a.classList.toggle('active',a.dataset.page===state.page);if(a.dataset.page===state.page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(state.page==='pool')renderPool();if(state.page==='draw')renderDraw();if(state.page==='final')renderFinal();if(state.page==='assignment')renderAssignment();
  }
  function renderPool(){
    main.innerHTML=head('01','평가위원 인력풀','부서 서식으로 후보를 등록하고, 분야와 연락처 정보를 관리합니다.','<button id="open-import" class="primary">＋ 엑셀 등록</button>')+
      `<div class="stats"><div class="stat"><div><div class="label">시안 후보</div><strong>129<small>명</small></strong></div><span class="stat-mark">▤</span></div><div class="stat"><div><div class="label">전문분야가 있는 후보</div><strong>124<small>명</small></strong></div><span class="stat-mark">✓</span></div><div class="stat"><div><div class="label">분야 정보 보완 필요</div><strong>5<small>명</small></strong></div><span class="stat-mark">!</span></div></div>`+
      `<div class="notice"><strong>부서 서식 확인 완료 · 원본 개인정보는 사용하지 않았습니다.</strong><p>실제 서식은 129행·14개 항목입니다. 성명·휴대전화가 비어 있어, 아래 목록에는 별도의 합성 이름·소속·연락처를 표시합니다. AI와 인공지능은 이 시안에서 같은 분야로 표시합니다.</p></div>`+
      `<section class="card"><div class="card-head"><h2>후보 목록 <span class="badge-count">129명</span></h2><label><span class="sr-only">후보 검색</span><input id="pool-query" class="inline-input" placeholder="이름·소속·전문분야 검색" value="${esc(state.query)}"></label></div><div id="pool-table"></div></section>`;
    document.getElementById('open-import').onclick=()=>document.getElementById('import-dialog').showModal();
    document.getElementById('pool-query').oninput=e=>{state.query=e.target.value;poolTable();};poolTable();
  }
  function poolTable(){
    const rows=pool.filter(c=>[c.name,c.organization,c.raw,c.fields.join(' ')].join(' ').includes(state.query.trim()));
    document.getElementById('pool-table').innerHTML=`<div class="table-wrap"><table><thead><tr><th>연번</th><th>성명·소속</th><th>직위·구분</th><th>전문분야</th><th>휴대전화</th><th>상태</th></tr></thead><tbody>${rows.slice(0,14).map(c=>`<tr><td>${c.id}</td><td><strong>${c.name}</strong><span class="subtle">${c.organization}</span></td><td>${c.position}<br><span class="subtle">${c.category}</span></td><td>${c.fields.length?c.fields.map(f=>`<span class="pill">${f}</span>`).join(''):'<span class="pill amber">미기재</span>'}</td><td class="phone-mask">${c.phone}</td><td><span class="pill ${c.active?'green':'amber'}">${c.active?'시안 활성':'보완 필요'}</span></td></tr>`).join('')}</tbody></table></div><div class="table-foot"><span>검색 결과 ${rows.length}명 · 시안에서 ${Math.min(14,rows.length)}명 표시</span><a href="#draw">3배수 추첨 설정 →</a></div>`;
  }
  function renderDraw(){
    const c=counts(pool,state.fields,state.target);const locked=state.roster.length>0;
    main.innerHTML=head('02','3배수 예비명단 추첨','선택한 분야를 하나로 묶고, 최종 정원의 3배수를 중복 없이 추첨합니다.')+
      `<div class="split"><section class="card"><div class="card-head"><h2>선정 조건</h2>${locked?'<span class="pill green">예비명단 생성됨</span>':''}</div><div class="card-body"><div class="field-grid"><label class="field">평가과제<input id="project" value="${esc(state.project)}" ${locked?'disabled':''}></label><label class="field">최종 선정 인원<select id="target" ${locked?'disabled':''}>${[7,8,9].map(n=>`<option value="${n}" ${state.target===n?'selected':''}>${n}명</option>`).join('')}</select></label></div><h3 class="form-title">전문분야 <span class="optional">여러 분야 선택 가능 · 합쳐서 총 ${state.target}명</span></h3><div class="chips">${fieldNames.map(f=>`<label class="chip"><input type="checkbox" data-field="${esc(f)}" ${state.fields.has(f)?'checked':''} ${locked?'disabled':''}>${f}<small>${pool.filter(p=>p.fields.includes(f)).length}명</small></label>`).join('')}</div><p class="subtle" style="margin-top:16px">두 분야에 해당하는 후보도 모집단에는 한 번만 포함합니다. 선택 분야마다 정원을 따로 배정하지 않습니다.</p><div class="notice ${c.shortage?'warning':''}" style="margin-top:24px;margin-bottom:0"><strong>${c.shortage?`후보 ${c.shortage}명이 부족합니다.`:'필요한 3배수 인원이 확보되었습니다.'}</strong><p>중복을 제거한 추첨 대상 ${c.eligible}명 · 필요한 예비명단 ${c.required}명</p></div></div></section><section class="card"><div class="card-head"><h2>이번 추첨</h2></div><div class="card-body"><div class="equation"><div><strong>${state.target}</strong><small>최종위원</small></div><span>× 3 =</span><div><strong>${c.required}</strong><small>예비명단</small></div></div><div class="summary-line"><span>추첨 가능한 후보</span><strong>${c.eligible}명</strong></div><div class="summary-line"><span>선택한 분야</span><strong>${state.fields.size}개</strong></div><div class="summary-line"><span>선정 방식</span><strong>전체 모집단에서 총원 선정</strong></div><label class="check-label"><input id="reviewed" type="checkbox" ${state.reviewed?'checked':''} ${locked?'disabled':''}>추첨 분야와 최종 정원을 확인했습니다.</label><button id="draw-example" class="primary full" ${locked||c.shortage||!state.fields.size||!state.reviewed||!state.project.trim()?'disabled':''}>${locked?'예비명단 생성됨':`${c.required}명 예비명단 예시 보기`}</button><p class="subtle" style="margin-top:12px">시안은 예시 순서로 명단을 표시합니다. 실제 무작위 추첨은 서버 구현 단계에서 연결합니다.</p></div></section></div>`+
      (locked?`<div class="notice success"><strong>예비명단 ${state.roster.length}명이 준비되었습니다.</strong><p>이 명단에서 통화 결과를 기록한 뒤 최종위원 ${state.target}명을 선택합니다.</p><a href="#final">통화·최종 선정으로 이동 →</a></div>`:'');
    document.getElementById('target').onchange=e=>{state.target=Number(e.target.value);state.reviewed=false;render();};
    document.getElementById('project').onchange=e=>{state.project=e.target.value;state.reviewed=false;render();};
    document.querySelectorAll('[data-field]').forEach(el=>{el.onchange=()=>{el.checked?state.fields.add(el.dataset.field):state.fields.delete(el.dataset.field);state.reviewed=false;render();};});
    document.getElementById('reviewed').onchange=e=>{state.reviewed=e.target.checked;render();};
    document.getElementById('draw-example').onclick=()=>{state.roster=eligiblePool(pool,state.fields).slice(0,c.required);state.roster.forEach(r=>state.status.set(r.id,'미연락'));location.hash='final';toast('합성자료로 예비명단을 표시했습니다. 실제 추첨·DB 저장은 실행되지 않았습니다.');};
  }
  function renderFinal(){
    main.innerHTML=head('03','통화 결과·최종 선정','3배수 명단을 보존하고, 담당자가 참여 가능한 후보 중 최종위원을 선택합니다.');
    if(!state.roster.length){main.innerHTML+=empty('아직 예비명단이 없습니다.','분야와 최종 인원을 설정한 뒤 3배수 예비명단을 먼저 생성하세요.','draw','추첨 설정으로 이동');return;}
    const possible=state.roster.filter(c=>state.status.get(c.id)==='참여 가능').length;
    main.innerHTML+=`<div class="stats"><div class="stat"><div><div class="label">1차 예비명단</div><strong>${state.roster.length}<small>명</small></strong></div></div><div class="stat"><div><div class="label">참여 가능</div><strong>${possible}<small>명</small></strong></div></div><div class="stat"><div><div class="label">최종 선택 / 정원</div><strong>${state.selected.size}<small>/ ${state.target}명</small></strong></div></div></div><div class="selection-bar"><div><p class="subtle">${esc(state.project)}</p><strong>${state.confirmed?'최종 명단 확정됨':`${state.target}명을 선택해 최종 확정하세요.`}</strong></div><div class="row"><button id="call-example" class="mini" ${state.confirmed?'disabled':''}>통화·선택 예시 적용</button><button id="confirm" class="primary" ${state.confirmed||!canFinalize(state.roster,state.selected,state.status,state.target)?'disabled':''}>최종 ${state.target}명 확정 예시</button></div></div><section class="card"><div class="card-head"><h2>3배수 예비명단 <span class="badge-count">${state.roster.length}명</span></h2><p class="subtle">참여 가능으로 표시한 후보만 최종 선택할 수 있습니다.</p></div><div class="table-wrap"><table><thead><tr><th>최종 선택</th><th>후보·소속</th><th>전문분야</th><th>휴대전화</th><th>통화 결과</th><th>담당자 메모</th></tr></thead><tbody>${state.roster.map(c=>`<tr class="${state.selected.has(c.id)?'selected-row':''}"><td><label><span class="sr-only">${c.name} 최종 선택</span><input type="checkbox" data-member="${c.id}" ${state.selected.has(c.id)?'checked':''} ${state.confirmed||state.status.get(c.id)!=='참여 가능'?'disabled':''}></label></td><td><strong>${c.name}</strong><span class="subtle">${c.organization}</span></td><td>${c.fields.map(f=>`<span class="pill">${f}</span>`).join('')}</td><td class="phone-mask">${c.phone}</td><td><select class="contact-select" data-status="${c.id}" aria-label="${c.name} 통화 결과" ${state.confirmed?'disabled':''}>${['미연락','연락 불가','참여 가능','참여 불가','제척'].map(s=>`<option ${state.status.get(c.id)===s?'selected':''}>${s}</option>`).join('')}</select></td><td><input class="contact-note" data-note="${c.id}" aria-label="${c.name} 담당자 메모" placeholder="연락 내용·미선정 사유" value="${esc(state.notes.get(c.id)||'')}" ${state.confirmed?'disabled':''}></td></tr>`).join('')}</tbody></table></div><div class="table-foot"><span>1차 예비명단과 최종 명단은 별도로 보존합니다.</span>${state.confirmed?'<a href="#assignment">평가과제 배정 →</a>':''}</div></section>`;
    document.getElementById('call-example').onclick=()=>{state.roster.forEach((c,i)=>{state.status.set(c.id,i<state.target?'참여 가능':i<state.target+3?'참여 불가':'미연락');if(i<state.target)state.selected.add(c.id);else state.selected.delete(c.id);});render();};
    document.querySelectorAll('[data-status]').forEach(el=>{el.onchange=()=>{const id=Number(el.dataset.status);state.status.set(id,el.value);if(el.value!=='참여 가능')state.selected.delete(id);render();};});
    document.querySelectorAll('[data-member]').forEach(el=>{el.onchange=()=>{const id=Number(el.dataset.member);el.checked?state.selected.add(id):state.selected.delete(id);render();};});
    document.querySelectorAll('[data-note]').forEach(el=>{el.oninput=()=>state.notes.set(Number(el.dataset.note),el.value);});
    document.getElementById('confirm').onclick=()=>{if(!canFinalize(state.roster,state.selected,state.status,state.target))return;state.confirmed=true;render();toast(`최종 ${state.target}명 확정 화면입니다. 실제 명단 저장은 연결되지 않았습니다.`);};
  }
  function renderAssignment(){
    main.innerHTML=head('04','평가과제 배정·본인인증','최종 선정된 위원에게 과제를 배정하고, 위원이 접근할 때 본인인증을 확인합니다.');
    if(!state.confirmed){main.innerHTML+=empty('최종위원을 먼저 확정하세요.','3배수 예비명단에서 담당자가 최종 7·8·9명을 확정한 뒤 과제를 배정합니다.','final','최종 선정으로 이동');return;}
    main.innerHTML+=`<div class="split"><section class="card"><div class="card-head"><h2>최종위원 과제 배정</h2><span class="pill green">${state.target}명 확정</span></div><div class="card-body"><label class="field">평가과제<input value="${esc(state.project)}" readonly></label><h3 class="form-title">배정 대상</h3><div class="assignment-list">${state.roster.filter(c=>state.selected.has(c.id)).map(c=>`<span class="pill">${c.name}</span>`).join('')}</div><button id="assign" class="primary full" ${state.assigned?'disabled':''}>${state.assigned?'배정 화면 확인 완료':'최종위원에게 과제 배정 예시'}</button></div></section><section class="card"><div class="card-head"><h2>위원의 접속 흐름</h2></div><div class="card-body"><div class="steps"><div class="step active">1. 평가과제 선택</div><div class="step">2. 본인인증</div><div class="step">3. 배정 확인</div><div class="step">4. 평가 화면</div></div><div class="notice warning"><strong>실제 본인인증 수단은 결정 후 연결합니다.</strong><p>문자 연락처 확인과 휴대폰 본인확인 서비스는 구분해서 선택합니다. 이 시안은 문자를 보내거나 인증 성공 상태를 만들지 않습니다.</p></div><p class="subtle">인증된 사람과 최종 배정위원이 일치해야 해당 과제에 접근할 수 있습니다. 예비명단에만 포함된 후보에게는 평가 권한이 생기지 않습니다.</p></div></section></div>`;
    document.getElementById('assign').onclick=()=>{state.assigned=true;render();toast('과제 배정 화면 예시입니다. 실제 배정·초대·문자 발송은 실행되지 않았습니다.');};
  }
  document.getElementById('reset').onclick=()=>{reset();location.hash='pool';render();toast('시안을 초기화했습니다.');};
  document.getElementById('close-import').onclick=()=>{document.getElementById('file-password').value='';document.getElementById('import-dialog').close();};
  document.getElementById('import-dialog').addEventListener('close',()=>{document.getElementById('file-password').value='';});
  document.getElementById('excel-file').onchange=e=>{document.getElementById('file-name').textContent=e.target.files[0]?.name||'';};
  document.getElementById('import-preview').onclick=()=>{const el=document.getElementById('import-result');el.hidden=false;el.innerHTML='<div class="notice warning" style="margin-top:20px"><strong>미리보기 예시 · 확인한 원본 구조</strong><p>129행 중 성명 누락 129행 · 휴대전화 누락 129행 · 전문분야 미기재 5행입니다. 실명·연락처 보완 전까지 정식 후보 확정을 보류하고, 원본 선정 표시를 신규 배정으로 적용하지 않습니다.</p></div><p class="subtle">현재 시안은 실제 파일을 읽거나 DB에 저장하지 않습니다.</p>';document.getElementById('file-password').value='';};
  window.addEventListener('hashchange',render);render();
}
