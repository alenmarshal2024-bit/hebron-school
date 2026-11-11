import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
const cwd=process.cwd(),root=path.join(cwd,'dist');
const extTypes={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 let file;
 try {const decoded=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(decoded.endsWith('/')?decoded+'index.html':decoded));
   if(!(file===root||file.startsWith(root+path.sep)))throw Error('Forbidden');
   if(decoded.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local static server: connect a hosted Neon backend and Netlify Functions for real accounts'}));return}
   const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':extTypes[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 } catch {res.writeHead(404);res.end('Not found')}
});server.listen(4173,'127.0.0.1',()=>console.log('Static preview at http://localhost:4173 (real API requires Netlify + Neon)'));
