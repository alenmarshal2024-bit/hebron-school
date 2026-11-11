// Optional PWA setup; do not register the service worker in demos opened from file://.
if('serviceWorker' in navigator && location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
