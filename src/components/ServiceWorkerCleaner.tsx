'use client';

import { useEffect } from 'react';

export default function ServiceWorkerCleaner() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Only unregister rogue service workers not matching /sw.js
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            if (registration.active && registration.active.scriptURL && registration.active.scriptURL.endsWith('/sw.js')) {
              // Keep our official Web Push service worker active
              continue;
            }
            registration.unregister().then((success) => {
              if (success) {
                console.log('Unregistered stale service worker:', registration.scope);
              }
            });
          }
        });
      }

      // 2. Clear any stale CacheStorage entries from previous localhost projects
      if ('caches' in window) {
        caches.keys().then((cacheNames) => {
          for (const cacheName of cacheNames) {
            caches.delete(cacheName).then(() => {
              console.log('Cleared stale cache:', cacheName);
            });
          }
        });
      }
    }
  }, []);

  return null;
}
