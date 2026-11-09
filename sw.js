// AfriFloW PWA: intentionally no fetch interception or caching.
// Live Supabase, Dropbox and chatbot requests remain unchanged.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
