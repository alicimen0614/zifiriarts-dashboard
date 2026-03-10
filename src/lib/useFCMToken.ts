import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

export function useFCMToken(userId: string | null) {
    const [token, setToken] = useState<string | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );

    useEffect(() => {
        // Escalate permissions if we already have it from before
        if (permissionStatus === 'granted' && userId && messaging) {
            requestAndSaveToken(userId);
        }
    }, [permissionStatus, userId]);

    // Handle incoming messages while app is in foreground
    useEffect(() => {
        if (!messaging) return;
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('Message received in foreground: ', payload);
            // Optional: Show in-app toast notification here if desired
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const requestAndSaveToken = async (uid: string) => {
        if (!messaging) {
            console.error("Messaging not supported on this device/browser");
            return null;
        }

        try {
            // We MUST wait for .ready so the SW is fully active. If it's still installing, Push registration fails with AbortError.
            const registration = await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, {
                vapidKey: 'BJQZNUC1b25tsLg2Udal0MsVDsvSJz9ph_ux1S4hMo9IHa5FdTc1Nk9cTkzQhhpQGmqZ4KeYMkXu3P9EYsANhog',
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                setToken(currentToken);
                // Save the token to Firebase so the Send API knows who to send it to
                await setDoc(doc(db, 'users', uid), {
                    fcmToken: currentToken
                }, { merge: true });
                console.log("FCM Token saved successfully.");
                return currentToken;
            } else {
                console.log('No registration token available. Request permission to generate one.');
                return null;
            }
        } catch (err) {
            console.error('An error occurred while retrieving token. ', err);
            return null;
        }
    };

    const requestPermission = async () => {
        if (!userId) {
            alert("Lütfen önce giriş yapın.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);
            if (permission === 'granted') {
                await requestAndSaveToken(userId);
            } else {
                console.warn("User blocked notifications.");
            }
        } catch (error) {
            console.error("Failed to request permission", error);
        }
    };

    return { token, permissionStatus, requestPermission };
}
