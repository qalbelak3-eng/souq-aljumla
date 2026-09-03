// Souq Al-Jumla PWA Service Worker - Background Web Push Notifications Handler
self.addEventListener('push', function (event) {
  let title = 'سوق الجملة 🇮🇶';
  let body = 'لديك عرض جديد وتخفيضات خاصة في سوق الجملة!';
  let url = '/';

  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.data && data.data.url) url = data.data.url;
      else if (data.url) url = data.url;
    } catch {
      body = event.data.text() || body;
    }
  }

  // High-priority interactive mobile push options
  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: url },
    tag: 'souq-alert-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500],
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  let targetUrl = '/products?filter=offers';
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  // حماية أمنية: منع فتح مسارات الإدارة عبر الإشعارات
  if (targetUrl.startsWith('/admin') || targetUrl.includes('/admin/')) {
    if (targetUrl.includes('offer')) targetUrl = '/products?filter=offers';
    else if (targetUrl.includes('product')) targetUrl = '/products';
    else targetUrl = '/products?filter=offers';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // If a window is already open, focus it and navigate
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
