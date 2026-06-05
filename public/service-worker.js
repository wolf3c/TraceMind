const TRACE_MIND_SERVICE_WORKER_VERSION = "2026-06-05.1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
