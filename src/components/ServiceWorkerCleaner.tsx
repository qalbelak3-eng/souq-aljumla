'use client';

import { useEffect } from 'react';

export default function ServiceWorkerCleaner() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Only unregister rogue service workers not matching /sw.js
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            const scriptUrl = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || '';
            if (scriptUrl.includes('sw.js')) {
              // هذا هو الـ Service Worker الرسمي للإشعارات، نتركه نشطاً دائماً
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
