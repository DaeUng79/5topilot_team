import assert from 'node:assert/strict';
import {base,cdp,navigate,api,socket,errors,evaluate,fill,click,wait,shot} from './original_cdp.mjs';
try{
 await cdp('Page.navigate',{url:base+'/v2/index.html'});await wait("!!document.querySelector('#view')?.getAttribute('src')");
 const first=await evaluate("document.querySelector('#view').getAttribute('src')");
 await evaluate("[...document.querySelectorAll('button[data-src]')].at(-1)?.click()");
 // The original index must run its inline navigation script under the CSP.
 assert(first);
 for(const path of ['00-입장/시안/entry.html','총괄관리자/SA-00-로그인-권한/시안/login.html','사업담당자/PM-00-로그인/시안/login.html','위원/EV-00-로그인/시안/login.html?project_id=demo-evaluation'])await navigate('/v2/'+path);
 await fill('#nm','가상위원01');await fill('#ph','0001');await click('#f button[type=submit]');await wait("document.documentElement.dataset.liveScreen==='EV-01'");
 await navigate('/v2/위원/EV-06-평가하기/시안/scoring.html');assert((await evaluate('document.body.innerText')).includes('평가 시작 전'));await shot('original-before-evaluation');
 await api('AUTH-03');await navigate('/v2/사업담당자/PM-00-로그인/시안/login.html');await fill('#uid','web-demo');await fill('#upw','DemoOnly!2026');await click('#go');await wait("document.documentElement.dataset.liveScreen==='PM-01'");
 await click('[data-account]');await wait("document.documentElement.dataset.liveScreen==='SA-00'");assert((await evaluate("document.querySelector('#acct').innerText")).includes('web-demo'));
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS original index / four public pages / evaluator login / pre-start / own account',base);
}finally{socket.close();}
