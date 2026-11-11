import { randomUUID } from 'node:crypto';
import { hashPassword,verifyPassword,randomPassword,randomToken,tokenHash,emailKey,readCookie,cookieForSession,clearCookie,ROLES,authorized } from './security.mjs';
import { previewRows,validateStudent } from './csv.mjs';
import { toPaise } from './finance.mjs';
const tz='Asia/Kolkata';const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:tz});
const reply=(status,data,headers={})=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers},body:JSON.stringify(data)});
const fail=(status,msg)=>reply(status,{error:msg});
const validUUID=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s||''));
const q=(db,sql,params=[])=>db.query(sql,params);
function cleanJson(body){if(body?.length>2_000_000)throw Error('Request body too large');return body?JSON.parse(body):{};}
function allowOrigin(headers){const origin=headers.origin||headers.Origin;return !origin|| origin===process.env.CORS_ORIGIN||origin==='http://localhost:4173';}
async function actor(db,headers){
  const token=readCookie(headers.cookie||headers.Cookie);if(!token)return null;
  const r=await q(db,`SELECT u.id,u.school_id,u.email,u.name,u.roles,u.status,u.must_change_password,u.profile_complete,u.phone,u.qualification,u.years_experience,u.address,u.subjects
      FROM sessions ss JOIN staff_users u ON u.id=ss.staff_id
      WHERE ss.token_hash=$1 AND ss.revoked_at IS NULL AND ss.expires_at>now() AND u.status <> 'disabled'`,[tokenHash(token)]);
  return r.rows[0]||null;
}
function actorView(u){return {id:u.id,email:u.email,name:u.name,roles:u.roles,status:u.status,must_change_password:u.must_change_password,profile_complete:u.profile_complete,phone:u.phone,qualification:u.qualification,years_experience:u.years_experience,address:u.address,subjects:u.subjects};}
async function audit(db,u,action,entity,entityId=null,details={}){return q(db,'INSERT INTO audit_events(school_id,actor_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',[u.school_id,u.id,action,entity,entityId,JSON.stringify(details)])}
async function requireClassTeacher(db,u,studentId){
  const r=await q(db,'SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=$1 AND s.school_id=$2 AND c.class_teacher_id=$3',[studentId,u.school_id,u.id]);
  return r.rowCount>0;
}
async function readStudents(db,u){
  const principal=u.roles.includes('principal');const teacher=u.roles.includes('teacher');
  const query=teacher&&!principal&&!authorized(u.roles,'fees')&&!u.roles.includes('store')&&!u.roles.includes('office')?
   `SELECT s.id,s.name,s.admission_number,c.name AS class_name,s.class_id,s.guardian_name,s.guardian_phone,s.preferred_language,s.whatsapp_consent
      FROM students s JOIN classes c ON c.id=s.class_id
      WHERE s.school_id=$1 AND (c.class_teacher_id=$2 OR EXISTS(SELECT 1 FROM staff_class_assignments a WHERE a.class_id=c.id AND a.staff_id=$2)) ORDER BY c.name,s.name`:
   `SELECT s.id,s.name,s.admission_number,c.name AS class_name,s.class_id,s.guardian_name,s.guardian_phone,s.preferred_language,s.whatsapp_consent
      FROM students s JOIN classes c ON c.id=s.class_id WHERE s.school_id=$1 ORDER BY c.name,s.name`;
  const params=query.includes('c.class_teacher_id=$2')?[u.school_id,u.id]:[u.school_id];
  const r=await q(db,query,params);
  // Teachers and store staff should not receive guardian phone numbers unless explicitly authorized.
  return r.rows.map(s=>u.roles.includes('principal')||u.roles.includes('office')||u.roles.includes('accountant')?s:{...s,guardian_phone:null});
}
export async function handleApi({method,path,headers={},body='',db}){
  try {
    method=method.toUpperCase();path=path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/,'/api').replace(/^\/api\/?/,'/').replace(/\/$/,'')||'/';
    const write=!['GET','HEAD','OPTIONS'].includes(method);
    if(write&&!allowOrigin(headers))return fail(403,'Invalid request origin');
    const input=write?cleanJson(body):{};
    if(method==='GET'&&path==='/health'){
      const r=await q(db,'SELECT CURRENT_TIMESTAMP AS checked_at');return reply(200,{ok:true,postgres:true,checked_at:r.rows[0].checked_at});
    }
    if(method==='POST'&&path==='/login'){
      const email=emailKey(input.email);const password=String(input.password||'');
      if(email.length>250||password.length>300)return fail(400,'Invalid credentials');
      const res=await q(db,"SELECT id,school_id,email,name,password_hash,roles,status,must_change_password,profile_complete FROM staff_users WHERE email=$1 AND status <> 'disabled' LIMIT 1",[email]);
      const u=res.rows[0];
      if(!u||!await verifyPassword(password,u.password_hash))return fail(401,'Incorrect email or password');
      const token=randomToken();
      await q(db,"INSERT INTO sessions(staff_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')",[u.id,tokenHash(token)]);
      return reply(200,{user:actorView(u)}, {'Set-Cookie':cookieForSession(token)});
    }
    const user=await actor(db,headers);
    if(!user)return fail(401,'Please sign in');
    if(method==='GET'&&path==='/me')return reply(200,{user:actorView(user)});
    if(method==='POST'&&path==='/logout'){
      const token=readCookie(headers.cookie||headers.Cookie);
      if(token)await q(db,'UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[tokenHash(token)]);
      return reply(200,{ok:true},{'Set-Cookie':clearCookie()});
    }
    if(method==='POST'&&path==='/change-password'){
      if(!await verifyPassword(input.current_password,(await q(db,'SELECT password_hash FROM staff_users WHERE id=$1',[user.id])).rows[0].password_hash))return fail(403,'Current password incorrect');
      const hash=await hashPassword(String(input.new_password||''));
      await q(db,'UPDATE staff_users SET password_hash=$1,must_change_password=false,status=$3,updated_at=now() WHERE id=$2',[hash,user.id,'active']);
      await q(db,'UPDATE sessions SET revoked_at=now() WHERE staff_id=$1 AND token_hash<>$2',[user.id,tokenHash(readCookie(headers.cookie||headers.Cookie))]);
      await audit(db,user,'password_changed','staff',user.id);
      return reply(200,{ok:true});
    }
    if(method==='POST'&&path==='/profile'){
      const name=String(input.name||user.name).trim();const phone=String(input.phone||'').trim();
      const qualification=String(input.qualification||'').trim();const address=String(input.address||'').trim();
      const exp=Number(input.years_experience||0);const subjects=String(input.subjects||'').trim();
      if(name.length<2||name.length>140||phone.length>25||qualification.length>180||address.length>400||subjects.length>250||!Number.isInteger(exp)||exp<0||exp>60)return fail(422,'Invalid staff profile fields');
      await q(db,'UPDATE staff_users SET name=$1,phone=$2,qualification=$3,address=$4,years_experience=$5,subjects=$6,profile_complete=true,updated_at=now() WHERE id=$7',[name,phone,qualification,address,exp,subjects,user.id]);
      await audit(db,user,'profile_updated','staff',user.id);
      return reply(200,{ok:true});
    }
    if(user.must_change_password)return fail(428,'Change the temporary password before continuing');
    if(user.roles.includes('teacher')&&!user.profile_complete)return fail(428,'Complete your teacher profile');
    if(method==='GET'&&path==='/classes'){
      const classes=await q(db,`SELECT c.id,c.name,c.class_teacher_id,u.name AS class_teacher FROM classes c LEFT JOIN staff_users u ON u.id=c.class_teacher_id
        WHERE c.school_id=$1 AND ($2::boolean OR c.class_teacher_id=$3 OR EXISTS(SELECT 1 FROM staff_class_assignments a WHERE a.staff_id=$3 AND a.class_id=c.id)) ORDER BY c.name`,[user.school_id,user.roles.some(r=>['principal','accountant','office','store'].includes(r)),user.id]);
      return reply(200,{classes:classes.rows});
    }
    if(method==='GET'&&path==='/students'){
      if(!authorized(user.roles,'student:read'))return fail(403,'Student directory access denied');
      return reply(200,{students:await readStudents(db,user)});
    }
    if(method==='POST'&&path==='/students'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may add students');
      const v=validateStudent(input);if(v.error)return fail(422,v.error);const s=v.value;
      const cls=(await q(db,'SELECT id FROM classes WHERE school_id=$1 AND lower(name)=lower($2)',[user.school_id,s.class])).rows[0];if(!cls)return fail(422,'Class not found');
      try{
        const r=await q(db,`INSERT INTO students(school_id,class_id,admission_number,name,guardian_name,guardian_phone,preferred_language)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,admission_number,name`,[user.school_id,cls.id,s.admission_number,s.name,s.guardian_name,s.guardian_phone,s.preferred_language]);
        await audit(db,user,'student_created','student',r.rows[0].id);
        return reply(201,{student:r.rows[0]});
      }catch(err){if(err.code==='23505')return fail(409,'Duplicate admission number');throw err;}
    }
    if(method==='POST'&&path==='/students/import/preview'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may import students');
      if(!Array.isArray(input.rows)||input.rows.length>1000)return fail(422,'Send no more than 1000 rows');
      const classes=(await q(db,'SELECT id,name FROM classes WHERE school_id=$1',[user.school_id])).rows;
      const existing=new Set((await q(db,'SELECT admission_number FROM students WHERE school_id=$1',[user.school_id])).rows.map(x=>x.admission_number));
      const rows=previewRows(input.rows,classes,existing);
      return reply(200,{rows,valid:rows.filter(x=>x.valid).length,invalid:rows.filter(x=>!x.valid).length});
    }
    if(method==='POST'&&path==='/students/import'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may import students');
      if(!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>1000)return fail(422,'Provide 1–1000 student rows');
      // Validation and writing happen inside one database transaction; no partial import due to server errors.
      const conn=await db.connect();let result;
      try{
        await conn.query('BEGIN');
        const classes=(await conn.query('SELECT id,name FROM classes WHERE school_id=$1',[user.school_id])).rows;
        const existing=new Set((await conn.query('SELECT admission_number FROM students WHERE school_id=$1 FOR UPDATE',[user.school_id])).rows.map(x=>x.admission_number));
        const preview=previewRows(input.rows,classes,existing);let accepted=0;
        for(const x of preview.filter(x=>x.valid)){
          try {
            await conn.query('SAVEPOINT student_row');
            const v=validateStudent(x).value;
            await conn.query(`INSERT INTO students(school_id,class_id,admission_number,name,guardian_name,guardian_phone,preferred_language)
                VALUES($1,$2,$3,$4,$5,$6,$7)`,[user.school_id,x.class_id,v.admission_number,v.name,v.guardian_name,v.guardian_phone,v.preferred_language]);
            await conn.query('RELEASE SAVEPOINT student_row');accepted++;
          }catch(e){await conn.query('ROLLBACK TO SAVEPOINT student_row');x.valid=false;x.error=e.code==='23505'?'Duplicate admission number': 'Database constraint failed';}
        }
        const errors=preview.filter(x=>!x.valid).map(x=>({row:x.row_number,admission_number:x.admission_number,reason:x.error}));
        await conn.query('INSERT INTO student_imports(school_id,created_by,total_rows,accepted_rows,rejected_rows,report) VALUES($1,$2,$3,$4,$5,$6)',[user.school_id,user.id,preview.length,accepted,errors.length,JSON.stringify(errors)]);
        await conn.query('INSERT INTO audit_events(school_id,actor_id,entity_type,action,details) VALUES($1,$2,$3,$4,$5)',[user.school_id,user.id,'student_import','students_imported',JSON.stringify({accepted,rejected:errors.length})]);
        await conn.query('COMMIT');result={accepted,rejected:errors.length,errors};
      }catch(err){await conn.query('ROLLBACK');throw err}finally{conn.release()}
      return reply(200,result);
    }
    if(method==='GET'&&path==='/staff'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may manage staff');
      const r=await q(db,'SELECT id,email,name,roles,status,profile_complete,must_change_password FROM staff_users WHERE school_id=$1 ORDER BY name',[user.school_id]);
      return reply(200,{staff:r.rows});
    }
    if(method==='POST'&&path==='/staff/invite'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may invite staff');
      const email=emailKey(input.email),name=String(input.name||'').trim();const roles=Array.isArray(input.roles)?input.roles:[];
      const classIds=Array.isArray(input.class_ids)?input.class_ids:[];
      if(!/^\S+@\S+\.\S+$/.test(email)||name.length<2||!roles.length||!roles.every(r=>ROLES.has(r))||classIds.length>30||!classIds.every(validUUID))return fail(422,'Invalid staff invitation');
      if(roles.includes('principal'))return fail(422,'Principal invitations require a separate secure approval flow');
      const pwd=randomPassword(),hash=await hashPassword(pwd);const conn=await db.connect();
      try{
        await conn.query('BEGIN');
        const r=await conn.query(`INSERT INTO staff_users(school_id,email,name,password_hash,roles,status,profile_complete,must_change_password)
            VALUES($1,$2,$3,$4,$5,'invited',$6,true) RETURNING id,email,name,roles`,[user.school_id,email,name,hash,roles,!roles.includes('teacher')]);
        const u=r.rows[0];
        for(const c of classIds){
          const check=(await conn.query('SELECT id FROM classes WHERE id=$1 AND school_id=$2',[c,user.school_id])).rows[0];if(!check)throw Error('Invalid assigned class');
          await conn.query('INSERT INTO staff_class_assignments(staff_id,class_id) VALUES($1,$2)',[u.id,c]);
          if(input.class_teacher_id===c)await conn.query('UPDATE classes SET class_teacher_id=$1 WHERE id=$2 AND school_id=$3',[u.id,c,user.school_id]);
        }
        await conn.query('INSERT INTO audit_events(school_id,actor_id,entity_type,entity_id,action) VALUES($1,$2,$3,$4,$5)',[user.school_id,user.id,'staff',u.id,'staff_invited']);
        await conn.query('COMMIT');return reply(201,{staff:u,temporary_password:pwd,delivery:'manual'});
      }catch(err){await conn.query('ROLLBACK');if(err.code==='23505')return fail(409,'Email is already registered');throw err}finally{conn.release()}
    }
    if(method==='PATCH'&&/^\/staff\/[0-9a-f-]+$/.test(path)){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may change access');
      const id=path.split('/').pop();if(!validUUID(id)||id===user.id)return fail(422,'Cannot disable your own account');
      if(input.status!=='disabled')return fail(422,'Only account deactivation is supported here');
      const r=await q(db,"UPDATE staff_users SET status='disabled',updated_at=now() WHERE id=$1 AND school_id=$2 AND NOT ('principal'=ANY(roles)) RETURNING id",[id,user.school_id]);
      if(!r.rowCount)return fail(404,'Staff not found or protected');
      await q(db,'UPDATE sessions SET revoked_at=now() WHERE staff_id=$1',[id]);
      await q(db,'UPDATE classes SET class_teacher_id=NULL WHERE class_teacher_id=$1 AND school_id=$2',[id,user.school_id]);
      await audit(db,user,'staff_disabled','staff',id);
      return reply(200,{ok:true});
    }
    if(method==='GET'&&path==='/fees/summary'){
      if(!authorized(user.roles,'fees'))return fail(403,'Financial access denied');
      const r=await q(db,`SELECT
        COALESCE((SELECT SUM(fc.amount_paise) FROM fee_charges fc JOIN students s ON s.id=fc.student_id WHERE s.school_id=$1),0)::text AS charges,
        COALESCE((SELECT SUM(fd.amount_paise) FROM fee_discounts fd JOIN students s ON s.id=fd.student_id WHERE s.school_id=$1),0)::text AS discounts,
        COALESCE((SELECT SUM(fp.amount_paise) FROM fee_payments fp JOIN students s ON s.id=fp.student_id WHERE s.school_id=$1 AND fp.status='posted'),0)::text AS collected,
        COALESCE((SELECT SUM(fp.amount_paise) FROM fee_payments fp JOIN students s ON s.id=fp.student_id WHERE s.school_id=$1 AND fp.status='posted' AND fp.paid_on=$2),0)::text AS collected_today`,[user.school_id,today()]);
      return reply(200,{summary:r.rows[0]});
    }
    if(method==='GET'&&/^\/fees\/students\/[0-9a-f-]+$/.test(path)){
      if(!authorized(user.roles,'fees'))return fail(403,'Financial access denied');
      const id=path.split('/').pop();if(!validUUID(id))return fail(422,'Invalid student');
      const student=(await q(db,'SELECT id,name,admission_number FROM students WHERE id=$1 AND school_id=$2',[id,user.school_id])).rows[0];if(!student)return fail(404,'Student not found');
      const charges=(await q(db,'SELECT id,category,amount_paise,due_on FROM fee_charges WHERE student_id=$1 ORDER BY due_on',[id])).rows;
      const discounts=(await q(db,'SELECT id,reason,amount_paise FROM fee_discounts WHERE student_id=$1',[id])).rows;
      const payments=(await q(db,'SELECT id,amount_paise,paid_on,payment_method,reference,status FROM fee_payments WHERE student_id=$1 ORDER BY paid_on DESC',[id])).rows;
      return reply(200,{student,charges,discounts,payments});
    }
    if(method==='POST'&&path==='/fees/charge'){
      if(!authorized(user.roles,'fees'))return fail(403,'Financial access denied');
      const id=String(input.student_id||'');const amt=toPaise(input.amount_rupees);const cat=String(input.category||'').trim().slice(0,80);
      if(!validUUID(id)||!cat)return fail(422,'Invalid fee charge');
      const exists=(await q(db,'SELECT 1 FROM students WHERE id=$1 AND school_id=$2',[id,user.school_id])).rowCount;
      if(!exists)return fail(404,'Student not found');
      const r=await q(db,'INSERT INTO fee_charges(student_id,category,amount_paise,due_on,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[id,cat,amt,input.due_on||null,user.id]);
      await audit(db,user,'fee_charge_created','fee_charge',r.rows[0].id,{student_id:id,amount_paise:amt});
      return reply(201,{ok:true});
    }
    if(method==='POST'&&path==='/fees/payment'){
      if(!authorized(user.roles,'fees'))return fail(403,'Financial access denied');
      const studentId=String(input.student_id||'');const amount=toPaise(input.amount_rupees);
      const methodName=String(input.payment_method||'');const date=String(input.paid_on||today());const key=String(input.idempotency_key||'');
      if(!validUUID(studentId)||!['Cash','UPI','Bank transfer','Cheque','Other'].includes(methodName)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||key.length<16||key.length>90)return fail(422,'Invalid payment fields');
      const conn=await db.connect();
      try{
        await conn.query('BEGIN');
        const student=(await conn.query('SELECT id FROM students WHERE id=$1 AND school_id=$2 FOR UPDATE',[studentId,user.school_id])).rows[0];
        if(!student){await conn.query('ROLLBACK');return fail(404,'Student not found')}
        const existing=(await conn.query('SELECT id,student_id,amount_paise FROM fee_payments WHERE idempotency_key=$1',[key])).rows[0];
        if(existing){await conn.query('COMMIT');return existing.student_id===studentId && Number(existing.amount_paise)===amount?reply(200,{ok:true,duplicate:true,id:existing.id}):fail(409,'Payment key was already used');}
        const inserted=await conn.query(`INSERT INTO fee_payments(student_id,amount_paise,payment_method,paid_on,reference,note,recorded_by,idempotency_key)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[studentId,amount,methodName,date,String(input.reference||'').slice(0,100),String(input.note||'').slice(0,500),user.id,key]);
        await conn.query('INSERT INTO audit_events(school_id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',[user.school_id,user.id,'payment',inserted.rows[0].id,'fee_payment_recorded',JSON.stringify({amount_paise:amount,student_id:studentId})]);
        await conn.query('COMMIT');return reply(201,{ok:true,id:inserted.rows[0].id});
      }catch(e){await conn.query('ROLLBACK');if(e.code==='23505')return fail(409,'Duplicate payment key');throw e}finally{conn.release()}
    }
    if(method==='GET'&&path==='/dashboard'){
      if(!user.roles.includes('principal'))return reply(200,{attendance_by_class:[],escalations:[]});
      const a=await q(db,`SELECT c.id,c.name,COUNT(s.id)::int AS total,COUNT(e.id)::int AS marked,
        COUNT(e.id) FILTER (WHERE e.status IN ('present','late','half'))::int AS present,
        COUNT(e.id) FILTER (WHERE e.status='absent')::int AS absent
        FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.school_id=$1 AND s.status='active'
        LEFT JOIN attendance_entries e ON e.student_id=s.id AND e.on_date=$2
        WHERE c.school_id=$1 GROUP BY c.id,c.name ORDER BY c.name`,[user.school_id,today()]);
      const b=await q(db,`SELECT e.id,e.title,e.urgency,e.status,e.created_at,s.name AS student_name
          FROM teacher_escalations e JOIN students s ON s.id=e.student_id WHERE s.school_id=$1 AND e.status<>'resolved' ORDER BY e.created_at DESC LIMIT 10`,[user.school_id]);
      return reply(200,{attendance_by_class:a.rows,absent_today:a.rows.reduce((n,r)=>n+Number(r.absent),0),escalations:b.rows});
    }
    if(method==='POST'&&path==='/escalations'){
      if(!authorized(user.roles,'observation'))return fail(403,'Teacher access required');
      if(!validUUID(input.student_id)||!await requireClassTeacher(db,user,input.student_id))return fail(403,'Only the assigned class teacher can report concerns');
      const title=String(input.title||'').trim(),details=String(input.details||'').trim();
      if(title.length<4||title.length>160||details.length>2000)return fail(422,'Invalid escalation');
      const r=await q(db,`INSERT INTO teacher_escalations(student_id,teacher_id,title,details,urgency)
        VALUES($1,$2,$3,$4,$5) RETURNING id`,[input.student_id,user.id,title,details,input.urgency==='high'?'high':'normal']);
      await audit(db,user,'escalation_opened','escalation',r.rows[0].id);
      return reply(201,{ok:true});
    }
    if(method==='POST'&&path==='/observations'){
      if(!authorized(user.roles,'observation'))return fail(403,'Teacher access required');
      if(!validUUID(input.student_id)||!await requireClassTeacher(db,user,input.student_id))return fail(403,'Only the assigned class teacher may update observations');
      if(!['homework','uniform','books','late','punctuality','cleanliness','outcome'].includes(input.kind)||!['good','needs_improvement','not_observed','missing','incomplete','late'].includes(input.outcome))return fail(422,'Invalid observation');
      const r=await q(db,`INSERT INTO student_observations(student_id,created_by,on_date,kind,outcome,comments)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[input.student_id,user.id,today(),input.kind,input.outcome,String(input.comments||'').slice(0,1000)]);
      await audit(db,user,'observation_created','observation',r.rows[0].id);
      return reply(201,{ok:true});
    }
    if(method==='GET'&&path==='/services'){
      if(!user.roles.includes('principal'))return fail(403,'Only principal may view integrations');
      return reply(200,{postgres:true,auth_provisioned:!!process.env.NEON_AUTH_BASE_URL,ai_gateway_configured:!!process.env.NEON_AI_GATEWAY_BASE_URL,storage_configured:!!process.env.AWS_ENDPOINT_URL_S3,realtime_configured:!!process.env.NEON_REALTIME_SECRET,whatsapp:'not_configured',note:'Presence of environment variables does not prove service integration or connectivity'});
    }
    return fail(404,'Unknown API endpoint');
  } catch(e) {
    // Do not leak SQL, student data, or credentials to callers.
    if(e instanceof SyntaxError)return fail(400,'Invalid JSON');
    if(/Password must|Invalid or oversized|Amount must|valid rupee/.test(e.message||''))return fail(422,e.message);
    console.error('Hebron API error:',e?.message);
    return fail(500,'A server error occurred. Please contact the school administrator.');
  }
}
