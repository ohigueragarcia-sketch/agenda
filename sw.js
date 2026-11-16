const CACHE = 'agenda-v3';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// ---- Resumen diario ----
function leerDatos() {
  return new Promise(res => {
    const r = indexedDB.open('agenda', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => res([]);
    r.onsuccess = () => {
      const g = r.result.transaction('kv').objectStore('kv').get('datos');
      g.onsuccess = () => { res(g.result || []); r.result.close(); };
      g.onerror = () => res([]);
    };
  });
}
async function resumen() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const hoy = d.toISOString().slice(0, 10);
  const cache = await caches.open('agenda-estado');
  const ult = await cache.match('ultimo-resumen');
  if (ult && (await ult.text()) === hoy) return;
  const datos = (await leerDatos()).filter(x => !x.hecho && x.fecha);
  const deHoy = datos.filter(x => x.fecha === hoy), atras = datos.filter(x => x.fecha < hoy);
  if (!deHoy.length && !atras.length) return;
  const lineas = deHoy.slice(0, 4).map(x => (x.hora ? x.hora + ' ' : '') + x.titulo);
  let titulo = deHoy.length ? `Hoy tiene ${deHoy.length} cosa${deHoy.length > 1 ? 's' : ''} apuntada${deHoy.length > 1 ? 's' : ''}` : 'Tiene cosas atrasadas';
  if (atras.length) lineas.push(`${atras.length} atrasada${atras.length > 1 ? 's' : ''}`);
  await self.registration.showNotification(titulo, { body: lineas.join('\n'), icon: 'icon-192.png', badge: 'icon-192.png', tag: 'resumen' });
  await cache.put('ultimo-resumen', new Response(hoy));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'resumen') e.waitUntil(resumen()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
