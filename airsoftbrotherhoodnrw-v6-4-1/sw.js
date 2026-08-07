
const CACHE = "airsoftbrotherhoodnrw-v6-4-1";
const STATIC_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=641",
  "./app.js?v=641",
  "./config.js",
  "./manifest.webmanifest?v=641",
  "./team-wappen.jpg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Supabase/API-Aufrufe niemals cachen.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => cached || caches.match("./index.html"))
      )
  );
});
