import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {base,navigate,api,socket,errors,evaluate,click,fill,wait,sign,shot} from './original_cdp.mjs';
const stamp=Date.now(),name='전체 동선 검증 '+stamp;
const screen=key=>wait(`document.documentElement.dataset.liveScreen===${JSON.stringify(key)}&&document.documentElement.dataset.liveReady==='true'`);
async function step(key){await click(`#steps a[href*="${key}-"]`);await screen(key);}
async function logout(){if(await evaluate("!!document.querySelector('#ev-user-btn')")){await click('#ev-user-btn');await click('.ev-menu a');}else await click('[data-logout],a[href$="#logout"]');await screen('ENTRY');}
async function login(role,first,second,pid){await click('#start');await click(`[data-role=${role}]`);await screen(role==='eval'?'EV-00':'PM-00');await fill(role==='eval'?'#nm':'#uid',first);await fill(role==='eval'?'#ph':'#upw',second);await click(role==='eval'?'#f button[type=submit]':'#go');
 if(role==='eval'){await wait("document.documentElement.dataset.liveScreen==='EV-01'||!!document.querySelector('[data-login-project]')");if(await evaluate("!!document.querySelector('[data-login-project]')")){await fill('[data-login-project]',pid);await click('#f button[type=submit]');}await screen('EV-01');}
 else await screen('PM-01');
}
async function openProject(){await fill('#q',name);await click('#rows tr');await screen('PM-01-overview');}
try{
 await navigate('/');await login('biz','web-demo','DemoOnly!2026');
 await click('#b-new');for(const [f,v] of Object.entries({'n-name':name,'n-date':'2026-11-05','n-org':'가상기관','n-pos':'담당','n-owner':'가상담당자','n-tel':'01012345678'}))await fill('#'+f,v);await wait("document.querySelector('#p').getBoundingClientRect().right<=innerWidth+1");await shot('journey-project-date');await click('[form=f-new]');
 const project=(await api('PRJ-01',{search:name})).items[0];assert.equal(project.evaluation_date,'2026-11-05');const pid=project.id;
 await openProject();await step('PM-02');assert.equal(await evaluate('Live.pid'),pid);
 for(const vendor of ['여정검증 업체 A','여정검증 업체 B']){await click('#b-add');await fill('#i-name',vendor);await click('#f-inl button[type=submit]');}
 await step('PM-03');await step('PM-04');assert.equal(await evaluate('Live.pid'),pid);assert.equal(await evaluate("document.querySelector('.pj-title h1').textContent"),name);await shot('journey-committee-entry');
 // Existing sidebar: register a real committee candidate, then return via project list.
 await click('.side nav a[href*="PM-07-"]');await screen('PM-07');await click('#b-add');
 for(const [f,v] of Object.entries({name:'여정신규위원'+stamp,tel:'010'+String(stamp).slice(-8),org:'가상대학',dept:'가상학과',pos:'교수'}))await fill('#p #f-'+f,v);await click('#b-save');
 await click('.side nav a[href*="PM-01-"]');await screen('PM-01');await openProject();await step('PM-04');
 for(let i=0;i<5;i++)await click('[data-d="-1"][data-i="0"]');for(let i=0;i<3;i++)await click('[data-d="1"][data-i="1"]');for(let i=0;i<2;i++)await click('[data-d="1"][data-i="2"]');
 await click('#save');await click('#nx');await click('#draw');await click('#nx');
 let state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);assert.equal(state.items.length,21);
 const selected=[],counts={AI:0,SEC:0,SYS:0},quota={AI:2,SEC:3,SYS:2};
 for(let i=0;i<state.items.length;i++){const item=state.items[i],field=state.draw_members.find(d=>d.id===item.draw_member_id).specialty_id;if(counts[field]<quota[field]){await fill(`[data-st="${i}"]`,'수락');counts[field]++;selected.push({i,name:item.candidate.name,last4:item.candidate.phone.slice(-4)});}}
 await click('#nx');for(const member of selected)await fill(`[data-pk="${member.i}"]`,'본');await click('#cf');await click('#dlg-ok');await shot('journey-roster-confirmed');
 await click('#foot a[href*="PM-05-"]');await screen('PM-05');assert.equal(await evaluate('Live.pid'),pid);
 assert.equal(await evaluate("document.querySelector('#b-prep').disabled"),true);
 execFileSync('apps/committee_Lex6won/.venv/Scripts/python.exe',['apps/evaluations_u-jing/tests/journey_document_fixture.py','apps/evaluations_u-jing/test-results/workflow-1017',pid],{stdio:'inherit'});
 // Click the current step to read the producer's newly approved fixture.
 await step('PM-05');await click('#b-prep');await wait("!!document.querySelector('#b-ref')");await logout();
 for(const member of selected){await login('eval',member.name,member.last4,pid);assert((await evaluate("document.querySelector('.when').innerText")).includes('2026-11-05'));await click('#agree');await click('#yes');await screen('EV-03');await click('.ev-tabs a[href*="EV-06-"]');await screen('EV-06');assert((await evaluate('document.body.innerText')).includes('평가 시작 전'));assert(!(await evaluate('document.body.innerText')).includes('✓ 제출 완료'));await logout();}
 await login('biz','web-demo','DemoOnly!2026');await openProject();await step('PM-05');await click('#b-ref');await click('#b-lock');await click('#dlg-ok');await wait("!!document.querySelector('input[name=chair]')");
 const chairName=await evaluate("document.querySelector('input[name=chair]').getAttribute('aria-label').replace(' 위원장으로 고르기','')");
 await click('input[name=chair]');await click('#b-chair');await click('#dlg-ok');await click('#b-start');await click('#dlg-ok');await shot('journey-evaluation-started');await logout();
 for(const [i,member] of selected.entries()){
  await login('eval',member.name,member.last4,pid);await click('#yes');await screen('EV-03');assert.equal(await evaluate("!!document.querySelector('.ev-tabs [aria-label*=평가결과],.ev-tabs a[href*=\"EV-07-\"]')"),member.name===chairName);
  await click('.ev-tabs a[href*="EV-06-"]');await screen('EV-06');const inputs=await evaluate("[...document.querySelectorAll('[data-k]')].map(e=>'[data-k=\"'+e.dataset.k+'\"]')");assert.equal(inputs.length,6);
  for(const input of inputs)await fill(input,20+i);await click('[data-a=save]');await click('[data-a=submit]');await click('[data-g=next]');await sign('#pad');await click('[data-g=next]');await click('[data-g=go]');await wait("document.querySelector('#chip').textContent.includes('제출됨')");await logout();
 }
 const chair=selected.find(m=>m.name===chairName);await login('eval',chair.name,chair.last4,pid);await click('#yes');await screen('EV-03');await click('.ev-tabs a[href*="EV-07-"]');await screen('EV-07');await click('#agg');await click('#ck');await sign('#pad');await click('#sg');await click('#go');await click('.ev-modal [data-g=go]');await wait("!!document.querySelector('#dl')");await shot('journey-chair-final');await logout();
 await login('biz','web-demo','DemoOnly!2026');await openProject();await step('PM-06');assert((await evaluate('document.body.innerText')).includes('69.00'));await shot('journey-manager-final');
 assert.equal(errors.length,0,JSON.stringify(errors));await writeFile(new URL('../test-results/journey.json',import.meta.url),JSON.stringify({base,pid,name,selected,chair:chair.name,result:'PASS',navigation:'Visible buttons and links from general entry; API reads only. Synthetic documents delivered by isolated producer fixture.'},null,2));console.log('PASS full visible UI journey',pid);
}finally{socket.close();}
