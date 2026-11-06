import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {initializeApp,cert,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {firstCatalog,defaultPromotion,defaultHours,minutes,intersects,selectedQuote,validateTime,validDay,safeString} from '../../shared/logic.mjs';

const COLLECTIONS=Object.freeze({
 agendamentos:'agendamentos',
 bloqueios:'bloqueios',
 beautyStudioCampanhas:'dm_bs_campanhas',
 beautyStudioServicos:'dm_bs_servicos'
});
const DAYS='dm_bs_days';
const CONFIG='dm_bs_config/main';
const RATE='dm_bs_rate';
const respond=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>respond({error:message},status);
// Supports compact gzip+base64 ("gz:" prefix) to fit Netlify's 5000-character
// limit for individual environment variable values. Never log the raw key.
function parseServiceAccount(raw){
 let value=raw.trim();
 if(value.startsWith('"')&&value.endsWith('"'))value=JSON.parse(value);
 if(typeof value!=='string')throw new Error('Invalid credential wrapper');
 value=value.trim();
 let jsonText;
 if(value.startsWith('gz:')){
  const bytes=Buffer.from(value.slice(3).replace(/\s/g,''),'base64');
  jsonText=gunzipSync(bytes,{maxOutputLength:65536}).toString('utf8');
 }else{
  jsonText=value.startsWith('{')?value:Buffer.from(value.replace(/\s/g,''),'base64').toString('utf8');
 }
 const key=JSON.parse(jsonText.replace(/^\uFEFF/,''));
 if(!key||typeof key!=='object'||!key.private_key||!key.client_email)throw new Error('Missing service account fields');
 return key;
}
function getDB(){
 if(!getApps().length){
  const b64=process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if(!b64)throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_B64 não configurado.'),{http:503});
  // Netlify accepts a base64 service-account JSON; tolerate an accidentally
  // pasted raw JSON or a quoted base64 string without disclosing secret data.
  let key;
  try {
   key=parseServiceAccount(b64);
  } catch {
   console.error('Netlify API: credencial Firebase inválida ou codificação incorreta; verifique FIREBASE_SERVICE_ACCOUNT_B64.');
   throw Object.assign(new Error('Configuração do servidor inválida: credencial Firebase. Contate o suporte do estúdio.'),{http:503});
  }
  if(key.project_id!=='dayanne-mary')throw Object.assign(new Error('O projeto Firebase esperado não corresponde às credenciais.'),{http:503});
  initializeApp({credential:cert(key),projectId:key.project_id});
 }
 return getFirestore();
}
function checkOrigin(req){const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==new URL(req.url).host)throw Object.assign(new Error('Origem não autorizada.'),{http:403});}
async function adminUser(req){
 const tok=/^Bearer (.+)$/.exec(req.headers.get('authorization')||'')?.[1];
 if(!tok)throw Object.assign(new Error('Login administrativo necessário.'),{http:401});
 if(!process.env.ADMIN_UID)throw Object.assign(new Error('ADMIN_UID não configurado.'),{http:503});
 const parsed=await getAuth().verifyIdToken(tok,true);
 if(parsed.uid!==process.env.ADMIN_UID)throw Object.assign(new Error('Conta não autorizada.'),{http:403});
 return parsed;
}
async function optionalAdmin(req){
 if(!req.headers.get('authorization'))return false;
 try{await adminUser(req);return true;}catch{return false;}
}
function docId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw Error('Identificador inválido.');return value;}
const sha=v=>createHash('sha256').update(v).digest('hex');
const cleanDay=d=>{if(!validDay(d))throw Error('Data inválida.');return d;};
const tokenCompare=(t,stored)=>{if(!t||!stored||typeof t!=='string')return false;const a=Buffer.from(sha(t)),b=Buffer.from(stored);return a.length===b.length&&timingSafeEqual(a,b);};
function periodMinutes(period){if(!period||period==='integral')return {start:0,end:1440};if(period==='manha')return {start:0,end:720};if(period==='tarde')return {start:720,end:1440};throw Error('Período de bloqueio inválido.');}
async function getCfg(db){
 const snap=await db.doc(CONFIG).get();
 const obj=snap.exists?snap.data():{};
 return {hours:obj.hours||defaultHours};
}
async function getServices(db){const snap=await db.collection(COLLECTIONS.beautyStudioServicos).get();const extras=snap.docs.map(d=>({id:d.id,...d.data()}));
 const out=firstCatalog.map(s=>({...s,...(extras.find(x=>x.id===s.id)||{})}));
 extras.filter(x=>!firstCatalog.some(s=>s.id===x.id)).forEach(x=>out.push(x));
 return out;
}
async function getCampaigns(db){
 const snap=await db.collection(COLLECTIONS.beautyStudioCampanhas).get();
 const campaigns=snap.docs.map(d=>({id:d.id,...d.data()}));
 // A promoção padrão só existe até ser explicitamente configurada pela administração.
 if(!campaigns.some(c=>c.id===defaultPromotion.id))campaigns.unshift(defaultPromotion);
 return campaigns;
}
async function getCatalog(db){const [services,campaigns,settings]=await Promise.all([getServices(db),getCampaigns(db),getCfg(db)]);return {services,campaigns,hours:settings.hours};}
const safeBusy=b=>({id:'busy_'+sha(String(b.id||'')).slice(0,20),data:b.data,hora:b.hora,duracao:Number(b.duracao)||60,status:b.status||'confirmado'});
function active(b){return b.status!=='cancelado';}
async function getAllRecords(db,collection,after,limit=1000){
 const ref=db.collection(collection);
 const snap=after?await ref.where('data','>=',after).limit(limit).get():await ref.limit(limit).get();
 return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function fetchCollection(db,collection,isAdmin){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 if(collection==='beautyStudioSettings')return [{id:'hours',hours:(await getCfg(db)).hours}];
 if(collection==='beautyStudioServicos')return (await getServices(db)).map(s=>({id:s.id,...s}));
 if(collection==='beautyStudioCampanhas')return (await getCampaigns(db)).map(c=>({id:c.id,...c}));
 if(collection==='bloqueios')return getAllRecords(db,COLLECTIONS.bloqueios,isAdmin?null:today,1200);
 if(collection==='agendamentos'){
  const records=await getAllRecords(db,COLLECTIONS.agendamentos,isAdmin?null:today,2500);
  if(isAdmin)return records;
  return records.filter(active).map(safeBusy);
 }
 throw Object.assign(Error('Recurso não encontrado.'),{http:404});
}
async function rateLimit(db,req,phone,tx){
 const ip=req.headers.get('x-nf-client-connection-ip');
 if(!ip||ip.length>128)throw Object.assign(new Error('Não foi possível validar a origem da solicitação.'),{http:503});
 const keys=[['ip',sha(`bs-ip:${ip}`),8,3600000],['phone',sha(`bs-phone:${phone}`),3,86400000]];
 const refs=keys.map(([type,k])=>db.doc(`${RATE}/${type}_${k}`));
 const snaps=await Promise.all(refs.map(r=>tx.get(r)));
 const now=Date.now(),writes=[];
 snaps.forEach((snap,i)=>{
  const prev=snap.exists?snap.data():{},old=Number(prev.start)||0,count=now-old<keys[i][3]?Number(prev.count)||0:0;
  if(count>=keys[i][2])throw Object.assign(Error('Muitas tentativas de agendamento. Entre em contato pelo WhatsApp.'),{http:429});
  writes.push({ref:refs[i],value:{start:count?old:now,count:count+1}});
 });
 return writes;
}
async function bookingNew(db,req,payload,isAdmin){
 const data=payload?.data||{},date=cleanDay(data.data);
 const cliente=safeString(data.cliente,100),phone=String(data.telefoneCliente||'').replace(/\D/g,'');
 if(cliente.length<3||!/^(?:55)?\d{10,11}$/.test(phone))throw Error('Informe nome e WhatsApp válidos.');
 const ids=Array.isArray(data.servicos)&&data.servicos.length?data.servicos.map(s=>s.id):[data.servicoId];
 const selectedTime=data.hora;
 const ref=db.collection(COLLECTIONS.agendamentos).doc(),dayRef=db.doc(`${DAYS}/${date}`);
 const rescheduleId=typeof data.rescheduleFrom==='string'?data.rescheduleFrom:null;
 const rescheduleToken=typeof data.rescheduleToken==='string'?data.rescheduleToken:null;
 const oldRef=rescheduleId?db.doc(`${COLLECTIONS.agendamentos}/${docId(rescheduleId)}`):null;
 const [services,campaigns,cfg]=await Promise.all([getServices(db),getCampaigns(db),getCfg(db)]);
 const quote=selectedQuote(services,campaigns,ids,date);
 const interval=validateTime(date,selectedTime,quote.duracao,cfg.hours,isAdmin);
 const token=randomBytes(32).toString('base64url');
 let result;
 await db.runTransaction(async tx=>{
  // Consultar reservas originais em leitura, para manter a agenda protegida na migração.
  // Enquanto o site legado estiver aceitando reservas, há uma janela de corrida entre ambos.
  const [daySnap,allDaySnap,oldSnap,legacyBlocksSnap]=await Promise.all([
   tx.get(dayRef),tx.get(db.collection(COLLECTIONS.agendamentos).where('data','==',date)),oldRef?tx.get(oldRef):null,tx.get(db.collection(COLLECTIONS.bloqueios).where('data','==',date))
  ]);
  if(oldRef&&(!oldSnap?.exists||(!isAdmin&&!tokenCompare(rescheduleToken,oldSnap.data().tokenHash))))throw Object.assign(Error('Não foi possível autorizar o reagendamento.'),{http:403});
  const previous=oldSnap?.data();
  const oldDayRef=previous?db.doc(`${DAYS}/${previous.data}`):null;
  const oldDaySnap=oldDayRef&&previous.data!==date?await tx.get(oldDayRef):null;
  const dayState=daySnap.exists?daySnap.data():{slots:[],blocks:[]};
  const freeSlots=(dayState.slots||[]).filter(x=>x.id!==rescheduleId);
  if(freeSlots.some(x=>intersects(x,interval))||(dayState.blocks||[]).some(x=>intersects(periodMinutes(x.periodo),interval))||legacyBlocksSnap.docs.some(d=>intersects(periodMinutes(d.data().periodo),interval)))throw Error('Esse horário já está ocupado ou bloqueado.');
  const existing=allDaySnap.docs.filter(d=>d.id!==rescheduleId).map(d=>d.data());
  if(existing.some(b=>active(b)&&intersects({start:minutes(b.hora),end:minutes(b.hora)+(Number(b.duracao)||60)},interval)))throw Error('Horário indisponível. Escolha outro.');
  const newState={...dayState,slots:[...freeSlots,{id:ref.id,...interval}]};
  const rate=(isAdmin||rescheduleId)?[]:await rateLimit(db,req,phone,tx);
  result={
   cliente,telefoneCliente:phone,servicoId:ids[0],servicoNome:quote.items.map(s=>s.nome).join(' + '),servicos:quote.items,
   valorOriginal:quote.original,valorFinal:quote.final,duracao:quote.duracao,data:date,hora:selectedTime,
   status:(date===new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})?'pendente':'confirmado'),criadoEm:new Date().toISOString(),source:isAdmin?'admin':'web',tokenHash:sha(token)
  };
  tx.create(ref,result);tx.set(dayRef,newState);
  if(previous){
   tx.update(oldRef,{status:'cancelado',substituidoPor:ref.id});
   if(previous.data!==date){
    const prevDay=oldDaySnap?.exists?oldDaySnap.data():{slots:[],blocks:[]};
    tx.set(oldDayRef,{...prevDay,slots:(prevDay.slots||[]).filter(x=>x.id!==rescheduleId)});
   }
  }
  for(const r of rate)tx.set(r.ref,r.value);
 });
 return {id:ref.id,token};
}
async function newBlock(db,data){
 const date=cleanDay(data.data),periodo=data.periodo;const span=periodMinutes(periodo);
 const ref=db.collection(COLLECTIONS.bloqueios).doc(),dayRef=db.doc(`${DAYS}/${date}`);
 await db.runTransaction(async tx=>{
  const [snap,dayBookings]=await Promise.all([tx.get(dayRef),tx.get(db.collection(COLLECTIONS.agendamentos).where('data','==',date))]);
  const day=snap.exists?snap.data():{slots:[],blocks:[]};
  if(dayBookings.docs.some(d=>active(d.data())&&intersects({start:minutes(d.data().hora),end:minutes(d.data().hora)+(Number(d.data().duracao)||60)},span)))throw Error('Há um agendamento no período. Cancele-o antes de bloquear.');
  if((day.slots||[]).some(x=>intersects(x,span)))throw Error('Há um agendamento no período. Cancele-o antes de bloquear.');
  tx.create(ref,{data:date,periodo});
  tx.set(dayRef,{...day,blocks:[...(day.blocks||[]),{id:ref.id,periodo}]});
 });
 return {id:ref.id};
}
async function deleteBlock(db,id){
 const ref=db.doc(`${COLLECTIONS.bloqueios}/${docId(id)}`);
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)throw Error('Bloqueio não encontrado.');
  const dayRef=db.doc(`${DAYS}/${snap.data().data}`),daySnap=await tx.get(dayRef),state=daySnap.exists?daySnap.data():{slots:[],blocks:[]};
  tx.delete(ref);tx.set(dayRef,{...state,blocks:(state.blocks||[]).filter(x=>x.id!==id)});
 });return {ok:true};
}
async function changeBooking(db,id,body,isAdmin){
 const ref=db.doc(`${COLLECTIONS.agendamentos}/${docId(id)}`);
 const requested=body?.data||{};
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)throw Error('Agendamento não encontrado.');
  const booking=snap.data();
  const own=isAdmin||tokenCompare(body?.token,booking.tokenHash);
  if(!own)throw Object.assign(Error('Acesso negado a este agendamento.'),{http:403});
  if(requested.status){
   if(!isAdmin&&requested.status!=='cancelado')throw Object.assign(Error('Operação não autorizada.'),{http:403});
   if(!['cancelado','confirmado','pendente','concluido'].includes(requested.status))throw Error('Status inválido.');
   const dayRef=db.doc(`${DAYS}/${booking.data}`),daySnap=await tx.get(dayRef),old=daySnap.exists?daySnap.data():{slots:[],blocks:[]};
   const remaining=(old.slots||[]).filter(x=>x.id!==id);
   if(requested.status!=='cancelado'){
    const span={id,start:minutes(booking.hora),end:minutes(booking.hora)+booking.duracao};
    if(remaining.some(x=>intersects(span,x)))throw Error('O horário está ocupado.');
    remaining.push(span);
   }
   tx.set(dayRef,{...old,slots:remaining});
   tx.update(ref,{status:requested.status});
   return;
  }
  if(requested.valorFinal!==undefined){
   if(!isAdmin)throw Object.assign(Error('Somente o administrador pode alterar valores.'),{http:403});
   const value=Number(requested.valorFinal);if(!Number.isFinite(value)||value<0||value>100000)throw Error('Valor inválido.');
   tx.update(ref,{valorFinal:Math.round(value*100)/100});return;
  }
  throw Error('Nenhuma alteração reconhecida.');
 });return {ok:true};
}
async function deleteBooking(db,id,token,isAdmin){return changeBooking(db,id,{data:{status:'cancelado'},token},isAdmin);}
async function saveService(db,id,data){
 const nome=safeString(data.nome,90),valor=Number(data.valor),duracao=Number(data.duracao);
 if(!nome||!Number.isFinite(valor)||valor<0||!Number.isInteger(duracao)||duracao<10||duracao>900)throw Error('Dados de serviço inválidos.');
 const ativo=data.ativo!==false;
 const fotoUrl=typeof data.fotoUrl==='string' && /^https:\/\/[^\s<>"']{1,500}$/.test(data.fotoUrl) ? data.fotoUrl : '';
 const ref=id?db.doc(`${COLLECTIONS.beautyStudioServicos}/${docId(id)}`):db.collection(COLLECTIONS.beautyStudioServicos).doc();
 await ref.set({nome,valor,duracao,ativo,fotoUrl},{merge:true});return {id:ref.id};
}
async function saveCampaign(db,id,data){
 const nome=safeString(data.nome,90),percentual=Number(data.percentual),inicio=cleanDay(data.inicio),fim=cleanDay(data.fim);
 if(!nome||fim<inicio||!Number.isInteger(percentual)||percentual<0||percentual>90||!Array.isArray(data.servicos)||data.servicos.length>50||data.servicos.some(s=>typeof s!=='string'))throw Error('Promoção inválida.');
 const ref=id?db.doc(`${COLLECTIONS.beautyStudioCampanhas}/${docId(id)}`):db.collection(COLLECTIONS.beautyStudioCampanhas).doc();
 await ref.set({nome,percentual,inicio,fim,ativo:data.ativo===true,servicos:[...new Set(data.servicos)]},{merge:true});return {id:ref.id};
}
async function route(req){
 checkOrigin(req);
 const url=new URL(req.url),resource=url.searchParams.get('resource'),id=url.searchParams.get('id');
 // Safe deployment diagnostic. Does not expose credentials or read booking data.
 if(resource==='health'&&req.method==='GET'){
  let credentialStatus='missing',credentialFormat='missing',credentialLengthBand='0',credentialError='none';
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if(raw){
   const trimmed=raw.trim();
   credentialFormat=trimmed.startsWith('gz:')?'gzip-base64':trimmed.startsWith('{')?'raw-json':trimmed.startsWith('"')?'quoted':/^[A-Za-z0-9+/=\\s]+$/.test(trimmed)?'plain-base64':'other';
   credentialLengthBand=trimmed.length<=5000?'under-5001':'over-5000';
   try {
    const parsed=parseServiceAccount(raw);
    credentialStatus=parsed.project_id==='dayanne-mary'&&parsed.private_key&&parsed.client_email?'valid':'invalid';
    if(credentialStatus==='invalid')credentialError='project-or-fields';
   }catch{credentialStatus='invalid';credentialError='decode-or-json';}
  }
  return respond({ok:true,version:'4.1.4-secret-format',credentialStatus,credentialFormat,credentialLengthBand,credentialError});
 }
 const db=getDB();
 if(resource==='admin-check'){await adminUser(req);return respond({ok:true});}
 if(req.method==='GET'){
  const isAdmin=await optionalAdmin(req);
  if(![...Object.keys(COLLECTIONS),'beautyStudioSettings'].includes(resource))return fail('Recurso inválido.',404);
  return respond({docs:await fetchCollection(db,resource,isAdmin)});
 }
 if(!['POST','PUT','DELETE'].includes(req.method))return fail('Método não permitido.',405);
 const body=await req.json();
 const isAdmin=await optionalAdmin(req);
 if(resource==='agendamentos'){
  if(req.method==='POST')return respond(await bookingNew(db,req,body,isAdmin),201);
  if(req.method==='PUT')return respond(await changeBooking(db,id,body,isAdmin));
  if(req.method==='DELETE')return respond(await deleteBooking(db,id,body.token,isAdmin));
 }
 if(!isAdmin)throw Object.assign(Error('Faça login administrativo.'),{http:401});
 if(resource==='bloqueios'){
  if(req.method==='POST')return respond(await newBlock(db,body.data),201);
  if(req.method==='DELETE')return respond(await deleteBlock(db,id));
 }
 if(resource==='beautyStudioSettings'){
   if(req.method==='PUT'){
    const hours=body?.data?.hours;
    if(!hours||typeof hours!=='object'||Object.keys(hours).some(k=>!/^[0-6]$/.test(k)))throw Error('Horários inválidos.');
    const parsed={};
    for(const [k,v] of Object.entries(hours)){
     if(!v||!/^\d\d:\d\d$/.test(v.inicio)||!/^\d\d:\d\d$/.test(v.fim)||minutes(v.inicio)>=minutes(v.fim))throw Error('Horários inválidos.');
     parsed[k]={inicio:v.inicio,fim:v.fim};
    }
    await db.doc(CONFIG).set({hours:parsed},{merge:true});return respond({ok:true});
   }
 }
 if(resource==='beautyStudioServicos'){
  if(req.method==='POST'||req.method==='PUT')return respond(await saveService(db,id,body.data),req.method==='POST'?201:200);
 }
 if(resource==='beautyStudioCampanhas'){
  if(req.method==='POST'||req.method==='PUT')return respond(await saveCampaign(db,id,body.data),req.method==='POST'?201:200);
  if(req.method==='DELETE'){
   if(id===defaultPromotion.id){await db.doc(`${COLLECTIONS.beautyStudioCampanhas}/${id}`).set({...defaultPromotion,ativo:false});}
   else await db.doc(`${COLLECTIONS.beautyStudioCampanhas}/${docId(id)}`).delete();
   return respond({ok:true});
  }
 }
 return fail('Operação não reconhecida.',404);
}
export default async function handler(req){
 try{return await route(req)}catch(err){
  const status=err.http||(/firebase|unavailable|internal|permission.denied/i.test(err.code||'')?500:400);
  if(status>=500)console.error('Netlify API:',err);
  return fail(status>=500?'Serviço temporariamente indisponível.':(err.message||'Não foi possível concluir.'),status);
 }
}
