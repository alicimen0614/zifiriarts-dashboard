// C:\Users\alici\.gemini\antigravity\scratch\3d-print-tracker\src\lib\firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: "AIzaSyDMz7qSsXY8dwq95fR9WHMMfqWYV9_jUTY",
    authDomain: "zifiri-arts.firebaseapp.com",
    projectId: "zifiri-arts",
    storageBucket: "zifiri-arts.firebasestorage.app",
    messagingSenderId: "339084266093",
    appId: "1:339084266093:web:0e91d4446b60cb6dc94d64"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firebase Cloud Messaging and handle potential not supported environments
export let messaging: ReturnType<typeof getMessaging> | null = null;
isSupported().then((supported) => {
    if (supported) {
        messaging = getMessaging(app);
    }
});
