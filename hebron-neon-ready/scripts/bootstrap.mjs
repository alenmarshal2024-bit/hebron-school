// Run with ADMIN_EMAIL and ADMIN_PASSWORD in the environment after DB migration.
// No hardcoded demo account is ever shipped as a real production credential.
import { hashPassword, emailKey } from '../server/security.mjs';
const email=emailKey(process.env.ADMIN_EMAIL);const pwd=process.env.ADMIN_PASSWORD;
if(!process.env.DATABASE_URL||!email||!pwd){console.error('Required: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD');process.exit(2)}
const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:{rejectUnauthorized:false}});
try{
  const hash=await hashPassword(pwd);
  await pool.query('BEGIN');
  let school=(await pool.query('SELECT id FROM schools WHERE name=$1 LIMIT 1',['Hebron School'])).rows[0];
  if(!school){school=(await pool.query('INSERT INTO schools(name) VALUES($1) RETURNING id',['Hebron School'])).rows[0];}
  let year=(await pool.query('SELECT id FROM academic_years WHERE school_id=$1 AND label=$2',[school.id,'2026-27'])).rows[0];
  if(!year)year=(await pool.query('INSERT INTO academic_years(school_id,label,active) VALUES($1,$2,true) RETURNING id',[school.id,'2026-27'])).rows[0];
  for(const c of ['LKG','UKG',...Array.from({length:10},(_,i)=>'Class '+(i+1))]){
    await pool.query('INSERT INTO classes(school_id,academic_year_id,name) VALUES($1,$2,$3) ON CONFLICT (school_id,academic_year_id,name) DO NOTHING',[school.id,year.id,c]);
  }
  const existing=(await pool.query('SELECT id FROM staff_users WHERE school_id=$1 AND email=$2',[school.id,email])).rows[0];
  if(existing)throw Error('Admin already exists. Refusing to overwrite admin password; use a reset workflow instead.');
  await pool.query(`INSERT INTO staff_users(school_id,email,name,password_hash,roles,status,must_change_password,profile_complete)
    VALUES($1,$2,$3,$4,ARRAY['principal']::text[],'active',false,true)`,[school.id,email,'Hebron Principal',hash]);
  await pool.query('COMMIT');console.log('Created the first principal and default class list. Remove ADMIN_PASSWORD from shell history if entered there.');
}catch(e){await pool.query('ROLLBACK');console.error(e.message);process.exitCode=1}finally{await pool.end()}
