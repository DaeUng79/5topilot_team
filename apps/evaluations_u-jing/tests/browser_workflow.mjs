// Isolated headless Chrome + Node built-ins. Run against a fresh --demo database only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=process.env.SIMSA_TEST_URL||'http://127.0.0.1:5191';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidence=path.join(root,'test-results');await mkdir(evidence,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9336/json/list')).json();
const target=targets.find(t=>t.type==='page');assert(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map(),errors=[],failures=[],visited=new Set();
function call(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});}
socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Page.javascriptDialogOpening')void call('Page.handleJavaScriptDialog',{accept:true,promptText:'가상 테스트 삭제'});else if(m.method==='Network.responseReceived'&&m.params.response.status>=500)failures.push(m.params.response.url);});
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function wait(expression,label=expression){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,90));}throw Error('TIMEOUT '+label+' / '+await evaluate("document.getElementById('notice')?.textContent"));}
async function set(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function click(selector){await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await new Promise(r=>setTimeout(r,120));await wait("!document.querySelector('[data-busy=true]')");}
async function route(screen){await evaluate(`location.hash=${JSON.stringify('#/'+screen)}`);await wait(`document.querySelector('[data-screen="${screen}"]')&&!document.querySelector('#page[aria-busy]')`);assert.equal(await evaluate("document.querySelector('#retry-page')!==null"),false,screen);visited.add(screen);}
async function screenshot(name){await evaluate('window.scrollTo(0,0)');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(evidence,name+'.png'),Buffer.from(shot.data,'base64'));}
async function logout(){await click('#logout');await wait("document.querySelector('[data-screen=ENTRY]')");}
async function login(kind,number=1){await route(kind==='super'?'SA-00':kind==='department'?'PM-00':'EV-00');if(kind==='evaluator'){await set('[name=project_id]','demo-evaluation');await set('[name=name]',`가상위원${String(number).padStart(2,'0')}`);await set('[name=last4]',String(number).padStart(4,'0'));}else{await set('[name=username]',kind==='super'?'super-demo':'web-demo');await set('[name=password]','DemoOnly!2026');}visited.add(kind==='super'?'SA-01':kind==='department'?'PM-01':'EV-01');await click('.login-card button[type=submit]');await wait(`document.querySelector('[data-screen="${kind==='super'?'SA-01':kind==='department'?'PM-01':'EV-01'}"]')`);}
async function sign(selector){const box=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);const x=box.x+20,y=box.y+60;await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let i=1;i<=20;i++)await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+i*8,y:y+Math.sin(i)*22,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+160,y,button:'left',clickCount:1});await evaluate("document.querySelector('[name=sign-consent]').checked=true");}
try{
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await wait("document.querySelector('[data-screen=ENTRY]')");visited.add('ENTRY');await screenshot('01-entry');
 await login('super');for(const screen of ['SA-01','SA-02','SA-03','SA-04'])await route(screen);await screenshot('02-material-boundary');await logout();
 await login('department');await set('#project-select','demo-evaluation');await wait("!document.querySelector('#page[aria-busy]')");
 for(const screen of ['PM-01','PM-02','PM-03','PM-04','PM-05','PM-06','PM-07','PM-08'])await route(screen);
 await route('PM-07');await wait("document.querySelector('iframe')?.contentDocument?.querySelector('#workspace')?.hidden===false");assert((await evaluate("document.querySelector('iframe').contentDocument.querySelector('#mode').textContent")).includes('연결되었습니다'));
 await route('PM-05');await evaluate("document.querySelector('[name=approve_policy]').checked=true");await click('[data-action="ATT-00"]');await wait("!document.querySelector('#prepare')");await screenshot('03-attendance-prepared');await logout();
 for(let i=1;i<=7;i++){
  await login('evaluator',i);await evaluate("document.querySelector('#attendance-consent').checked=true");await click('[data-status="CONFIRMED"]');await wait("document.querySelector('#page').textContent.includes('현재 상태: 참석 확인')");
  if(i===1)for(const screen of ['EV-02','EV-03','EV-04','EV-05','EV-06','EV-07'])await route(screen);
  await logout();
 }
 await login('department');await route('PM-05');await click('[data-action="ATT-03"]');await wait("document.querySelectorAll('[name=participant_id] option').length===7");
 const chairOption=await evaluate("[...document.querySelector('[name=participant_id]').options].find(o=>o.textContent==='가상위원01').value");await set('[name=participant_id]',chairOption);await click('[data-action="ATT-04"]');await wait("!document.querySelector('[data-action=\"ATT-05\"]').disabled");await click('[data-action="ATT-05"]');await wait("document.querySelector('#page').textContent.includes('평가 중')");await screenshot('04-open-session');await logout();
 for(let i=1;i<=7;i++){
  await login('evaluator',i);await route('EV-06');
  await evaluate(`document.querySelectorAll('.score-matrix input[name=score]').forEach(e=>{e.value=${20}+${i-1};e.dispatchEvent(new Event('input',{bubbles:true}));})`);
  const sheetIds=await evaluate("[...document.querySelectorAll('form[data-sheet]')].map(f=>f.dataset.sheet)");assert.equal(sheetIds.length,2);
  for(const sheet of sheetIds)await click(`form[data-sheet="${sheet}"] button[type=submit]`);
  await click('[data-action="SCO-03"]');await wait("!document.querySelector('#sign-area').hidden");
  await evaluate("document.querySelector('#sign-area').scrollIntoView({block:'center'})");await sign('#sign-area canvas');await click('[data-action="SCO-04"]');await wait("!document.querySelector('[data-action=\"SCO-05\"]').disabled");
  if(i===1)await screenshot('05-score-review-signature');
  await click('[data-action="SCO-05"]');await wait("document.querySelector('#page').textContent.includes('평가 제출 완료')");assert.equal(await evaluate("[...document.querySelectorAll('fieldset')].every(e=>e.disabled)"),true);
  if(i<7)await logout();
 }
 await logout();await login('evaluator',1);await route('EV-07');await click('[data-action="RES-02"]');await wait("document.querySelector('#result-sign')");assert((await evaluate("document.querySelector('#page').textContent")).includes('69.00'));await evaluate("document.querySelector('#result-sign').scrollIntoView({block:'center'})");await sign('#result-sign canvas');await click('[data-action="RES-03"]');await click('[data-action="RES-04"]');await wait("document.querySelector('[data-action=\"RES-05\"]')");await screenshot('06-final-result');await logout();
 await login('department');await route('PM-06');await wait("document.querySelector('[data-action=\"RES-05\"]')");
 const report=await evaluate(`(async()=>{const b=await(await fetch('/api/v2/actions/ATT-02',{method:'POST',headers:{'Content-Type':'application/json','X-Simsa-Client':'v2-web'},body:JSON.stringify({project_id:'demo-evaluation'})})).json();const r=await fetch('/api/v2/actions/RES-05',{method:'POST',headers:{'Content-Type':'application/json','X-Simsa-Client':'v2-web'},body:JSON.stringify({session_id:b.data.sessions[0].id})});return {status:r.status,text:await r.text()};})()`);assert.equal(report.status,200);assert(report.text.includes('data:image/png;base64,')&&report.text.includes('69.00'));await writeFile(path.join(evidence,'browser-final-report.html'),report.text);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('07-mobile-result');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'mobile horizontal overflow');
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(failures.length,0,JSON.stringify(failures));assert.equal(visited.size,23,JSON.stringify([...visited]));
 const summary={passed:true,visited:[...visited].sort(),runtimeErrors:errors,serverErrors:failures,workflow:'7 attendance → participants → chair → open → 14 sheets → 7 signatures/submissions → tie aggregation → chair signature/final → report',averages:['69.00','69.00'],rank:[1,1]};await writeFile(path.join(evidence,'browser-verification.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{socket.close();}
