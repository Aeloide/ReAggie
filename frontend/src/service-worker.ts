/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sv = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;

const ASSETS = [
  ...build,
  ...files
];

sv.addEventListener("push", ev => {
    ev.waitUntil((async () => {
        const clients = sv.clients;
        const matched = await clients.matchAll({ includeUncontrolled: true });
        if (!ev.data) return;
        const data = ev.data.json();
        const { event: pushEvent, rid, name } = data;
        const url = rid && `https://jiggie.fun/${rid}`;
        if (matched.some(c => (c as WindowClient).focused && c.url.includes(rid)))
            return;
        switch (pushEvent) {
            case "create":
                await sv.registration.showNotification(`${name} created a room!`, {
                    body: 'Click here to join them on jiggie.fun!',
                    requireInteraction: false,
                    icon: '/assets/jig.png',
                    data: { url }
                });
                break;
            case "joined":
                await sv.registration.showNotification(`${name} joined a room!`, {
                    body: 'Click here to join them on jiggie.fun!',
                    requireInteraction: false,
                    icon: '/assets/jig.png',
                    data: { url }
                });
                break;
            case "custom":
                await sv.registration.showNotification(data.body?.title || 'test', {
                    body: data.body || 'test2',
                    requireInteraction: false,
                    icon: data.icon || '/assets/jig.png',
                    data: { url: data.url || url }
                });
                break;
        }
    })());
});

sv.addEventListener("notificationclick", ev => {
    ev.notification.close();
    const { url } = ev.notification.data;
    const clients = sv.clients;
    ev.waitUntil(clients.openWindow?.(url));
});
