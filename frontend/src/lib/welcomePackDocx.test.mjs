import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { createWelcomePackDocx } from './welcomePackDocx.mjs';
import { defaultAssignments } from './welcomePack.mjs';

test('Word conserva plantilla, rellena fichas múltiples y omite acceso Natureco para máscara',async()=>{
 const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async url=>new Response(await readFile(new URL('../../public'+url,import.meta.url)));
  for(const route of ['natureco','mask','promoter_ot']){
   const data={company:'Canal & Empresa',cif:'B00000001',contact:'Ana',recipient:'ana@example.com',phone:'600000001',kamName:'KAM',kamEmail:'kam@example.com',kamPhone:'600000002',startDate:'2026-12-01',kind:'Agregador',route,sheets:['RES010','RES060'],...defaultAssignments(route,'Canal & Empresa')};
   const blob=await createWelcomePackDocx(data),bytes=Buffer.from(await blob.arrayBuffer());
   const xml=(await mammoth.extractRawText({ buffer: bytes })).value;
   assert.doesNotMatch(xml,/\{\{|XXXXXX@/);assert.match(xml,/RES010 · RES060/);assert.match(xml,/BORRADOR/);assert.match(xml,/Canal & Empresa/);
   if(route==='mask')assert.doesNotMatch(xml,/Login con Entra ID|environmental-markets/);
   if(route==='promoter_ot')assert.match(xml,/preoferta OCA/);
   if (process.env.WELCOME_QA_DIRECTORY) await writeFile(`${process.env.WELCOME_QA_DIRECTORY}/welcome-qa-${route}.docx`,bytes);
  }
 }finally{globalThis.fetch=originalFetch}
});
