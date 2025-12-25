/**
 * ChatHub Service Worker
 * Enables offline functionality and PWA installation
 */

const CACHE_NAME = 'chathub-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/chat-app.js',
    '/js/chat-indexer.js',
    '/js/config.js',
    '/manifest.json'
];

// CDN assets to cache
const CDN_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip API calls - always go to network
    if (url.hostname === 'api.groq.com') {
        return;
    }

    // For same-origin requests
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) {
                        // Return cached, but also update cache in background
                        event.waitUntil(
                            fetch(request)
                                .then(response => {
                                    if (response.ok) {
                                        caches.open(CACHE_NAME)
                                            .then(cache => cache.put(request, response));
                                    }
                                })
                                .catch(() => { })
                        );
                        return cached;
                    }
                    return fetch(request)
                        .then(response => {
                            if (response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(request, clone));
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // For CDN resources - cache first, then network
    if (CDN_ASSETS.some(asset => request.url.startsWith(asset.split('?')[0]))) {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) return cached;
                    return fetch(request)
                        .then(response => {
                            if (response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(request, clone));
                            }
                            return response;
                        });
                })
        );
    }
});

// Handle push notifications (for future use)
self.addEventListener('push', event => {
    const options = {
        body: event.data?.text() || 'New message from ChatHub',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100]
    };

    event.waitUntil(
        self.registration.showNotification('ChatHub', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
