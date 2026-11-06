import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,14);
test('cabeçalho original sem alterações',()=>{
 const v=html.match(/<header.*?<\/header>/s)?.[0];
 assert.ok(v);assert.equal(hash(v),'39989b795d890a');
});
test('estilos base originais sem alterações',()=>{
 const v=html.match(/<style>.*?<\/style>/s)?.[0];
 assert.ok(v);assert.equal(hash(v),'7a51abe9ed2d3c');
});
test('senhas administrativas não estão no HTML',()=>{
 assert.doesNotMatch(html,/senhaAdmin\s*:/);
 assert.doesNotMatch(html,/firebase-firestore\.js/);
});
