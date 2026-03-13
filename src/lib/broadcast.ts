import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export const broadcastNotification = async (title: string, message: string) => {
    try {
        const tokensSnap = await getDocs(collection(db, 'fcm_tokens'));
        const tokens: string[] = [];
        tokensSnap.forEach(d => {
            const t = d.data().token;
            if (t && !tokens.includes(t)) tokens.push(t);
        });

        if (tokens.length > 0) {
            await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, message, tokens })
            });
        }
    } catch (err) {
        console.error('Broadcast notification error:', err);
    }
};
