// Node built-ins + an isolated headless Chrome. No new npm packages.
// Run ONLY against the synthetic --demo DB, before p1 has been confirmed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.COMMITTEE_WEB_URL || 'http://127.0.0.1:5180';
const targets = await (await fetch('http://127.0.0.1:9335/json/list')).json();
const target = targets.find((t) => t.type === 'page');
assert(target, 'Start isolated headless Chrome on debugging port 9335 first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open',resolve,{once:true}));
let nextId = 1;
const pending = new Map(), errors = [];
function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve,reject) => {
    pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));
  });
}
socket.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  if (message.id) {
    const task = pending.get(message.id); pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
  } else if (message.method === 'Page.javascriptDialogOpening') {
    void call('Page.handleJavaScriptDialog',{accept:true});
  } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
});
async function evaluate(expression) {
  const result = await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(expression, description = expression) {
  const deadline = Date.now()+15000;
  while (Date.now()<deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve,100));
  }
  throw new Error(`Timed out: ${description}; message=${await evaluate("document.getElementById('message')?.textContent")}`);
}
async function click(selector) {
  await wait(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled && !document.body.classList.contains('busy')`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await wait("!document.body.classList.contains('busy')");
}
async function set(selector,value) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
await call('Page.enable'); await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
try {
  await call('Page.navigate',{url:base+'/v2/index.html'});
  await wait("document.querySelector('button[data-src=\"/committee-v2/?view=pool\"]')");
  await evaluate("document.querySelector('button[data-src=\"/committee-v2/?view=pool\"]').click()");
  await wait("document.querySelector('iframe').contentDocument?.querySelector('#login-form')");
  console.log('PASS: existing v2 index opens live committee frame through Vite proxy');
  await call('Page.navigate',{url:base+'/committee-v2/?project_id=p1'});
  await wait("document.querySelector('#login-form') && !document.body.classList.contains('busy')");
  const dataDir = process.env.COMMITTEE_DATA_DIR || path.join(root,'data/web-v2');
  const code = (await readFile(path.join(dataDir,'access-code.txt'),'utf8')).trim();
  await set('[name=access_code]',code);
  await click('#login-form button');
  await wait("!document.querySelector('#workspace').hidden && document.querySelectorAll('#candidate-rows tr').length===27");
  assert((await evaluate("document.querySelector('#mode').textContent")).includes('합성'));
  assert(!(await evaluate("document.querySelector('#rules-state').textContent")).includes('잠김'), 'Use a fresh synthetic DB');
  await click('#tab-pool'); await click('#new-candidate');
  const testName = '<b>브라우저검증위원</b>';
  for (const [field,value] of Object.entries({name:testName,organization_name:'합성 테스트기관',phone:'01099998888'})) await set(`#candidate-form [name=${field}]`,value);
  await evaluate("document.querySelector('input[name=specialty]').checked=true");
  await click('#save-candidate');
  await wait("document.querySelector('#pool-count').dataset.total==='28'");
  assert.equal(await evaluate("document.querySelectorAll('#candidate-rows b').length"),0);
  await evaluate(`([...document.querySelectorAll('#candidate-rows tr')].find(r=>r.textContent.includes(${JSON.stringify(testName)}))).querySelector('[data-edit]').click()`);
  await set('#candidate-form [name=organization_name]','수정한 합성기관'); await click('#save-candidate');
  await wait("document.querySelector('#candidate-rows').textContent.includes('수정한 합성기관')");
  await evaluate(`([...document.querySelectorAll('#candidate-rows tr')].find(r=>r.textContent.includes(${JSON.stringify(testName)}))).querySelector('[data-disable]').click()`);
  await wait("!document.body.classList.contains('busy') && document.querySelector('#pool-count').dataset.total==='27'");
  console.log('PASS: browser candidate create/edit/deactivate persists; text is escaped');
  await click('#tab-selection'); await click('#rules-form button');
  await wait("document.querySelector('#rules-state').textContent.includes('버전 1')");
  await click('#draw');
  await wait("document.querySelectorAll('#nominee-rows tr[data-nominee]').length===21");
  const nominees = await evaluate("[...document.querySelectorAll('#nominee-rows tr[data-nominee]')].map(r=>({id:r.dataset.nominee,field:r.children[1].textContent}))");
  const members = [];
  for (const [field,count] of [['인공지능',3],['정보보안',2],['시스템 운영',2]]) members.push(...nominees.filter(n=>n.field===field).slice(0,count).map(n=>({...n,kind:'PRIMARY'})));
  members.push(...nominees.filter(n=>!members.some(m=>m.id===n.id)).slice(0,2).map((n,i)=>({...n,kind:'RESERVE',order:i+1})));
  assert.equal(members.length,9);
  for (const member of members) {
    const row = `tr[data-nominee="${member.id}"]`;
    await set(row+' [data-contact]','AVAILABLE'); await click(row+' [data-save-contact]');
    await set(row+' [data-kind]',member.kind);
    if (member.order) await set(row+' [data-order]',String(member.order));
  }
  await click('#review-roster'); await wait("document.querySelector('#review-dialog').open");
  assert.equal(await evaluate("document.querySelectorAll('#review-content tbody tr').length"),9);
  await click('#confirm-roster');
  await wait("document.querySelector('#confirmed').textContent.includes('확정 완료')");
  assert((await evaluate("document.querySelector('#confirmed').textContent")).includes('수신 대기'));
  await call('Page.reload');
  await wait("document.querySelector('#confirmed')?.textContent.includes('확정 완료')");
  assert.equal(await evaluate("document.querySelector('#rules-fields').disabled"),true);
  assert.equal(await evaluate("document.querySelector('#draw').disabled"),true);
  console.log('PASS: 3/2/2 quotas -> 21 nominees -> 7 primary + 2 reserve -> confirmed -> survives reload');
  await mkdir(path.join(root,'artifacts'),{recursive:true});
  const screenshot = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(path.join(root,'artifacts/web-v2-confirmed.png'),Buffer.from(screenshot.data,'base64'));
  await call('Page.navigate',{url:base+'/committee-v2/?project_id=p2'});
  await wait("document.querySelector('#rules-state')?.textContent.includes('먼저')");
  await set('#selection-mode','DIRECT'); await set('#reserves','0');
  await click('#rules-form button'); await wait("document.querySelector('#draw').hidden");
  await click('#direct-pool');
  await wait("document.querySelector('#scope').value==='PROJECT' && !document.body.classList.contains('busy')");
  const fixture = path.join(root,'artifacts/web-v2-import.xlsx');
  execFileSync(path.join(root,'.venv/Scripts/python.exe'),['-c',
    "import sys; from pathlib import Path; from candidate_import import HEADERS; from committee_app.v2_excel import export_xlsx; Path(sys.argv[1]).write_bytes(export_xlsx('fixture.xlsx',HEADERS,[[f'직접위원{i}','가상기관','부서','직위','AI',f'0109999{9100+i}',''] for i in range(1,8)]).content)",fixture],{cwd:root});
  await evaluate("document.querySelector('#import-form').closest('details').open=true");
  const documentRoot = await call('DOM.getDocument');
  const input = await call('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector:'#excel-file'});
  await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fixture]});
  await click('#import-form button');
  await wait("document.querySelector('#import-preview').textContent.includes('유효 7명')");
  await click('#commit-import');
  await wait("document.querySelector('#pool-count').dataset.total==='7'");
  await click('#tab-selection');
  assert.equal(await evaluate("document.querySelectorAll('#nominee-rows tr[data-nominee]').length"),7);
  await click('#tab-pool'); await set('#scope','DEPARTMENT_POOL');
  await wait("!document.body.classList.contains('busy') && document.querySelector('#pool-count').dataset.total==='27'");
  console.log('PASS: XLSX preview/commit -> 7 direct nominees; department pool remains separate');
  assert.deepEqual(errors,[]);
  console.log('PASS: no uncaught browser JavaScript errors');
} finally { socket.close(); }
