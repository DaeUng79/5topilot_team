import assert from 'node:assert/strict';
import {navigate,api,socket,errors,evaluate,click,fill,wait,shot} from './original_cdp.mjs';
const stamp=Date.now(),name='직접선정 검증 '+stamp;
const screen=id=>wait(`document.documentElement.dataset.liveScreen===${JSON.stringify(id)}&&document.documentElement.dataset.liveReady==='true'`);
try{
 await navigate('/');await click('#start');await click('[data-role=biz]');await screen('PM-00');await fill('#uid','web-demo');await fill('#upw','DemoOnly!2026');await click('#go');await screen('PM-01');
 await click('#b-new');for(const [f,v] of Object.entries({'n-name':name,'n-date':'2026-12-01','n-pos':'담당','n-owner':'가상담당자','n-tel':'01012345678'}))await fill('#'+f,v);await click('[form=f-new]');await fill('#q',name);await click('#rows tr');await screen('PM-01-overview');const pid=await evaluate('Live.pid');
 await click('#steps a[href*="PM-04-"]');await screen('PM-04');await click('#mode [data-m=DIRECT]');await click('#save');await click('#nx');assert.equal(await evaluate("!!document.querySelector('#draw')"),false);
 await click('.side nav a[href*="PM-07-"]');await screen('PM-07');await click('#b-add');await click('#f-sc [data-s=proj]');
 for(const [f,v] of Object.entries({name:'사업전용위원'+stamp,tel:'010'+String(stamp).slice(-8),org:'테스트대학',dept:'테스트학과',pos:'교수'}))await fill('#p #f-'+f,v);await click('#b-save');assert((await evaluate("document.querySelector('#rows').innerText")).includes('사업전용위원'));assert.equal((await api('COM-01',{department_id:'web-demo-dept',scope:'DEPARTMENT_POOL',search:'사업전용위원'+stamp})).total,0);
 await click('.side nav a[href*="PM-01-"]');await screen('PM-01');await fill('#q',name);await click('#rows tr');await screen('PM-01-overview');await click('#steps a[href*="PM-04-"]');await screen('PM-04');
 assert.equal(await evaluate("!!document.querySelector('#draw')"),false);
 // Existing project nominee plus six pool candidates, added through the original drawer.
 for(let i=0;i<6;i++){await click('#addc');await click('#p [data-a]');}
 let state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);assert.equal(state.items.length,7);assert.equal(state.draw,null);
 for(let i=0;i<7;i++)await fill(`[data-st="${i}"]`,'수락');await click('#nx');for(let i=0;i<7;i++)await fill(`[data-pk="${i}"]`,'본');await click('#cf');await click('#dlg-ok');
 state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);assert.equal(state.assignments.length,7);assert.equal(state.rule.selection_mode,'DIRECT');await shot('journey-direct-confirmed');assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS direct project registration -> 6 existing pool additions -> contacts -> 7 invitations; no random draw',pid);
}finally{socket.close();}
