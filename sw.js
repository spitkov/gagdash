// sw.js

self.addEventListener('push', event => {
    const data = event.data.json();

    const options = {
        body: data.body,
        icon: data.icon,
        image: data.image,
        data: {
            url: self.location.origin // Store the origin URL to focus or open on click
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // If a window is already open, focus it.
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window.
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
}); 