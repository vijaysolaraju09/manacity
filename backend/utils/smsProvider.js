exports.sendSMS = async (phone, message) => {
    // Mock SMS sending
    console.log(`[SMS] to:${phone} | ${message}`);
    return Promise.resolve({ success: true, messageId: 'mock-id-' + Date.now() });
};