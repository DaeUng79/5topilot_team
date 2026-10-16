import assert from 'node:assert/strict';
import {navigate,api,socket,errors,evaluate,click,fill,wait,sign,shot} from './original_cdp.mjs';
const adminPath='/v2/사업담당자/PM-00-로그인/시안/login.html';
const attendancePath='/v2/사업담당자/PM-05-참석-위원장/시안/attendance.html?id=demo-evaluation';
const evaluatorPath='/v2/위원/EV-00-로그인/시안/login.html?project_id=demo-evaluation';
try{
 await navigate(adminPath);await api('AUTH-01',{username:'web-demo',password:'DemoOnly!2026'});await navigate(attendancePath);
 if(await evaluate("!!document.querySelector('#b-prep')")){await click('#b-prep');await wait("!!document.querySelector('#b-ref')");}
 for(let i=1;i<=7;i++){
  await navigate(evaluatorPath);await api('AUTH-02',{project_id:'demo-evaluation',name:`가상위원${String(i).padStart(2,'0')}`,last4:String(i).padStart(4,'0')});
  await navigate('/v2/위원/EV-01-참석-확인/시안/attendance.html');
  await evaluate("document.querySelector('input[type=checkbox]').click()");await click('#yes');
 }
 await navigate(adminPath);await api('AUTH-01',{username:'web-demo',password:'DemoOnly!2026'});await navigate(attendancePath);
 await click('#b-lock');await click('#dlg-ok');await wait("!!document.querySelector('input[name=chair]')");
 await evaluate("document.querySelector('input[name=chair]').click()");await click('#b-chair');await click('#dlg-ok');await wait("!!document.querySelector('#b-start')");
 await click('#b-start');await click('#dlg-ok');await wait("document.querySelector('#pst').textContent.includes('평가 중')");await shot('original-attendance-started');
 for(let i=1;i<=7;i++){
  await navigate(evaluatorPath);await api('AUTH-02',{project_id:'demo-evaluation',name:`가상위원${String(i).padStart(2,'0')}`,last4:String(i).padStart(4,'0')});await navigate('/v2/위원/EV-06-평가하기/시안/scoring.html');
  const selectors=await evaluate("[...document.querySelectorAll('[data-k]')].map(el=>'[data-k=\"'+el.dataset.k+'\"]')");
  for(const sel of selectors)await fill(sel,20+i-1);
  await fill('[data-ok]','원본 화면 평가 의견');await click('[data-a=save]');await wait("document.querySelector('[data-a=save]').disabled");
  await click('[data-a=submit]');await click('[data-g=next]');await wait("!!document.querySelector('canvas#pad')");await sign('#pad');await click('[data-g=next]');await click('[data-g=go]');await wait("document.querySelector('#chip').textContent.includes('제출됨')");
  console.log('Submitted original evaluator',i);
 }
 await navigate(evaluatorPath);await api('AUTH-02',{project_id:'demo-evaluation',name:'가상위원01',last4:'0001'});await navigate('/v2/위원/EV-07-평가결과-확인/시안/chair.html');
 await click('#agg');await wait("!!document.querySelector('#ck')");await click('#ck');await sign('#pad');await click('#sg');await click('#go');await click('.ev-modal [data-g=go]');await wait("document.querySelector('#dl')!==null");await shot('original-chair-final');
 await navigate(adminPath);await api('AUTH-01',{username:'web-demo',password:'DemoOnly!2026'});await navigate('/v2/사업담당자/PM-06-평가-결과/시안/results.html?id=demo-evaluation');
 assert((await evaluate('document.body.innerText')).includes('69'));await shot('original-manager-results');assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS original 7 evaluators -> signatures -> final results');
}finally{socket.close();}
