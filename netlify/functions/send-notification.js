import admin from 'firebase-admin';

// Initialize Firebase Admin only once
if (!admin.apps.length) {
    // In production, these should be environment variables in Netlify Dashboard
    // For local testing, we fall back to raw strings.
    // The FIREBASE_SERVICE_ACCOUNT variable should be a stringified JSON of the service account key.

    // Fallback: If no env var is found, we try to parse it from the body or use a dummy.
    // WARNING: For real production, you MUST set process.env.FIREBASE_SERVICE_ACCOUNT in Netlify!
    try {
        let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccountStr) {
            // If it doesn't look like JSON, it might be Base64 encoded
            if (!serviceAccountStr.trim().startsWith('{')) {
                serviceAccountStr = Buffer.from(serviceAccountStr, 'base64').toString('utf8');
            }
            const serviceAccount = JSON.parse(serviceAccountStr);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
    } catch (error) {
        console.error("Failed to initialize Firebase Admin:", error);
    }
}

export const handler = async (event) => {
    // Only accept POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { title, message, tokens } = body;

        if (!tokens || !tokens.length) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No tokens provided' })
            };
        }

        // Firebase Admin hasn't been initialized (missing env vars)
        if (!admin.apps.length) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server not configured for push notifications yet. Missing Service Account.' })
            };
        }

        const payload = {
            notification: {
                title: title || 'Yeni Bildirim',
                body: message || 'Sisteme yeni bir sipariş eklendi.'
            }
        };

        // Send messages to all provided FCM tokens
        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            ...payload
        });

        if (response.failureCount > 0) {
            console.error('Failed tokens details:');
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.error(`Token ${tokens[idx]}:`, resp.error);
                }
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Notifications processed',
                successCount: response.successCount,
                failureCount: response.failureCount,
                results: response.responses.map(r => r.success ? 'success' : r.error.code)
            })
        };

    } catch (error) {
        console.error('Error sending notification:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message })
        };
    }
};
