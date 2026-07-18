// Bumped for the Quotr -> Stipt rebrand — forces already-installed PWAs to
// drop every old-branded cached asset (icons, old CSS/JS chunks) on next
// launch, rather than waiting for a version they'll never naturally reach.
const CACHE = 'stipt-v1'
const PRECACHE = ['/login']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase.co')) return

  // Navigation requests (HTML pages) are auth-gated — always go to the network.
  // Caching them risks serving a stale redirect or a logged-out page shell.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request))
    return
  }

  // Static assets: network-first, cache as fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
