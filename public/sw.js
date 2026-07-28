const CACHE_VERSION = "draw-gyotong-v3";
const APP_CACHE = `${CACHE_VERSION}-app`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

// 앱 화면을 띄우는 최소 파일은 설치 시 미리 저장한다. 지도 타일은 용량이 크므로
// 사용자가 실제로 본 영역만 fetch 이벤트에서 별도 캐시에 쌓는다.
const APP_SHELL = ["/", "/manifest.webmanifest"];
const TILE_HOSTS = new Set([
  "tile.openstreetmap.org",
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
  "a.tiles.openrailwaymap.org",
  "b.tiles.openrailwaymap.org",
  "c.tiles.openrailwaymap.org",
  "a.tile.opentopomap.org",
  "b.tile.opentopomap.org",
  "c.tile.opentopomap.org"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 새 버전이 활성화되면 이전 버전 캐시를 제거해 오래된 UI 파일이 섞이지 않게 한다.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (TILE_HOSTS.has(url.hostname)) {
    // 지도 타일은 오프라인 재사용이 중요하므로 캐시를 먼저 확인한다.
    event.respondWith(cacheFirst(request, TILE_CACHE, 480));
    return;
  }

  if (url.origin === self.location.origin) {
    // 앱 코드는 최신 버전을 우선하되, 네트워크 장애 시 저장본으로 실행한다.
    event.respondWith(networkFirst(request, APP_CACHE));
  }
});

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cache, maxEntries);
    }
    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Offline tile unavailable" });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function trimCache(cache, maxEntries) {
  // Cache API는 자동 용량 제한이 없으므로 가장 오래된 요청부터 하나씩 비운다.
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await cache.delete(keys[0]);
  return trimCache(cache, maxEntries);
}
