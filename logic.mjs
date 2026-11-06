export const firstCatalog=[
 {id:'s1',nome:'Alongamento e molde F1',valor:150,duracao:240,ativo:true},
 {id:'s2',nome:'Manutenção em gel',valor:120,duracao:180,ativo:true},
 {id:'s3',nome:'Blindagem',valor:70,duracao:90,ativo:true},
 {id:'s4',nome:'Banho de gel',valor:90,duracao:90,ativo:true},
 {id:'s5',nome:'Esmaltação em gel',valor:60,duracao:90,ativo:true},
 {id:'s6',nome:'Manicure tradicional (pé e mão)',valor:70,duracao:120,ativo:true},
 {id:'s7',nome:'Apenas mão',valor:35,duracao:60,ativo:true},
 {id:'s8',nome:'Design de sobrancelha',valor:35,duracao:40,ativo:true},
 {id:'s9',nome:'Design de sobrancelha com henna',valor:45,duracao:60,ativo:true},
 {id:'s10',nome:'Brow lamination',valor:100,duracao:60,ativo:true},
 {id:'s11',nome:'Lash lifting',valor:100,duracao:60,ativo:true},
 {id:'s12',nome:'Cílios tufinho',valor:100,duracao:60,ativo:true},
 {id:'s13',nome:'Manicure combinada',valor:70,duracao:120,ativo:true}
];
export const defaultHours={2:{inicio:'09:00',fim:'18:00'},3:{inicio:'09:00',fim:'18:00'},4:{inicio:'09:00',fim:'18:00'},5:{inicio:'09:00',fim:'18:00'},6:{inicio:'09:00',fim:'15:00'}};
export const defaultPromotion={id:'black-2026',nome:'Black Friday',percentual:25,inicio:'2026-11-01',fim:'2026-11-30',ativo:true,servicos:firstCatalog.map(s=>s.id)};
export const minutes=s=>{if(!/^\d\d:\d\d$/.test(String(s)))throw Error('Horário inválido.');const [h,m]=s.split(':').map(Number);if(h>23||m>59)throw Error('Horário inválido.');return h*60+m;};
export const validDay=s=>/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s))&&!Number.isNaN(Date.parse(`${s}T12:00:00Z`))&&new Date(`${s}T12:00:00Z`).toISOString().slice(0,10)===s;
export const dateWeekday=day=>new Date(`${day}T12:00:00Z`).getUTCDay();
export const intersects=(a,b)=>a.start<b.end&&b.start<a.end;
export const selectedQuote=(services,campaigns,ids,day)=>{
 if(!Array.isArray(ids)||ids.length<1||ids.length>5||new Set(ids).size!==ids.length)throw Error('Selecione entre 1 e 5 serviços diferentes.');
 const items=ids.map(id=>services.find(s=>s.id===id&&s.ativo!==false));
 if(items.some(s=>!s))throw Error('Serviço indisponível.');
 let original=0,final=0,duracao=0;
 const detail=items.map(s=>{
  const applicable=campaigns.filter(c=>c.ativo&&c.inicio<=day&&c.fim>=day&&Array.isArray(c.servicos)&&c.servicos.includes(s.id));
  const best=applicable.sort((a,b)=>b.percentual-a.percentual)[0];
  const cents=Math.round(s.valor*100), finalCents=Math.round(cents*(100-(best?.percentual||0))/100);
  original+=cents;final+=finalCents;duracao+=s.duracao;
  return {id:s.id,nome:s.nome,duracao:s.duracao,valorOriginal:cents/100,valorFinal:finalCents/100,promocao:best?.nome||null};
 });
 return {items:detail,original:original/100,final:final/100,duracao};
};
export const validateTime=(date,time,duration,hours,admin=false,now=new Date())=>{
 if(!validDay(date))throw Error('Data inválida.');
 const start=minutes(time),end=start+duration;
 if(!Number.isInteger(duration)||duration<1||duration>900||end>1440)throw Error('Duração inválida.');
 if(!admin){
  if(dateWeekday(date)===5 && date<='2026-11-27')throw Error('Atendimento temporariamente indisponível às sextas-feiras.');
  const h=hours[dateWeekday(date)];if(!h)throw Error('O estúdio está fechado neste dia.');
  if(start<minutes(h.inicio)||end>minutes(h.fim)||start%30!==0)throw Error('Fora do horário de atendimento.');
  const dt=new Date(`${date}T${time}:00-03:00`);if(dt<=now)throw Error('Escolha um horário futuro.');
 }
 return {start,end};
};
export const safeString=(s,max=150)=>typeof s==='string'?s.trim().slice(0,max):'';
