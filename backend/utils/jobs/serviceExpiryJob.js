const cron = require('node-cron');
// 1. Import query from ../../config/db
const { query } = require('../../config/db');

// Schedule the job (assuming daily run, adjust schedule as per original file)
const startServiceExpiryJob = () => cron.schedule('0 0 * * *', async () => {
  console.log('Running service expiry job...');
  
  try {
    // 2. Use query() inside the cron job
    // 3. Ensure no new DB connection is created inside the job (uses shared pool)
    
    // Example logic: Update status of expired services
    // Replace the SQL below with the specific logic from your original file
    const text = `
      UPDATE services 
      SET status = 'expired' 
      WHERE expiry_date < NOW() AND status = 'active'
    `;
    
    const result = await query(text);
    console.log(`Service expiry job completed. Updated ${result.rowCount} rows.`);
    
  } catch (error) {
    console.error('Error executing service expiry job:', error);
  }
});

module.exports = { startServiceExpiryJob };
