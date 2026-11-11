import fs from 'node:fs/promises';
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is missing. Run Neon init/deploy and load the server-side env vars.');process.exit(2);}
const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
try{
  const sql=await fs.readFile(new URL('../db/001_school.sql',import.meta.url),'utf8');
  await pool.query(sql);
  console.log('Database schema applied successfully. No real student records were seeded.');
}finally{await pool.end();}
