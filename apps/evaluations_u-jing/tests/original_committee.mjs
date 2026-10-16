import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {navigate,api,socket,errors,evaluate,click,fill,wait,shot,cdp} from './original_cdp.mjs';
const stamp=String(Date.now()),projectName='원본위원검증 '+stamp,name='개별위원'+stamp;
try{
 await navigate('/v2/사업담당자/PM-00-로그인/시안/login.html');await fill('#uid','web-demo');await fill('#upw','DemoOnly!2026');await click('#go');await wait("document.documentElement.dataset.liveScreen==='PM-01'");
 await click('#b-new');for(const [field,value] of Object.entries({'n-name':projectName,'n-org':'가상기관','n-pos':'담당','n-owner':'가상담당자','n-tel':'01012345678'}))await fill('#'+field,value);await click('[form=f-new]');
 const project=(await api('PRJ-01',{search:projectName})).items[0];assert(project);const pid=project.id;
 await navigate('/v2/사업담당자/PM-02-문서-목차/시안/documents.html?id='+pid);await click('#b-add');await fill('#i-name','가상 업체');await click('#f-inl button[type=submit]');let vendors=(await api('PRJ-05',{project_id:pid})).vendors;assert.equal(vendors.length,1);await click('[data-vedit="0"]');await fill('#a-name','수정 업체');await click('[form=f-add]');assert.equal((await api('PRJ-05',{project_id:pid})).vendors[0].legal_name,'수정 업체');
 await navigate('/v2/사업담당자/PM-07-위원-풀/시안/pool.html?id='+pid);await click('#b-add');for(const [field,value] of Object.entries({name,tel:'010'+stamp.slice(-8),org:'가상대학',dept:'가상부서',pos:'교수',email:'qa@example.test'}))await fill('#p #f-'+field,value);await click('#b-save');
 let candidate=(await api('COM-01',{department_id:'web-demo-dept',search:name})).items[0];assert(candidate);await click(`#rows tr[data-id="${candidate.id}"]`);await click('#b-edit');await fill('#p #f-pos','수정교수');await click('#b-save');candidate=(await api('COM-01',{department_id:'web-demo-dept',search:name})).items[0];assert.equal(candidate.position,'수정교수');await click(`#rows tr[data-id="${candidate.id}"]`);await click('#b-del');await click('#dlg-ok');assert.equal((await api('COM-01',{department_id:'web-demo-dept',search:name,active:true})).total,0);
 await click('#b-xl');const dom=await cdp('DOM.getDocument'),input=await cdp('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#pick input'});await cdp('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../test-results/original-import.xlsx',import.meta.url))]});await wait("document.querySelector('#xl-go')&&!document.querySelector('#xl-go').disabled");await click('#xl-go');assert((await evaluate("document.querySelector('#xl-res').textContent")).includes('1명'));await click('#x-close');
 await navigate('/v2/사업담당자/PM-04-평가위원-선정/시안/committee.html?id='+pid);
 for(let i=0;i<5;i++)await click('[data-d="-1"][data-i="0"]');for(let i=0;i<3;i++)await click('[data-d="1"][data-i="1"]');for(let i=0;i<2;i++)await click('[data-d="1"][data-i="2"]');await click('#save');await click('#nx');await click('#draw');
 let state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);assert.equal(state.items.length,21);await click('#nx');
 const selects=await evaluate("[...document.querySelectorAll('[data-st]')].map(e=>'[data-st=\"'+e.dataset.st+'\"]')");for(const sel of selects)await fill(sel,'수락');
 await click('#nx');state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);
 const count={AI:0,SEC:0,SYS:0},quota={AI:2,SEC:3,SYS:2};let reserve=false;
 for(let i=0;i<state.items.length;i++){const n=state.items[i],sid=state.draw_members.find(d=>d.id===n.draw_member_id).specialty_id;if(count[sid]<quota[sid]){await fill(`[data-pk="${i}"]`,'본');count[sid]++;}else if(!reserve){await fill(`[data-pk="${i}"]`,'예비');await fill(`[data-od="${i}"]`,'1');reserve=true;}}
 await click('#cf');await click('#dlg-ok');state=await evaluate(`Live.get('/committee-v2/api/projects/${pid}')`);assert(state.roster);assert.equal(state.assignments.length,8);assert.equal(state.handoff.status,'SENT');await shot('original-committee-final');assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS original project/vendor/pool/xlsx/draw/contact/roster',pid);
}finally{socket.close();}
