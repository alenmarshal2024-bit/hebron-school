import { handleApi } from '../../server/api.mjs';
let pool;
async function getPool(){
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL was not configured on this hosting environment');
  if(!pool){const { Pool }=await import('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:8000});}
  return pool;
}
export async function handler(event){
  try {
    const db=await getPool();
    return await handleApi({method:event.httpMethod,path:event.path,headers:event.headers,body:event.body||''},db);
  } catch (e) {console.error('Netlify function not ready',e?.message);return {statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'School database unavailable; check Neon and hosting configuration'})}}
}
