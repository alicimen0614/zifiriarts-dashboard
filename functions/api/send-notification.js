export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    try {
        const body = await request.json();
        const { title, message, tokens } = body;

        if (!tokens || !tokens.length) {
            return new Response(JSON.stringify({ error: 'No tokens provided' }), { status: 400 });
        }

        // Get the service account from environment variables
        const saStr = env.FIREBASE_SERVICE_ACCOUNT;
        if (!saStr) {
            return new Response(JSON.stringify({ error: 'Server not configured. Missing FIREBASE_SERVICE_ACCOUNT.' }), { status: 500 });
        }

        const sa = JSON.parse(saStr);
        const accessToken = await getAccessToken(sa);

        const results = [];
        let successCount = 0;
        let failureCount = 0;

        // FCM HTTP v1 sends messages individually
        for (const token of tokens) {
            const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: {
                        token: token,
                        notification: {
                            title: title || 'Yeni Bildirim',
                            body: message || 'Sisteme yeni bir sipariş eklendi.'
                        }
                    }
                })
            });

            const fcmResult = await fcmRes.json();
            if (fcmRes.ok) {
                successCount++;
                results.push('success');
            } else {
                failureCount++;
                results.push(fcmResult.error?.status || 'error');
            }
        }

        return new Response(JSON.stringify({
            success: true,
            successCount,
            failureCount,
            results
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

// Helper to generate Google OAuth2 Access Token using Web Crypto (Worker friendly)
async function getAccessToken(sa) {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const payload = b64url(JSON.stringify({
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        exp: exp,
        iat: iat,
        scope: 'https://www.googleapis.com/auth/firebase.messaging'
    }));

    const signingInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
        'pkcs8',
        str2ab(sa.private_key),
        { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(signingInput)
    );

    const jwt = `${signingInput}.${b64url(new Uint8Array(signature))}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const data = await res.json();
    return data.access_token;
}

function b64url(input) {
    const base64 = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...input));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function str2ab(str) {
    const content = str.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
    const binary = atob(content);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer.buffer;
}
