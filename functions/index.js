const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();

exports.sendNotification = functions.https.onRequest((req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        try {
            const { title, message, tokens } = req.body;

            if (!tokens || !tokens.length) {
                return res.status(400).json({ error: 'No tokens provided' });
            }

            const payload = {
                notification: {
                    title: title || 'Yeni Bildirim',
                    body: message || 'Sisteme yeni bir sipariş eklendi.'
                }
            };

            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                ...payload
            });

            console.log('Successfully sent message:', response);

            return res.json({
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
                results: response.responses.map(r => r.success ? 'success' : r.error.code)
            });
        } catch (error) {
            console.error('Error sending notification:', error);
            return res.status(500).json({ error: error.message });
        }
    });
});
