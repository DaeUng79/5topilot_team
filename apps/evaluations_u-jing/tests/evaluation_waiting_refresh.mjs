// Focused concurrent-role test. Backend writes simulate a second browser session;
// the full button-only journey is covered by committee_journey_browser.mjs.
import assert from 'node:assert/strict';
import {base,navigate,socket,errors,evaluate,click,fill,wait} from './original_cdp.mjs';
assert.equal(new URL(base).port,'5197','Run only against isolated workflow-1017 test host');
async function action(cookie,id,body){const r=await fetch(base+'/api/v2/actions/'+id,{method:'POST',headers:{'Content-Type':'application/json','X-Simsa-Client':'v2-web','Idempotency-Key':crypto.randomUUID(),Cookie:cookie},body:JSON.stringify(body)});assert(r.ok,await r.clone().text());return {data:(await r.json()).data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};}
try{
 await navigate('/');await click('#start');await click('[data-role=eval]');await wait("document.documentElement.dataset.liveScreen==='EV-00'");await fill('#nm','가상위원01');await fill('#ph','0001');await click('#f button[type=submit]');await wait("!!document.querySelector('[data-login-project]')");await fill('[data-login-project]','demo-evaluation');await click('#f button[type=submit]');await wait("document.documentElement.dataset.liveScreen==='EV-01'");await click('#agree');await click('#yes');await wait("document.documentElement.dataset.liveScreen==='EV-03'");await click('.ev-tabs a[href*="EV-06-"]');await wait("document.documentElement.dataset.waitingEvaluation==='true'");
 const manager=(await action('','AUTH-01',{username:'web-demo',password:'DemoOnly!2026'})).cookie;
 let state=(await action(manager,'ATT-02',{project_id:'demo-evaluation'})).data;
 let session=(await action(manager,'ATT-00',{project_id:'demo-evaluation',roster_id:state.rosters[0].id,approved_criteria_version_id:'demo-criteria',target_count:7,minimum_attendees:7,approve_policy:true})).data;
 let chairAssignment;
 for(let i=1;i<=7;i++){const auth=await action('','AUTH-02',{project_id:'demo-evaluation',name:'가상위원'+String(i).padStart(2,'0'),last4:String(i).padStart(4,'0')});if(i===1){chairAssignment=auth.data.id;continue;}await action(auth.cookie,'ATT-01',{consent:true,consent_version:'attendance-v2'});}
 state=(await action(manager,'ATT-02',{project_id:'demo-evaluation'})).data;
 session=(await action(manager,'ATT-03',{session_id:session.id,version:session.version,attendance_ids:state.assignments.map(a=>a.attendance_id)})).data;
 state=(await action(manager,'ATT-02',{project_id:'demo-evaluation'})).data;
 session=(await action(manager,'ATT-04',{session_id:session.id,version:session.version,participant_id:state.participants.find(p=>p.assignment_id===chairAssignment).id})).data;
 await action(manager,'ATT-05',{session_id:session.id,version:session.version});
 await wait("document.documentElement.dataset.liveScreen==='EV-06'&&document.querySelectorAll('[data-k]:not([disabled])').length===6");
 assert.equal(await evaluate('Live.evaluatorState().isChair'),true);assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS waiting evaluator automatically receives score form and chair role after manager starts evaluation');
}finally{socket.close();}
