const cron = require('node-cron');
const { pool } = require('../../config/db');

const startServiceExpiryJob = () => {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            console.log('[Job] Running service expiry check...');

            const query = `
                UPDATE service_requests
                SET status = 'EXPIRED',
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE status = 'OPEN'
                  AND expires_at <= NOW()
                  AND location_id IS NOT NULL
            `;

            const result = await pool.query(query);

            if (result.rowCount > 0) {
                console.log(`[Job] Expired ${result.rowCount} service requests.`);
            }
        } catch (err) {
            console.error('[Job] Error in service expiry job:', err);
        }
    });

    console.log('[Job] Service expiry job scheduled (every 5 mins).');
};

module.exports = { startServiceExpiryJob };