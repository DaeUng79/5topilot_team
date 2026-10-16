import assert from 'node:assert/strict';
import {navigate,api,socket,errors,evaluate,click,fill,wait,shot} from './original_cdp.mjs';
const stamp=String(Date.now()).slice(-7),code='Q-'+stamp,name='원본검증부서'+stamp,username='qa'+stamp;
try{
 await navigate('/v2/총괄관리자/SA-00-로그인-권한/시안/login.html');await fill('#uid','super-demo');await fill('#upw','DemoOnly!2026');await click('#go');await wait("document.documentElement.dataset.liveScreen==='SA-01'");
 await navigate('/v2/총괄관리자/SA-02-부서-관리/시안/departments.html');await click('#btn-new');await fill('#dn-code',code);await fill('#dn-org','가상기관');await fill('#dn-name',name);await click('[form=f-dnew]');await wait(`document.querySelector('#d-rows').textContent.includes(${JSON.stringify(name)})`);
 await click('#t-acc');await click('#btn-new');await fill('#an-id',username);await fill('#an-name','원본검증계정');await fill('#an-dept',code);await fill('#an-pw','OriginalAdmin!2026');await click('[form=f-anew]');
 await fill('#a-q',username);await click('#a-rows tr');await fill('#ae-name','수정한 검증계정');await click('#ae-save');await click('#a-rows tr');
 await evaluate("document.querySelector('#ae-perms input[value=PRJ_MANAGE]').checked=true");await click('#ae-psave');
 assert((await api('ADM-01',{search:username})).items[0].permissions.includes('MANAGE_PROJECTS'));
 await click('#ae-reset');await click('#dlg-ok');await wait("document.querySelector('#toast').textContent.includes('임시 비밀번호:')");const temporary=await evaluate("document.querySelector('#toast').textContent.split('임시 비밀번호: ')[1].split(' · ')[0]");
 await navigate('/v2/총괄관리자/SA-00-로그인-권한/시안/login.html');await fill('#uid',username);await fill('#upw',temporary);await click('#go');await wait("!document.querySelector('#v-first').hidden");await fill('#np1','ChangedAdmin!2026');await fill('#np2','ChangedAdmin!2026');await click('#f-first button[type=submit]');
 await wait("!document.querySelector('#v-login').hidden");await api('AUTH-01',{username,password:'ChangedAdmin!2026'});assert((await api('PRJ-01')).total===0);
 await api('AUTH-01',{username:'super-demo',password:'DemoOnly!2026'});await navigate('/v2/총괄관리자/SA-02-부서-관리/시안/departments.html#accounts');await fill('#a-q',username);await click('#a-rows tr');await click('#y-off');await click('#dlg-ok');assert((await api('ADM-01',{search:username})).items[0].active===0);await shot('original-admin-management');
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS original department/account/create/edit/permissions/reset/change/deactivate');
}finally{socket.close();}
