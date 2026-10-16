import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
export const base=process.env.SIMSA_TEST_URL||'http://127.0.0.1:5196';
const targets=await(await fetch('http://127.0.0.1:9336/json/list')).json();
const target=targets.find(t=>t.type==='page');assert(target);
export const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();export const errors=[];
export function cdp(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});}
socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
await cdp('Runtime.enable');await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
export async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
export async function wait(expression){const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('TIMEOUT '+expression+' '+await evaluate('document.documentElement.dataset.liveError||document.body.innerText.slice(-500)'));}
export async function navigate(path){await cdp('Page.navigate',{url:base+path});await wait("document.readyState==='complete'");await wait("document.documentElement.dataset.liveReady==='true'||document.documentElement.dataset.liveError");const error=await evaluate('document.documentElement.dataset.liveError');if(error)throw Error(path+' '+error);}
export async function click(s){await wait(`document.querySelector(${JSON.stringify(s)})&&!document.querySelector(${JSON.stringify(s)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);await wait("!document.querySelector('[aria-busy=true]')");}
export async function fill(s,v){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw Error('missing '+${JSON.stringify(s)});el.value=${JSON.stringify(v)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait("!document.querySelector('[aria-busy=true]')");}
export async function api(action,body={}){return evaluate(`Live.api(${JSON.stringify(action)},${JSON.stringify(body)})`);}
export async function shot(name){const s=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(new URL('../test-results/'+name+'.png',import.meta.url),Buffer.from(s.data,'base64'));}
export async function sign(selector){const b=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`);const x=b.x+20,y=b.y+b.height/2;await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let i=1;i<=16;i++)await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+i*8,y:y+Math.sin(i)*20,button:'left',buttons:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+128,y,button:'left'});}
