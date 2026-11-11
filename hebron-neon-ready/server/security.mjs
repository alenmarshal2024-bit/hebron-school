import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCb);
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
export function emailKey(v){return String(v??'').trim().toLowerCase();}
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<10||password.length>200)throw new Error('Password must contain 10–200 characters');
  const salt=randomBytes(16).toString('hex');
  const out=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt$16384$${salt}$${out.toString('hex')}`;
}
export async function verifyPassword(password,stored){
  if(typeof stored!=='string'||!stored.startsWith('scrypt$'))return false;
  const parts=stored.split('$'); if(parts.length!==4||parts[1]!=='16384')return false;
  const expected=Buffer.from(parts[3],'hex'); if(expected.length!==64)return false;
  const actual=await scrypt(String(password),parts[2],64,{N:16384,r:8,p:1});
  return equal(expected,actual);
}
export function randomPassword(){return randomBytes(18).toString('base64url');}
export function randomToken(){return randomBytes(32).toString('base64url');}
export function tokenHash(token){return createHash('sha256').update(token).digest('hex');}
export function cookieForSession(token,age=60*60*24*7){return `hebron_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;}
export function clearCookie(){return 'hebron_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';}
export function readCookie(hdr, key='hebron_session'){
  const pair=String(hdr??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='));
  return pair?pair.slice(key.length+1):null;
}
export const ROLES=new Set(['principal','teacher','accountant','store','office','canteen','sports']);
export function authorized(roles,action){
  const set=new Set(roles||[]);if(set.has('principal'))return true;
  if(action==='student:read')return [...set].some(x=>['teacher','accountant','store','office'].includes(x));
  if(action==='attendance')return set.has('teacher')||set.has('office');
  if(action==='observation')return set.has('teacher');
  if(action==='fees')return set.has('accountant');
  if(action==='store')return set.has('store');
  if(action==='profile')return set.size>0;
  return false;
}
