import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {navigate,api,socket,errors,evaluate,shot} from './original_cdp.mjs';
const root=fileURLToPath(new URL('../../web_cookiesh1/v2/',import.meta.url));
const visited=[];
async function files(folder){const result=[];for(const entry of await readdir(folder,{withFileTypes:true})){const p=path.join(folder,entry.name);if(entry.isDirectory())result.push(...await files(p));else if(entry.name.endsWith('.html'))result.push(p);}return result;}
try{
 await navigate('/v2/사업담당자/PM-00-로그인/시안/login.html');
 for(const [role,prefix,login] of [['SUPER_ADMIN','SA-',{username:'super-demo',password:'DemoOnly!2026'}],['DEPARTMENT_ADMIN','PM-',{username:'web-demo',password:'DemoOnly!2026'}],['EVALUATOR','EV-',{project_id:'demo-evaluation',name:'가상위원01',last4:'0001'}]]){
  await api(role==='EVALUATOR'?'AUTH-02':'AUTH-01',login);
  for(const file of (await files(root)).filter(f=>f.includes(prefix)&&!f.includes('-00-'))){
   const url='/v2/'+path.relative(root,file).replaceAll('\\','/')+'?id=demo-evaluation';await navigate(url);visited.push(await evaluate('document.documentElement.dataset.liveScreen'));console.log('Loaded',visited.at(-1));
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));await shot('original-last-screen');
 await writeFile(new URL('../test-results/original-pages.json',import.meta.url),JSON.stringify({visited,errors},null,2));
}finally{socket.close();}
