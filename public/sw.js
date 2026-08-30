// Souq Al-Jumla PWA Service Worker - Background Web Push Notifications Handler
self.addEventListener('push', function (event) {
  let title = 'سوق الجملة 🇮🇶';
  let body = 'لديك عرض جديد وتخفيضات خاصة في سوق الجملة!';
  let image = undefined;
  let url = '/';

  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.image) image = data.image;
      if (data.data && data.data.url) url = data.data.url;
      else if (data.url) url = data.url;
    } catch {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: '/app-icon.png',
    badge: '/app-icon.png',
    image: image || undefined,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'souq-aljumla-push-' + Date.now(),
    renotify: true,
    data: { url: url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  let targetUrl = '/';
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
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
