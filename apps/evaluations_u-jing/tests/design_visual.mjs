import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const targets=await(await fetch('http://127.0.0.1:9336/json/list')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const jobs=new Map();
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const j=jobs.get(m.id);jobs.delete(m.id);m.error?j.reject(Error(JSON.stringify(m.error))):j.resolve(m.result);}});
const c=(method,params={})=>new Promise((resolve,reject)=>{jobs.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const e=async expression=>{const r=await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
async function wait(expression){for(let n=0;n<150;n++){if(await e(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('timeout '+expression);}
async function shot(name){await e('document.fonts.ready');await new Promise(r=>setTimeout(r,1200));const r=await c('Page.captureScreenshot',{format:'png'});await writeFile('apps/evaluations_u-jing/test-results/design-'+name+'.png',Buffer.from(r.data,'base64'));}
async function route(key){await e(`location.hash='#/${key}'`);await wait(`document.querySelector('[data-screen="${key.split('?')[0]}"]')&&!document.querySelector('#page[aria-busy]')`);}
try{
await c('Page.enable');await c('Runtime.enable');await c('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await c('Page.navigate',{url:'http://127.0.0.1:5194/?designcheck='+Date.now()+'#/ENTRY'});await wait("document.querySelector('#start')");await shot('entry');assert.equal(await e('document.documentElement.scrollWidth<=innerWidth'),true);
await e("document.querySelector('#start').click()");await wait("document.querySelector('.entry-design.s-pick')");await shot('roles');assert.equal(await e("getComputedStyle(document.querySelector('#intro')).visibility"),'hidden');assert.equal(await e("document.querySelectorAll('.pick').length"),3);
await e("document.querySelector('[data-role=biz]').click()");await wait("document.querySelector('[data-screen=PM-00]')");await shot('login');
await e("document.querySelector('[name=username]').value='web-demo';document.querySelector('[name=password]').value='DemoOnly!2026';document.querySelector('.login-card form').requestSubmit()");await wait("document.querySelector('[data-screen=PM-01]')");await shot('projects');
assert.equal(await e("getComputedStyle(document.querySelector('.side')).backgroundImage.includes('linear-gradient')"),true);
await e("document.querySelector('#new-project').click()");assert.equal(await e("document.querySelector('dialog').open"),true);await shot('registration');
await e(`(()=>{const f=document.querySelector('#project-form');const fields={name:'디자인 연결 검증 사업',contact_organization:'가상 기관',contact_department:'가상 부서',contact_position:'가상 담당',contact_name:'가상 담당자',contact_phone:'010-2222-3333'};for(const [key,value] of Object.entries(fields))f.elements[key].value=value;f.requestSubmit();})()`);
await wait("location.hash.includes('overview')&&!document.querySelector('#page[aria-busy]')&&document.querySelector('#project-form [name=name]')?.value==='디자인 연결 검증 사업'");
await route('PM-07');await wait("document.querySelector('iframe')?.contentDocument?.body.classList.contains('integrated-design')");await shot('committee');
await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await route('PM-01');await shot('mobile-projects');assert.equal(await e('document.documentElement.scrollWidth<=innerWidth'),true);
await route('ENTRY');await shot('mobile-entry');assert.equal(await e('document.documentElement.scrollWidth<=innerWidth'),true);
await e("document.querySelector('#start').click()");await shot('mobile-roles');assert.equal(await e('document.documentElement.scrollWidth<=innerWidth'),true);
console.log(JSON.stringify({passed:true,checks:['entry original B design','three roles','real login','navy admin sidebar','registration dialog saves through API','committee iframe stylesheet','390px projects/entry/roles no overflow']}));
}finally{ws.close();}
