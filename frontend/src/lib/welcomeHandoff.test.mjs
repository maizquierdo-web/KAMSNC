import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { welcomeHandoffPlan, welcomeDesktopEmail, buildWelcomeMailto, welcomeMailtoHandoff, createWelcomeDownload } from './welcomeHandoff.mjs';
const data={company:'Canal & Empresa',contact:'Ana',route:'natureco',sheets:['RES010'],recipient:'ana@example.com'};
test('correo de prueba enumera únicamente archivos disponibles',()=>{
 const plan=welcomeHandoffPlan(data),email=welcomeDesktopEmail(data,{name:'KAM',email:'kam@example.com'});
 assert.equal(plan.draft,true); assert.equal(plan.files.length,1);
 assert.match(email.subject,/\[PRUEBA\]/); assert.match(email.body,/BORRADOR_/);
 for(const file of plan.missing) assert.ok(!email.body.includes(file.name));
});
test('mailto codifica caracteres y rechaza inyección de cabeceras',()=>{
 const url=buildWelcomeMailto({recipient:' ana@example.com ',subject:'CAE & Naturgy',body:'Hola\nAcción + fichas'});
 assert.match(url,/mailto:ana%40example.com/);assert.match(url,/subject=CAE%20%26%20Naturgy/);assert.match(url,/%0A/);
 assert.throws(()=>buildWelcomeMailto({recipient:'ana@example.com',subject:'Asunto\nBcc:otra@example.com'}));
 assert.throws(()=>buildWelcomeMailto({recipient:'ana@example.com\r\nBcc:x',subject:'CAE'}));
});
test('correo largo ofrece copia manual sin truncar silenciosamente',()=>{
 const email={subject:'CAE',body:'x'.repeat(3000)};
 const long=welcomeMailtoHandoff(email,'ana@example.com');assert.equal(long.copyBody,true);assert.ok(!long.url.includes('&body='));
 const short=welcomeMailtoHandoff({...email,body:'Hola'},'ana@example.com');assert.equal(short.copyBody,false);assert.match(short.url,/body=Hola/);
});
test('ZIP de prueba contiene Word real y lista de pendientes sin documentos ficticios',async()=>{
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async url=>new Response(await readFile(new URL('../../public'+url,import.meta.url)));
  const pack=await createWelcomeDownload({...data,kamName:'KAM',kamEmail:'kam@example.com'});
  const zip=await JSZip.loadAsync(await pack.blob.arrayBuffer());
  assert.equal(Object.keys(zip.files).length,2);assert.ok(zip.file('LEEME.txt'));
  const word=zip.file(pack.plan.files[0].name);assert.ok(word);
  const docx=await JSZip.loadAsync(await word.async('uint8array'));assert.ok(docx.file('word/document.xml'));
  assert.match(await zip.file('LEEME.txt').async('string'),/PRUEBA: pack incompleto/);
 }finally{globalThis.fetch=previous;}
});
