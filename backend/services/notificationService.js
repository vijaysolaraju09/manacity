const { query } = require('../config/db');
const { sendSMS } = require('../utils/smsProvider');

/**
 * Sends a notification (SMS) and logs it to the database.
 * This function is fail-safe and will not throw errors to the caller.
 */
exports.sendNotification = async ({ userId, locationId, phone, type, message }) => {
    try {
        // 1. Insert record as PENDING
        const insertQuery = `
            INSERT INTO notifications (location_id, user_id, channel, type, message, status)
            VALUES ($1, $2, 'SMS', $3, $4, 'PENDING')
            RETURNING id
        `;
        const res = await query(insertQuery, [locationId, userId, type, message]);
        const notificationId = res.rows[0].id;

        if (!phone) {
            await query(`UPDATE notifications SET status = 'FAILED', provider_ref = 'No phone number' WHERE id = $1`, [notificationId]);
            return;
        }

        // 2. Call SMS Provider
        try {
            const providerRes = await sendSMS(phone, message);
            
            // 3. Update status to SENT
            await query(
                `UPDATE notifications SET status = 'SENT', provider_ref = $2 WHERE id = $1`,
                [notificationId, providerRes.messageId]
            );
        } catch (smsErr) {
            console.error('[NotificationService] SMS Failed:', smsErr);
            await query(`UPDATE notifications SET status = 'FAILED', provider_ref = $2 WHERE id = $1`, [notificationId, smsErr.message]);
        }

    } catch (err) {
        console.error('[NotificationService] Critical Error:', err);
    }
};