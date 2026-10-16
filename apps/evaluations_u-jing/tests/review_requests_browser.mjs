import assert from 'node:assert/strict';
import {navigate,api,socket,errors,evaluate,click,fill,wait,shot,cdp} from './original_cdp.mjs';
const stamp=String(Date.now()),dept='직접입력부서'+stamp,projectName='입력검증사업'+stamp;
try{
 await navigate('/v2/총괄관리자/SA-00-로그인-권한/시안/login.html');await api('AUTH-01',{username:'super-demo',password:'DemoOnly!2026'});
 await navigate('/v2/총괄관리자/SA-03-전체-사업-현황/시안/projects.html');await click('#b-new');
 assert.equal(await evaluate("document.querySelector('#n-dept').tagName"),'INPUT');
 for(const [field,value] of Object.entries({'n-name':projectName,'n-org':'가상검증기관','n-dept':dept,'n-pos':'담당','n-owner':'가상담당자','n-tel':'01012345678'}))await fill('#'+field,value);
 await wait("document.querySelector('#pn').getBoundingClientRect().right<=innerWidth+1");await shot('review-department-input');await click('[form=f-new]');const created=(await api('PRJ-01',{search:projectName})).items[0];assert.equal(created.contact_department,dept);
 await navigate('/v2/총괄관리자/SA-04-자료-관리/시안/data.html');await click('#t-pool');
 assert.equal(await evaluate("document.querySelector('#t-pool').getAttribute('aria-selected')"),'true');
 const expected=await evaluate("Promise.all(Live.boot.departments.map(d=>Live.api('COM-01',{department_id:d.id,scope:'DEPARTMENT_POOL',active:true}))).then(values=>values.reduce((n,v)=>n+v.total,0))");
 assert.equal(await evaluate("document.querySelectorAll('#rows tr').length"),expected);assert(expected>0);
 assert((await evaluate("document.querySelector('#tb .spec-note').textContent")).includes('원준석'));await fill('#q','없는이름'+stamp);assert.equal(await evaluate("document.querySelectorAll('#rows tr').length"),0);
 await fill('#q','');await shot('review-supervisor-pool');await click('#t-files');assert((await evaluate("document.querySelector('#why').textContent")).includes('확정 대기'));
 await click('#b-up');assert((await evaluate("document.querySelector('#f-up .note').textContent")).includes('회의록'));assert(await evaluate("document.querySelector('[form=f-up][type=submit]').disabled"));await wait("document.querySelector('#p-up').getBoundingClientRect().right<=innerWidth+1");await shot('review-result-explanation');
 await navigate('/v2/사업담당자/PM-00-로그인/시안/login.html');await api('AUTH-01',{username:'web-demo',password:'DemoOnly!2026'});
 await navigate('/v2/사업담당자/PM-07-위원-풀/시안/pool.html');await click('#b-add');
 for(const [width,height] of [[1440,900],[1366,768],[1280,720]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await wait("getComputedStyle(document.querySelector('.committee-registration')).display==='grid'");
  await wait("document.querySelector('#p').getBoundingClientRect().right<=innerWidth+1");
  const rects=await evaluate("(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {top:x.top,left:x.left,right:x.right,bottom:x.bottom}};return {name:r('#f-name'),phone:r('#f-tel'),scope:r('#f-sc'),org:r('#f-org'),dept:r('#f-dept'),position:r('#f-pos'),field:r('#p select#f-field'),email:r('#f-email'),footer:r('#p footer'),scroll:document.querySelector('#p-body').scrollHeight,client:document.querySelector('#p-body').clientHeight}})()");
  assert(rects.scope.top<rects.name.top);assert(Math.abs(rects.name.top-rects.phone.top)<2);assert(Math.abs(rects.org.top-rects.dept.top)<2);assert(Math.abs(rects.position.top-rects.field.top)<2);assert(rects.scroll<=rects.client+1,JSON.stringify({width,height,rects}));assert(rects.phone.right<=width&&rects.name.left>=0);assert(rects.email.bottom<=rects.footer.top);
 }
 await shot('review-compact-registration');
 const name='배치검증위원'+stamp;
 for(const [field,value] of Object.entries({name,tel:'010'+stamp.slice(-8),org:'가상대학',dept:'컴퓨터공학과',pos:'교수',email:'layout@example.test'}))await fill('#p #f-'+field,value);
 await click('#b-save');const candidate=(await api('COM-01',{department_id:'web-demo-dept',search:name})).items[0];assert.equal(candidate.department_name,'컴퓨터공학과');
 await click(`#rows tr[data-id="${candidate.id}"]`);await click('#b-edit');await fill('#f-pos','부교수');await click('#b-save');assert.equal((await api('COM-01',{department_id:'web-demo-dept',search:name})).items[0].position,'부교수');
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS four review requests: typed department, real supervisor pool, result/retention explanation, compact registration + create/edit');
}finally{socket.close();}
