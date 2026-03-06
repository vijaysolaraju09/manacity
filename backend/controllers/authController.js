const { query } = require('../config/db');
const { generateOtp } = require('../utils/otp');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { createError } = require('../utils/errors');
const crypto = require('crypto');
const https = require('https');

const normalizePhone = (rawPhone) => {
  if (rawPhone === undefined || rawPhone === null) return null;

  const stringPhone = String(rawPhone).replace(/\s+/g, '');
  if (!stringPhone) return null;

  if (/^\+91\d{10}$/.test(stringPhone)) {
    return stringPhone;
  }

  if (/^91\d{10}$/.test(stringPhone)) {
    return `+${stringPhone}`;
  }

  if (/^\d{10}$/.test(stringPhone)) {
    return `+91${stringPhone}`;
  }

  return null;
};

const maskPhoneForLogs = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const tail = digits.slice(-2).padStart(2, '*');
  return `***${tail}`;
};

const getOtpPepper = () => {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper) {
    throw new Error('OTP_PEPPER is not configured');
  }
  return pepper;
};

const hashOtp = (otp) => crypto
  .createHash('sha256')
  .update(`${otp}${getOtpPepper()}`)
  .digest('hex');

const hashResetSessionToken = (token) => crypto
  .createHash('sha256')
  .update(`${token}${getOtpPepper()}`)
  .digest('hex');

const logAuthFlow = (req, flow, extras = {}) => {
  console.log(JSON.stringify({
    level: 'info',
    request_id: req.request_id,
    user_id: req.user?.user_id || req.user?.id,
    flow,
    ...extras,
  }));
};

const requestPromise = ({ hostname, path, method, headers, body }) => new Promise((resolve, reject) => {
  const req = https.request(
    {
      hostname,
      path,
      method,
      headers
    },
    (response) => {
      let responseData = '';
      response.on('data', (chunk) => {
        responseData += chunk;
      });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(responseData);
          return;
        }
        const providerErr = new Error('SMS provider request failed');
        providerErr.code = response.statusCode;
        providerErr.responseBody = responseData;
        reject(providerErr);
      });
    }
  );

  req.on('error', reject);

  if (body) {
    req.write(body);
  }
  req.end();
});

const sendSms = async (phoneE164, message) => {
  const provider = (process.env.OTP_SMS_PROVIDER || '').toUpperCase();

  if (provider === 'MSG91') {
    const authKey = process.env.MSG91_AUTH_KEY;
    const senderId = process.env.MSG91_SENDER_ID;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !senderId) {
      throw new Error('MSG91 configuration missing');
    }

    const payload = {
      sender: senderId,
      route: '4',
      country: '91',
      sms: [{
        message,
        to: [phoneE164.replace(/^\+/, '')]
      }]
    };

    if (templateId) {
      payload.template_id = templateId;
    }

    await requestPromise({
      hostname: 'api.msg91.com',
      path: '/api/v2/sendsms',
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return;
  }

  if (provider === 'TWILIO') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio configuration missing');
    }

    const body = new URLSearchParams({
      To: phoneE164,
      From: fromNumber,
      Body: message
    }).toString();

    await requestPromise({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });
    return;
  }

  throw new Error('Unsupported OTP_SMS_PROVIDER');
};

const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // 1. Validation: Phone must be present and 10 digits
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
    }

    // 2. Rate Limiting: Check OTPs sent in the last 1 hour
    const rateLimitQuery = `
      SELECT COUNT(*) as count 
      FROM otp_codes 
      WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'
    `;
    const rateLimitRes = await query(rateLimitQuery, [normalizedPhone]);
    const otpCount = parseInt(rateLimitRes.rows[0].count, 10);

    if (otpCount >= 3) {
      return res.status(429).json({ error: 'OTP limit exceeded. Try later.' });
    }

    // 3. Generate OTP
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const message = `Your Manacity OTP is ${otp}. Valid for 5 minutes.`;

    // 4. Insert into DB before sending SMS
    const insertQuery = `
      INSERT INTO otp_codes (phone, otp, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
      RETURNING id
    `;

    let otpRowId;
    try {
      const insertRes = await query(insertQuery, [normalizedPhone, otpHash]);
      otpRowId = insertRes.rows[0]?.id;
    } catch (dbErr) {
      console.error(`Send OTP DB Insert Error for phone ${maskPhoneForLogs(normalizedPhone)}:`, {
        code: dbErr.code,
        message: dbErr.message
      });
      return res.status(500).json({ error: 'Internal server error' });
    }

    try {
      await sendSms(normalizedPhone, message);
    } catch (smsErr) {
      if (otpRowId) {
        try {
          await query('DELETE FROM otp_codes WHERE id = $1', [otpRowId]);
        } catch (cleanupErr) {
          console.error(`Send OTP Cleanup Error for phone ${maskPhoneForLogs(normalizedPhone)}:`, {
            code: cleanupErr.code,
            message: cleanupErr.message
          });
        }
      }

      console.error(`Send OTP SMS Error for phone ${maskPhoneForLogs(normalizedPhone)}:`, {
        code: smsErr.code,
        message: smsErr.message
      });
      return res.status(500).json({ error: 'Unable to send OTP' });
    }

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error(`Send OTP Error for phone ${maskPhoneForLogs(req.body?.phone)}:`, err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const normalizedPhone = normalizePhone(phone);

    // 1. Validation
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid OTP. Must be 6 digits.' });
    }

    // 2. Lookup latest valid OTP
    const findQuery = `
      SELECT id, otp, attempts 
      FROM otp_codes 
      WHERE phone = $1 AND expires_at > NOW() 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const { rows } = await query(findQuery, [normalizedPhone]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const record = rows[0];

    // 3. Attempts protection
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request new OTP.' });
    }

    // 4. Compare OTP
    const otpHash = hashOtp(otp);
    if (record.otp !== otpHash) {
      // Increment attempts
      await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // 5. Success: Mark as verified (attempts=999) and expire it so it can't be verified again
    // This allows the register endpoint to check for this specific state.
    await query(
      "UPDATE otp_codes SET attempts = 999, expires_at = NOW() WHERE id = $1",
      [record.id]
    );

    res.status(200).json({ message: 'OTP verified', verified: true });
  } catch (err) {
    console.error(`Verify OTP Error for phone ${maskPhoneForLogs(req.body?.phone)}:`, err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const sendForgotPasswordOtp = async (req, res, next) => {
  try {
    const normalizedPhone = normalizePhone(req.body?.phone);

    if (!req.body?.phone) {
      return next(createError(400, 'PHONE_REQUIRED', 'Phone number is required'));
    }

    if (!normalizedPhone) {
      return next(createError(400, 'PHONE_INVALID', 'Invalid phone number'));
    }

    const userRes = await query(
      'SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL AND is_active = true LIMIT 1',
      [normalizedPhone]
    );

    if (!userRes.rows.length) {
      logAuthFlow(req, 'forgot_password_send_otp', {
        phone_masked: maskPhoneForLogs(normalizedPhone),
        outcome: 'accepted_no_user',
      });
      return res.status(200).json({ message: 'If an account exists, OTP sent successfully' });
    }

    const rateLimitRes = await query(
      `SELECT COUNT(*) AS count
       FROM otp_codes
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [normalizedPhone]
    );
    const otpCount = Number.parseInt(rateLimitRes.rows[0]?.count || '0', 10);
    if (otpCount >= 3) {
      return next(createError(429, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const message = `Your Manacity OTP is ${otp}. Valid for 5 minutes.`;

    const insertRes = await query(
      `INSERT INTO otp_codes (phone, otp, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
       RETURNING id`,
      [normalizedPhone, otpHash]
    );

    try {
      await sendSms(normalizedPhone, message);
    } catch (smsErr) {
      if (insertRes.rows[0]?.id) {
        await query('DELETE FROM otp_codes WHERE id = $1', [insertRes.rows[0].id]);
      }
      return next(createError(500, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
    }

    logAuthFlow(req, 'forgot_password_send_otp', {
      phone_masked: maskPhoneForLogs(normalizedPhone),
      outcome: 'otp_sent',
    });

    return res.status(200).json({ message: 'If an account exists, OTP sent successfully' });
  } catch (err) {
    console.error('Forgot password send OTP error:', err.message);
    return next(createError(500, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
  }
};

const verifyForgotPasswordOtp = async (req, res, next) => {
  try {
    const normalizedPhone = normalizePhone(req.body?.phone);
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : req.body?.otp;

    if (!req.body?.phone) {
      return next(createError(400, 'PHONE_REQUIRED', 'Phone number is required'));
    }
    if (!normalizedPhone) {
      return next(createError(400, 'PHONE_INVALID', 'Invalid phone number'));
    }
    if (!otp) {
      return next(createError(400, 'OTP_REQUIRED', 'OTP is required'));
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const { rows } = await query(
      `SELECT id, otp, attempts
       FROM otp_codes
       WHERE phone = $1 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone]
    );

    if (!rows.length) {
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const record = rows[0];
    if (record.attempts >= 5) {
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const otpHash = hashOtp(otp);
    if (record.otp !== otpHash) {
      await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    await query(
      `UPDATE otp_codes
       SET otp = $1, attempts = 998, expires_at = NOW() + INTERVAL '10 minutes'
       WHERE id = $2`,
      [hashResetSessionToken(resetToken), record.id]
    );

    logAuthFlow(req, 'forgot_password_verify_otp', {
      phone_masked: maskPhoneForLogs(normalizedPhone),
      outcome: 'verified',
    });

    return res.status(200).json({ message: 'OTP verified', verified: true, reset_token: resetToken });
  } catch (err) {
    console.error('Forgot password verify OTP error:', err.message);
    return next(createError(500, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
  }
};

const resetForgotPassword = async (req, res, next) => {
  try {
    const normalizedPhone = normalizePhone(req.body?.phone);
    const newPassword = req.body?.new_password;
    const requestedResetToken = req.body?.reset_token ?? req.body?.resetToken;
    const resetToken = typeof requestedResetToken === 'string' ? requestedResetToken.trim() : '';

    if (!req.body?.phone) {
      return next(createError(400, 'PHONE_REQUIRED', 'Phone number is required'));
    }
    if (!normalizedPhone) {
      return next(createError(400, 'PHONE_INVALID', 'Invalid phone number'));
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return next(createError(400, 'PASSWORD_REQUIRED', 'Password is required'));
    }
    if (newPassword.length < 8) {
      return next(createError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters'));
    }
    if (!resetToken) {
      logAuthFlow(req, 'forgot_password_reset', {
        phone_masked: maskPhoneForLogs(normalizedPhone),
        outcome: 'missing_reset_token',
      });
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const { rows } = await query(
      `SELECT id
       FROM otp_codes
       WHERE phone = $1
         AND otp = $2
         AND attempts = 998
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone, hashResetSessionToken(resetToken)]
    );

    if (!rows.length) {
      logAuthFlow(req, 'forgot_password_reset', {
        phone_masked: maskPhoneForLogs(normalizedPhone),
        outcome: 'invalid_reset_token',
      });
      return next(createError(400, 'OTP_INVALID', 'Invalid or expired OTP'));
    }

    const userRes = await query(
      'SELECT id, password_hash FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1',
      [normalizedPhone]
    );

    if (!userRes.rows.length) {
      return next(createError(400, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
    }

    const hashedPassword = await hashPassword(newPassword);

    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      userRes.rows[0].id,
    ]);

    await query('DELETE FROM otp_codes WHERE id = $1', [rows[0].id]);

    logAuthFlow(req, 'forgot_password_reset', {
      phone_masked: maskPhoneForLogs(normalizedPhone),
      outcome: 'password_updated',
    });

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Forgot password reset error:', err.message);
    return next(createError(500, 'RESET_UNABLE_TO_PROCESS', 'Unable to process request'));
  }
};

const register = async (req, res) => {
  try {
    const { phone, password, location_id, name } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const phoneMasked = maskPhoneForLogs(normalizedPhone || phone);

    const logValidationError = (reason) => {
      console.warn('[OTP_REGISTER_VALIDATION_ERROR]', {
        phone_masked: phoneMasked,
        reason
      });
    };

    // 1. Input Validation
    if (!normalizedPhone) {
      logValidationError('INVALID_PHONE');
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    if (!password || password.length < 6) {
      logValidationError('INVALID_PASSWORD');
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!location_id) {
      logValidationError('LOCATION_ID_REQUIRED');
      return res.status(400).json({ error: 'Location ID is required' });
    }

    // 2. Check OTP Verification Status
    // Must have a record with attempts=999 created within the last 10 minutes
    const otpCheckQuery = `
      SELECT id FROM otp_codes 
      WHERE phone = $1 AND attempts = 999 AND created_at > NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC LIMIT 1
    `;
    const otpRes = await query(otpCheckQuery, [normalizedPhone]);
    if (otpRes.rows.length === 0) {
      logValidationError('PHONE_NOT_VERIFIED');
      return res.status(400).json({ error: 'Phone not verified or verification expired. Please verify OTP again.' });
    }

    // 3. Check if User Already Exists
    const userCheckRes = await query('SELECT id FROM users WHERE phone = $1', [normalizedPhone]);
    if (userCheckRes.rows.length > 0) {
      logValidationError('USER_ALREADY_EXISTS');
      return res.status(409).json({ error: 'User already exists' });
    }

    // 4. Validate Location
    const locCheckRes = await query('SELECT id FROM locations WHERE id = $1 AND is_active = true', [location_id]);
    if (locCheckRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive location' });
    }

    // 5. Create User
    const hashedPassword = await hashPassword(password);
    const insertUserQuery = `
      INSERT INTO users (phone, password_hash, location_id, name, role, approval_status)
      VALUES ($1, $2, $3, $4, 'USER', 'APPROVED')
      RETURNING id, phone, role, location_id, name
    `;
    const newUserRes = await query(insertUserQuery, [normalizedPhone, hashedPassword, location_id, name]);
    const newUser = newUserRes.rows[0];

    const token = generateToken({
      user_id: newUser.id,
      phone: normalizedPhone,
      role: newUser.role,
      location_id: newUser.location_id
    });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        phone: newUser.phone,
        role: newUser.role,
        location_id: newUser.location_id,
        name: newUser.name
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    const normalizedPhone = normalizePhone(phone);

    // 1. Validation
    if (!normalizedPhone) {
      return next(createError(400, 'PHONE_INVALID', 'Invalid phone number'));
    }
    if (!password) {
      return next(createError(400, 'PASSWORD_REQUIRED', 'Phone and password are required'));
    }

    // 2. Fetch User
    const userQuery = `
      SELECT id, name, phone, password_hash, role, location_id, is_active, deleted_at 
      FROM users 
      WHERE phone = $1
    `;
    const { rows } = await query(userQuery, [normalizedPhone]);
    const user = rows[0];

    if (!user) {
      return next(createError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    if (user.is_active === false || user.deleted_at) {
      return next(createError(403, 'USER_INACTIVE', 'User is inactive'));
    }

    if (!user.password_hash) {
      return next(createError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    let isMatch = false;
    try {
      isMatch = await comparePassword(password, user.password_hash);
    } catch (compareErr) {
      console.error('Login password compare failed:', compareErr);
      return next(createError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    if (!isMatch) {
      return next(createError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    // 4. Generate JWT
    const token = generateToken({
      user_id: user.id,
      phone: user.phone,
      role: user.role,
      location_id: user.location_id
    });

    // 5. Response
    res.status(200).json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        location_id: user.location_id,
        name: user.name
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetForgotPassword,
  normalizePhone,
};
