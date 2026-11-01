/* Cible de partage Android (share_target du manifeste, en POST multipart), importée par le service worker
 * généré (vite-plugin-pwa, workbox.importScripts).
 * - Photos (pages de livre, captures) : rangées dans un cache, puis ouverture de /partage?photos=partage.
 * - Lien ou texte : renvoyés vers /partage en GET.
 * /partage propose ensuite : enregistrer directement, mettre de côté, à planifier, ou préremplir le formulaire. */

const SHARED_PHOTOS_CACHE = 'food-shared-photos'
const MAX_SHARED_PHOTOS = 3

async function handleShare(request) {
  const origin = self.location.origin
  let form
  try {
    form = await request.formData()
  } catch {
    return Response.redirect(`${origin}/partage`, 303)
  }
  const photos = form
    .getAll('photos')
    .filter((file) => typeof file === 'object' && file && typeof file.type === 'string' && file.type.startsWith('image/'))
    .slice(0, MAX_SHARED_PHOTOS)
  if (photos.length > 0) {
    await caches.delete(SHARED_PHOTOS_CACHE)
    const cache = await caches.open(SHARED_PHOTOS_CACHE)
    await Promise.all(
      photos.map((file, index) => cache.put(`${origin}/photo-partagee/${index}`, new Response(file, { headers: { 'content-type': file.type } }))),
    )
    return Response.redirect(`${origin}/partage?photos=partage`, 303)
  }
  const params = new URLSearchParams()
  for (const name of ['title', 'text', 'url']) {
    const value = form.get(name)
    if (typeof value === 'string' && value.trim() !== '') params.set(name, value)
  }
  return Response.redirect(`${origin}/partage?${params}`, 303)
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/partage') {
    // En cas d'imprévu (stockage plein, cache indisponible), on ouvre quand même l'application.
    event.respondWith(handleShare(event.request).catch(() => Response.redirect(`${self.location.origin}/partage?photos=partage`, 303)))
  }
})
