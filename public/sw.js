// Reutiliza o worker do OneSignal dentro do teu SW
importScripts('https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js');

// SW básico para PWA (tem fetch handler -> torna instalável)
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { self.clients.claim(); });
self.addEventListener('fetch', () => { /* no-op fetch handler */ });
