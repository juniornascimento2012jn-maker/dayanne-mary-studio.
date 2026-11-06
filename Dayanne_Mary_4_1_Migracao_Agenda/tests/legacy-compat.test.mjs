import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('novas reservas utilizam a coleção original',()=>{
 assert.match(api,/agendamentos:'agendamentos'/);
 assert.match(api,/bloqueios:'bloqueios'/);
 assert.doesNotMatch(api,/dm_bs_agendamentos|dm_bs_bloqueios/);
});
test('a escrita da agenda usa transação e verifica todos os agendamentos do dia',()=>{
 assert.match(api,/runTransaction/);
 assert.match(api,/allDaySnap/);
 assert.match(api,/existing\.some\(/);
 assert.match(api,/legacyBlocksSnap\.docs\.some\(/);
});
test('reservas antigas nao sao rotuladas como somente leitura',()=>{
 assert.doesNotMatch(api,/legado:true|somente leitura nesta versão/);
 assert.doesNotMatch(html,/legacy_\s*\+/);
});
