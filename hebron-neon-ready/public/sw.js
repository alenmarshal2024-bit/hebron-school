// Static offline shell only. NEVER cache API responses, attendance, student records or financial data.
const CACHE='hebron-shell-v2';
const STATIC=['/','/index.html','/styles.css','/app.js','/csv.js','/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return; e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
