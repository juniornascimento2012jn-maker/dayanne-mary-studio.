import test from 'node:test';import assert from 'node:assert/strict';
import {firstCatalog,defaultPromotion,selectedQuote,intersects,validateTime,defaultHours} from '../shared/logic.mjs';
test('somatório de 3 serviços com campanha de 25%',()=>{
 const q=selectedQuote(firstCatalog,[defaultPromotion],['s1','s5','s8'],'2026-11-12');
 assert.equal(q.duracao,370);assert.equal(q.original,245);assert.equal(q.final,183.75);
});
test('promoção termina e preço volta ao normal',()=>{
 const q=selectedQuote(firstCatalog,[defaultPromotion],['s1','s5','s8'],'2026-12-01');assert.equal(q.final,245);
});
test('campanhas sobrepostas aplicam somente a maior',()=>{
 const p={...defaultPromotion,percentual:50,id:'week'};
 assert.equal(selectedQuote(firstCatalog,[defaultPromotion,p],['s1'],'2026-11-12').final,75);
});
test('detecta sobreposição entre dois horários',()=>{
 assert.equal(intersects({start:540,end:640},{start:600,end:690}),true);
 assert.equal(intersects({start:540,end:640},{start:640,end:690}),false);
});
test('não ultrapassa horário de fechamento',()=>{
 assert.throws(()=>validateTime('2026-11-10','17:00',120,defaultHours,false,new Date('2026-11-06T10:00:00Z')));
});
