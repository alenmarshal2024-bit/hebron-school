import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseCSV,rowsFromCsv,previewRows,validateStudent} from '../server/csv.mjs';
import {hashPassword,verifyPassword,emailKey,authorized,randomPassword,tokenHash,readCookie,cookieForSession} from '../server/security.mjs';
import {toPaise,rupees,balance} from '../server/finance.mjs';
import {handleApi} from '../server/api.mjs';
const fakeUser=(roles)=>({id:'44444444-4444-4444-8444-444444444444',school_id:'55555555-5555-4555-8555-555555555555',email:'demo@example.org',name:'Demo User',roles,status:'active',profile_complete:true,must_change_password:false});
const basicDb=(user)=>({query:async (sql,params)=>{
 if(/SELECT CURRENT_TIMESTAMP/.test(sql))return {rows:[{checked_at:'2026-11-08T00:00:00Z'}],rowCount:1};
 if(sql.includes('FROM sessions ss'))return {rows:user?[user]:[],rowCount:user?1:0};
 if(sql.includes('FROM classes WHERE school_id')||sql.includes('SELECT id,name FROM classes'))return {rows:[{id:'33333333-3333-4333-8333-333333333333',name:'Class 3'}],rowCount:1};
 if(sql.includes('SELECT admission_number FROM students'))return {rows:[],rowCount:0};
 if(sql.includes('FROM students s JOIN classes c'))return {rows:[],rowCount:0};
 if(sql.includes('JOIN classes c ON c.id=s.class_id'))return {rows:[],rowCount:0};
 if(sql.includes('FROM students s JOIN classes c')&&sql.includes('c.class_teacher_id=$3'))return {rows:[],rowCount:0};
 return {rows:[],rowCount:0};
}});
const headers={cookie:'hebron_session=fakeToken'};
test('RFC-like CSV parser accepts escaped commas, quotes and line breaks',()=>{
 const rows=parseCSV('name,class\n"Smith, Ana",3\n"Double ""quote""",4\n"Line\nBreak",2');
 assert.deepEqual(rows[1],['Smith, Ana','3']);assert.equal(rows[2][0],'Double "quote"');assert.equal(rows[3][0],'Line\nBreak');
});
test('CSV aliases and UTF8 BOM supported',()=>{
 const r=rowsFromCsv('\ufeffadmission,name,class,parent_name,phone,language\nHB001,Sample Kid,Class 3,Parent,+919899999999,ml');
 assert.equal(r[0].admission_number,'HB001');assert.equal(r[0].preferred_language,'ml');
});
test('CSV row validation reports bad data instead of importing',()=>{
 const classes=[{name:'Class 3',id:'c3'}];const rows=[{row_number:2,name:'Ananya',admission_number:'HB001',class:'Class 3',guardian_phone:'+919999999999'},{row_number:3,name:'John',admission_number:'HB001',class:'Class 3'},{row_number:4,name:'Other',admission_number:'HB002',class:'Class 2'},{row_number:5,name:'Other',admission_number:'HB003',class:'Class 3',preferred_language:'fr'}];
 const r=previewRows(rows,classes);assert.deepEqual(r.map(x=>x.valid),[true,false,false,false]);
 assert.match(r[1].error,/Duplicate/);assert.match(r[2].error,/Class/);
});
test('CSV rejects malicious/invalid identifiers and phone',()=>{
 assert.match(validateStudent({name:'A',admission_number:'123',class:'Class 3'}).error,/name/);
 assert.match(validateStudent({name:'A Student',admission_number:'HB001',class:'Class 3',guardian_phone:'abc'}).error,/phone/);
});
test('Fee parsing stores exact integer paise',()=>{
 assert.equal(toPaise('1,250.50'),125050);assert.equal(toPaise('0.01'),1);assert.throws(()=>toPaise('1.234'));
 assert.throws(()=>toPaise('0'));assert.match(rupees(125050),/1,250.50/);
});
test('Financial balance excludes reversed payments',()=>{
 const v=balance({charges:[{amount_paise:20000}],discounts:[{amount_paise:1500}],payments:[{status:'posted',amount_paise:5000},{status:'reversed',amount_paise:1000}]});
 assert.deepEqual(v,{due_paise:18500,paid_paise:5000,balance_paise:13500});
});
test('Password hashing, verification and unique random credentials',async()=>{
 const hash=await hashPassword('StrongSecret!2026');assert.equal(await verifyPassword('StrongSecret!2026',hash),true);
 assert.equal(await verifyPassword('incorrect',hash),false);assert.notEqual(randomPassword(),randomPassword());
});
test('Normalize staff email and secure cookie',()=>{
 assert.equal(emailKey('  EXAMPLE@School.Org '),'example@school.org');
 const c=cookieForSession('someToken');assert.match(c,/HttpOnly/);assert.match(c,/Secure/);
 assert.equal(readCookie('other=x; hebron_session=someToken; foo=y'),'someToken');assert.equal(tokenHash('abc').length,64);
});
test('Permissions exclude teachers from financial transactions',()=>{
 assert.equal(authorized(['teacher'],'fees'),false);assert.equal(authorized(['accountant'],'fees'),true);
 assert.equal(authorized(['teacher'],'observation'),true);assert.equal(authorized(['store'],'observation'),false);
});
test('API health works with a mock database',async()=>{
 const r=await handleApi({method:'GET',path:'/api/health',db:basicDb(null)});assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).postgres,true);
});
test('Netlify function prefix resolves route correctly',async()=>{
 const r=await handleApi({method:'GET',path:'/.netlify/functions/api/health',db:basicDb(null)});assert.equal(r.statusCode,200);
});
test('Unauthenticated API requests rejected',async()=>{
 const r=await handleApi({method:'GET',path:'/api/students',db:basicDb(null)});assert.equal(r.statusCode,401);
});
test('Cross-origin POST blocked before parsing',async()=>{
 const r=await handleApi({method:'POST',path:'/api/login',headers:{origin:'https://malicious.example'},body:'{}',db:basicDb(null)});assert.equal(r.statusCode,403);
});
test('Teacher cannot invite other staff',async()=>{
 const r=await handleApi({method:'POST',path:'/api/staff/invite',headers,body:'{}',db:basicDb(fakeUser(['teacher']))});assert.equal(r.statusCode,403);
});
test('Teacher cannot create fee payments',async()=>{
 const r=await handleApi({method:'POST',path:'/api/fees/payment',headers,body:'{}',db:basicDb(fakeUser(['teacher']))});assert.equal(r.statusCode,403);
});
test('Only assigned class teacher may change student observations',async()=>{
 const body=JSON.stringify({student_id:'66666666-6666-4666-8666-666666666666',kind:'homework',outcome:'missing'});
 const r=await handleApi({method:'POST',path:'/api/observations',headers,body,db:basicDb(fakeUser(['teacher']))});assert.equal(r.statusCode,403);
});
test('Principal preview flags invalid CSV rows and preserves row numbers',async()=>{
 const body=JSON.stringify({rows:[{row_number:2,admission_number:'HB001',name:'Ananya',class:'Class 3'},{row_number:3,admission_number:'HB002',name:'Test',class:'Unknown'}]});
 const r=await handleApi({method:'POST',path:'/api/students/import/preview',headers,body,db:basicDb(fakeUser(['principal']))});
 assert.equal(r.statusCode,200);const data=JSON.parse(r.body);assert.equal(data.valid,1);assert.equal(data.invalid,1);assert.equal(data.rows[1].row_number,3);
});
test('Package does not publish private credentials or env files',async()=>{
 const files=await fs.readdir('dist');assert(!files.some(x=>x.startsWith('.env')));assert(!files.includes('neon.ts'));
});
test('Valid login issues HttpOnly session and never returns password hash',async()=>{
 const pw=await hashPassword('StrongPassword2026!');
 const db={query:async sql=>{
  if(sql.includes('FROM staff_users WHERE email='))return {rows:[{...fakeUser(['teacher']),password_hash:pw}],rowCount:1};
  if(sql.includes('INSERT INTO sessions'))return {rows:[],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const result=await handleApi({method:'POST',path:'/api/login',body:JSON.stringify({email:'demo@example.org',password:'StrongPassword2026!'}),db});
 assert.equal(result.statusCode,200);assert.match(result.headers['Set-Cookie'],/HttpOnly/);
 assert(!result.body.includes('password_hash'));
});
test('Posting payments needs accountant role and server stores paise with an idempotency key',async()=>{
 const id='66666666-6666-4666-8666-666666666666',ins='77777777-7777-4777-8777-777777777777';
 let insertParams=null;const conn={
   query:async (sql,params)=>{
    if(sql.includes('FROM students WHERE id=')&&sql.includes('FOR UPDATE'))return {rows:[{id}],rowCount:1};
    if(sql.includes('FROM fee_payments WHERE idempotency_key'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO fee_payments')){insertParams=params;return {rows:[{id:ins}],rowCount:1}};
    return {rows:[],rowCount:1};
   },release:()=>{}
 };
 const db={...basicDb(fakeUser(['accountant'])),connect:async()=>conn};
 const result=await handleApi({method:'POST',path:'/api/fees/payment',headers,body:JSON.stringify({student_id:id,amount_rupees:'2250.75',payment_method:'Cash',paid_on:'2026-11-08',idempotency_key:'absolutely-unique-key-1'}),db});
 assert.equal(result.statusCode,201);assert.equal(insertParams[1],225075);assert.equal(insertParams[7],'absolutely-unique-key-1');
});
test('Principal can prepare a staff invitation but it is not secretly emailed',async()=>{
 const id='77777777-7777-4777-8777-777777777777';
 const conn={query:async (sql,params)=>{
  if(sql.includes('INSERT INTO staff_users'))return {rows:[{id,email:params[1],name:params[2],roles:params[4]}],rowCount:1};
  return {rows:[],rowCount:1};
 },release:()=>{}};
 const db={...basicDb(fakeUser(['principal'])),connect:async()=>conn};
 const result=await handleApi({method:'POST',path:'/api/staff/invite',headers,body:JSON.stringify({name:'Sample Teacher',email:'sample.teacher@hebron.example',roles:['teacher']}),db});
 assert.equal(result.statusCode,201);const data=JSON.parse(result.body);assert.equal(data.delivery,'manual');assert.equal(data.staff.email,'sample.teacher@hebron.example');
 assert(data.temporary_password.length>=16);
});
test('Dashboard hides school-wide concerns from teacher roles',async()=>{
 const r=await handleApi({method:'GET',path:'/api/dashboard',headers,db:basicDb(fakeUser(['teacher']))});
 assert.equal(r.statusCode,200);assert.deepEqual(JSON.parse(r.body).escalations,[]);
});
test('Dashboard aggregates recorded attendance without counting unmarked students as present',async()=>{
 const base=basicDb(fakeUser(['principal']));
 const db={query:async(sql,params)=>{
 if(sql.includes('COUNT(s.id)')){assert(sql.includes("s.status='active'"));assert.equal(params[0],fakeUser([]).school_id);return {rows:[{id:'c',name:'Class 3',total:20,marked:12,present:10,absent:2}]};}
 if(sql.includes('FROM teacher_escalations'))return {rows:[]};
 return base.query(sql,params);
 }};
 const r=await handleApi({method:'GET',path:'/api/dashboard',headers,db});
 assert.equal(r.statusCode,200);const body=JSON.parse(r.body);assert.equal(body.absent_today,2);assert.equal(body.attendance_by_class[0].marked,12);
});
