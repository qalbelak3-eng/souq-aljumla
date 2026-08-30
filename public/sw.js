// Souq Al-Jumla PWA Service Worker - Background Web Push Notifications Handler
self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'سوق الجملة 🇮🇶';
    const options = {
      body: data.body || 'لديك إشعار جديد من سوق الجملة',
      icon: data.icon || '/app-icon.png',
      badge: data.badge || '/app-icon.png',
      image: data.image || undefined,
      vibrate: [200, 100, 200, 100, 200],
      dir: 'rtl',
      lang: 'ar',
      data: data.data || { url: '/' },
      requireInteraction: true,
      actions: [
        {
          action: 'open_url',
          title: 'عرض وتصفح العرض 🛍️',
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event:', err);
  }
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
