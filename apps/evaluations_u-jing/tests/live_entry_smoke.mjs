import assert from 'node:assert/strict';
import {navigate,socket,errors,evaluate,click,fill,wait,shot} from './original_cdp.mjs';
const screen=id=>wait(`document.documentElement.dataset.liveScreen===${JSON.stringify(id)}&&document.documentElement.dataset.liveReady==='true'`);
try{
 await navigate('/');await screen('ENTRY');await click('#start');await click('[data-role=eval]');await screen('EV-00');
 assert(!new URL(await evaluate('location.href')).searchParams.has('project_id'));await fill('#nm','가상위원01');await fill('#ph','0001');await click('#f button[type=submit]');await screen('EV-01');
 assert((await evaluate("document.querySelector('#ttl').textContent")).includes('가상사업 · 제안서 평가 통합 시연'));await shot('live-evaluator-attendance');
 // Do not record attendance or mutate the user's business data in the live smoke.
 await navigate('/');await click('#start');await click('[data-role=biz]');await screen('PM-00');await fill('#uid','web-demo');await fill('#upw','DemoOnly!2026');await click('#go');await screen('PM-01');await fill('#q','가상사업 · 제안서 평가 통합 시연');await click('#rows tr');await screen('PM-01-overview');
 for(const id of ['PM-02','PM-03','PM-04','PM-05','PM-06']){await click(`#steps a[href*="${id}-"]`);await screen(id);assert.equal(await evaluate('Live.pid'),'demo-evaluation');}
 await click('#steps a[href*="PM-04-"]');await screen('PM-04');assert.equal(await evaluate("document.querySelector('.pj-title h1').textContent"),'가상사업 · 제안서 평가 통합 시연');await shot('live-committee-connected');
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS live 5190 general evaluator login + manager visible navigation, no attendance/score mutation');
}finally{socket.close();}
