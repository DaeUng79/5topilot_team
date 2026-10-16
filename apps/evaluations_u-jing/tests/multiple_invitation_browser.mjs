import assert from 'node:assert/strict';
import {navigate,socket,errors,evaluate,click,fill,wait,shot} from './original_cdp.mjs';
try{
 await navigate('/');await click('#start');await click('[data-role=eval]');await wait("document.documentElement.dataset.liveScreen==='EV-00'");await fill('#nm','가상위원01');await fill('#ph','0001');await click('#f button[type=submit]');await wait("!!document.querySelector('[data-login-project]')");
 assert((await evaluate("document.querySelector('[data-login-project]').options.length"))>=3);assert.equal(await evaluate('document.documentElement.dataset.liveScreen'),'EV-00');
 await shot('journey-multiple-invitations');await fill('#nm','가상위원02');assert.equal(await evaluate("!!document.querySelector('[data-login-project]')"),false);
 await fill('#nm','가상위원01');await click('#f button[type=submit]');await wait("!!document.querySelector('[data-login-project]')");await fill('[data-login-project]','demo-evaluation');await click('#f button[type=submit]');await wait("document.documentElement.dataset.liveScreen==='EV-01'");assert.equal(await evaluate('Live.boot.actor.project_id'),'demo-evaluation');assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS multiple verified invitations -> explicit choice; changing identity clears choice');
}finally{socket.close();}
