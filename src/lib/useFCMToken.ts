import { useState, useEffect } from 'react';
import { getToken, onMessage, isSupported } from 'firebase/messaging';
import { getMessagingInstance, db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

export function useFCMToken(userId: string | null) {
    const [token, setToken] = useState<string | null>(null);
    const [isSupportedBrowser, setIsSupportedBrowser] = useState<boolean | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );

    useEffect(() => {
        const checkSupport = async () => {
            const supported = await isSupported();
            setIsSupportedBrowser(supported);
        };
        checkSupport();
    }, []);

    useEffect(() => {
        if (isSupportedBrowser && permissionStatus === 'granted' && userId) {
            requestAndSaveToken(userId);
        }
    }, [userId, permissionStatus, isSupportedBrowser]);

    // Handle incoming messages while app is in foreground
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;
        
        const setupListener = async () => {
            const messaging = await getMessagingInstance();
            if (messaging) {
                unsubscribe = onMessage(messaging, (payload) => {
                    console.log('Message received in foreground: ', payload);
                    if (Notification.permission === 'granted') {
                        new Notification(payload.notification?.title || 'Yeni Bildirim', {
                            body: payload.notification?.body,
                            icon: '/pwa-192x192.png'
                        });
                    }
                });
            }
        };

        setupListener();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const getDeviceId = () => {
        let deviceId = localStorage.getItem('fcm_device_id');
        if (!deviceId) {
            deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
            localStorage.setItem('fcm_device_id', deviceId);
        }
        return deviceId;
    };

    const requestAndSaveToken = async (uid: string) => {
        try {
            const messaging = await getMessagingInstance();

            if (!messaging || !isSupportedBrowser) {
                return null;
            }

            // Timeout promise to prevent hanging forever
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("SW_READY_TIMEOUT")), 5000)
            );

            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                timeoutPromise
            ]) as ServiceWorkerRegistration;

            let currentToken = null;
            try {
                currentToken = await getToken(messaging, {
                    vapidKey: 'BJQZNUC1b25tsLg2Udal0MsVDsvSJz9ph_ux1S4hMo9IHa5FdTc1Nk9cTkzQhhpQGmqZ4KeYMkXu3P9EYsANhog',
                    serviceWorkerRegistration: registration
                });
            } catch (err: any) {
                console.warn('FCM: getToken failed, retrying after unsubscribe...', err);
                try {
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) {
                        await subscription.unsubscribe();
                        console.log("FCM: Unsubscribed from old push subscription.");
                    }
                    // Add a small delay
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    currentToken = await getToken(messaging, {
                        vapidKey: 'BJQZNUC1b25tsLg2Udal0MsVDsvSJz9ph_ux1S4hMo9IHa5FdTc1Nk9cTkzQhhpQGmqZ4KeYMkXu3P9EYsANhog',
                        serviceWorkerRegistration: registration
                    });
                } catch (retryErr: any) {
                    console.error('FCM: Retry getToken failed:', retryErr);
                    if (retryErr.message.includes('push service error')) {
                        console.error('FCM: This is a browser/network level push error. Please try clearing site data or checking if your browser/VPN blocks Google Push services.');
                    }
                }
            }

            if (currentToken) {
                setToken(currentToken);
                const deviceId = getDeviceId();
                // Save to a separate collection using deviceId as the key to prevent duplicates
                await setDoc(doc(db, 'fcm_tokens', deviceId), {
                    token: currentToken,
                    userId: uid,
                    lastUpdated: new Date().toISOString(),
                    platform: navigator.userAgent
                }, { merge: true });
                console.log("FCM Token saved successfully for device:", deviceId);
                return currentToken;
            }
            return null;
        } catch (err) {
            console.error('FCM: Error occurred while retrieving token:', err);
            return null;
        }
    };

    const requestPermission = async () => {
        if (!userId) {
            alert("Lütfen önce giriş yapın.");
            return;
        }

        if (isSupportedBrowser === false) {
            alert("Bu tarayıcı veya cihaz bildirimleri desteklemiyor.");
            return;
        }

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;

        if (isIOS && !isStandalone) {
            alert("Apple cihazlarda bildirimleri açabilmek için öncelikle alt menüdeki 'Paylaş' butonuna basıp uygulamayı 'Ana Ekrana Ekle' yapmalısınız.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);
            if (permission === 'granted') {
                await requestAndSaveToken(userId);
            }
        } catch (error) {
            console.error("Failed to request permission", error);
        }
    };

    return { token, permissionStatus, requestPermission, isSupportedBrowser };
}
