import {navigate,api,socket,errors,evaluate} from './original_cdp.mjs';
try{
 await navigate('/v2/사업담당자/PM-00-로그인/시안/login.html');
 await api('AUTH-01',{username:'web-demo',password:'DemoOnly!2026'});
 for(const path of ['PM-01-사업-목록-등록/시안/projects.html','PM-01-사업-목록-등록/시안/overview.html','PM-07-위원-풀/시안/pool.html','PM-05-참석-위원장/시안/attendance.html','PM-06-평가-결과/시안/results.html']){
  await navigate('/v2/사업담당자/'+path+'?id=demo-evaluation');console.log('Loaded',path);
 }
 console.log(JSON.stringify({errors,screen:await evaluate('document.documentElement.dataset.liveScreen')}));
}finally{socket.close();}
