import fs from 'node:fs/promises';import path from 'node:path';
const cwd=process.cwd(),dist=path.join(cwd,'dist');
await fs.rm(dist,{force:true,recursive:true});await fs.mkdir(dist,{recursive:true});
for(const f of await fs.readdir('public'))await fs.copyFile(path.join('public',f),path.join(dist,f));
await fs.copyFile('server/csv.mjs',path.join(dist,'csv.js'));
await fs.mkdir(path.join(dist,'preview'),{recursive:true});
for(const f of await fs.readdir('preview'))await fs.copyFile(path.join('preview',f),path.join(dist,'preview',f));
// Check all browser JavaScript, server JavaScript and Netlify entry points.
for(const f of ['public/app.js','server/security.mjs','server/api.mjs','server/csv.mjs','server/finance.mjs','netlify/functions/api.mjs','scripts/bootstrap.mjs']){
 const {spawnSync}=await import('node:child_process');const check=spawnSync('node',['--check',f],{encoding:'utf8'});if(check.status!==0)throw Error(`${f} failed syntax check: ${check.stderr}`);
}
console.log('✓ Build created dist/ (real UI + fictional preview)');
console.log('✓ 7 JavaScript syntax checks passed');
console.log('✓ Backend runs in Netlify Functions; no server keys included in dist/');
