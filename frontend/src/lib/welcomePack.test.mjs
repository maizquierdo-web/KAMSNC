import test from 'node:test';
import assert from 'node:assert/strict';
import { canPrepareWelcome, defaultAssignments, initialWelcome, welcomeAttachments, welcomeErrors, welcomeEmail, welcomeSendBlockers, validEmail } from './welcomePack.mjs';
const channel = { id: 'a', name: 'Empresa & Canal', status: 'activo', pipeline_stage: 'active', caes_platform: 'natureco', assigned_to: 'kam', contact_name: 'Ana', email: 'ana@example.com', phone: '600000001', cif: 'B00000001' };
const kam = { full_name: 'KAM asignado', email: 'kam@example.com', phone: '600000002' };
function complete(route='natureco') { return { ...initialWelcome(channel,kam), route, ...defaultAssignments(route,channel.name), kind: 'Agregador', startDate: '2026-12-01', sheets:['RES010','RES060'], recipientConfirmed:true }; }
test('solo ACTIVO y nunca estados incoherentes',()=>{
 assert.equal(canPrepareWelcome(channel),true);
 for(const status of ['en_proceso_alta','rechazado','en_evaluacion']) assert.equal(canPrepareWelcome({...channel,status}),false);
 assert.equal(canPrepareWelcome({...channel,pipeline_stage:'onboarding'}),false);
});
test('no asigna fichas por defecto ni conserva confirmación del destinatario',()=>{
 assert.deepEqual(initialWelcome(channel,kam).sheets,[]);
 const c={...channel,welcome_pack_config:{recipientConfirmed:true},caes_assigned_sheets:['RES060']};
 assert.equal(initialWelcome(c,kam).recipientConfirmed,false);
 assert.deepEqual(initialWelcome(c,kam).sheets,['RES060']);
});
test('retiene asignaciones excepcionales existentes',()=>{
 const data=initialWelcome({...channel,caes_technical_office:'e_program',caes_verifier:'eqa'},kam);
 assert.equal(data.ot1,'E-PROGRAM');assert.equal(data.verifier,'EQA');assert.equal(data.exception,true);
});
test('matriz de OT y documentos de las tres modalidades',()=>{
 for(const [route,ot1,ot2,docs] of [['mask','Sanwa','Sanwa',['welcome','A']],['natureco','SinCO2','SinCO2',['welcome','B']],['promoter_ot',channel.name,'SinCO2',['welcome','B','OCA']]]){
  const d=complete(route);assert.equal(d.ot1,ot1);assert.equal(d.ot2,ot2);assert.equal(d.verifier,'OCA');
  assert.deepEqual(welcomeAttachments(d).map(x=>x.key),docs);
 }
});
test('validación de datos ausentes y selección múltiple',()=>{
 const d=complete();assert.deepEqual(welcomeErrors(d,'sender@example.com'),[]);
 assert.ok(welcomeErrors({...d,sheets:[]},'sender@example.com').length);
 assert.ok(welcomeErrors({...d,recipientConfirmed:false},'sender@example.com',1).length);
 assert.ok(welcomeErrors({...d,recipient:'bad'},'sender@example.com',1).length);
 assert.ok(welcomeErrors({...d,exception:true},'sender@example.com',3).length);
});
test('correo enumera solo los documentos de su modalidad y firma el remitente',()=>{
 const sender={name:'Coordinador',email:'sender@example.com'};
 const a=welcomeEmail(complete('mask'),sender).body;
 assert.match(a,/Documento A/);assert.doesNotMatch(a,/Documento B|preoferta/);assert.match(a,/sender@example.com/);
 const b=welcomeEmail(complete('promoter_ot'),sender).body;assert.match(b,/Documento B/);assert.match(b,/Procedimiento de preoferta OCA/);
 assert.ok(welcomeSendBlockers(complete()).some(x=>x.includes('correo')));
});

test('correo con espacios copiados se normaliza y dirección incompleta se rechaza',()=>{
 assert.equal(validEmail('  ana@example.com  '),true);
 assert.equal(validEmail('ana@'),false);
 const d={...complete(),recipient:' ana@example.com '};
 assert.deepEqual(welcomeErrors(d,'sender@example.com',1),[]);
});
