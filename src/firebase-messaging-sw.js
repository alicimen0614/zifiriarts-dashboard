import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

import { precacheAndRoute } from 'workbox-precaching';

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
    const notificationTitle = payload.notification?.title || 'Yeni Bildirim';
    const notificationOptions = {
        body: payload.notification?.body,
        icon: '/pwa-192x192.png'
    };

    // @ts-ignore
    self.registration.showNotification(notificationTitle, notificationOptions);
});
