const TRACE_MIND_SERVICE_WORKER_VERSION = "2026-06-11.1";
const TRACE_MIND_PAGE_CACHE = `tracemind-page-shell-${TRACE_MIND_SERVICE_WORKER_VERSION}`;
const TRACE_MIND_PAGE_CACHE_PREFIX = "tracemind-page-shell-";
const TRACE_MIND_SHELL_URL = "/";
const TRACE_MIND_CAPTURE_SCRIPT_URL = "/capture.js";
const TRACE_MIND_CAPTURE_SCRIPT_PATTERN = /^\/capture(?:\.[a-f0-9]+)?\.js$/i;
const TRACE_MIND_PRE_CACHE_URLS = [
  TRACE_MIND_SHELL_URL,
  "/site.webmanifest",
  "/favicon.svg",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-192.png",
  "/pwa/icon-maskable-512.png",
  "/pwa/apple-touch-icon.png",
];
const TRACE_MIND_STATIC_DESTINATIONS = new Set([
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "worker",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(TRACE_MIND_PAGE_CACHE)
      .then((cache) => cache.addAll(TRACE_MIND_PRE_CACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => {
      if (
        cacheName.startsWith(TRACE_MIND_PAGE_CACHE_PREFIX)
        && cacheName !== TRACE_MIND_PAGE_CACHE
      ) {
        return caches.delete(cacheName);
      }

      return false;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!shouldHandleRequest(request)) return;

  if (isNavigationRequest(request)) {
    const refreshPromise = refreshShell();
    event.waitUntil(refreshPromise.catch(() => null));
    event.respondWith(handleNavigationRequest(request, refreshPromise));
    return;
  }

  if (TRACE_MIND_STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(handleStaticAssetRequest(request));
  }
});

function shouldHandleRequest(request) {
  if (!request || request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) return false;
  if (url.pathname.startsWith("/sockjs/")) return false;
  if (
    url.pathname === TRACE_MIND_CAPTURE_SCRIPT_URL
    || TRACE_MIND_CAPTURE_SCRIPT_PATTERN.test(url.pathname)
  ) {
    return false;
  }

  return true;
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

async function handleNavigationRequest(request, refreshPromise) {
  const cache = await caches.open(TRACE_MIND_PAGE_CACHE);
  const cachedShell = await cache.match(TRACE_MIND_SHELL_URL);

  if (cachedShell) return cachedShell;

  try {
    return await refreshPromise;
  } catch (error) {
    return fetch(request);
  }
}

async function refreshShell() {
  const cache = await caches.open(TRACE_MIND_PAGE_CACHE);
  const response = await fetch(TRACE_MIND_SHELL_URL);

  if (isCacheableResponse(response)) {
    await cache.put(TRACE_MIND_SHELL_URL, response.clone());
  }

  return response;
}

async function handleStaticAssetRequest(request) {
  const cache = await caches.open(TRACE_MIND_PAGE_CACHE);
  const cachedAsset = await cache.match(request);

  if (cachedAsset) return cachedAsset;

  const response = await fetch(request);

  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }

  return response;
}

function isCacheableResponse(response) {
  return Boolean(response && response.ok && (response.type === "basic" || response.type === "default"));
}
