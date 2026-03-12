import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

import { clientsClaim, skipWaiting } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

// Immediately claim clients so push notifications can register without reloading all tabs
skipWaiting();
clientsClaim();

// We need this line to allow vite-plugin-pwa to inject the precache manifest properly
// @ts-ignore
precacheAndRoute(self.__WB_MANIFEST || []);

const firebaseConfig = {
    apiKey: "AIzaSyDMz7qSsXY8dwq95fR9WHMMfqWYV9_jUTY",
    authDomain: "zifiri-arts.firebaseapp.com",
    projectId: "zifiri-arts",
    storageBucket: "zifiri-arts.firebasestorage.app",
    messagingSenderId: "339084266093",
    appId: "1:339084266093:web:0e91d4446b60cb6dc94d64"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // When the server sends a "notification" property, the OS (Android/iOS) 
    // often handles showing the notification automatically.
    // We only need to show it manually if we sent a "data-only" message.
    if (!payload.notification) {
        const notificationTitle = 'Yeni Bildirim';
        const notificationOptions = {
            body: payload.data?.message || 'Yeni bir siparişiniz var.',
            icon: '/pwa-192x192.png'
        };
        // @ts-ignore
        self.registration.showNotification(notificationTitle, notificationOptions);
    }
});
