const { pool, query } = require('../config/db');
const { createError } = require('../utils/errors');

const MIN_LABEL_LENGTH = 3;
const MIN_ADDRESS_LENGTH = 5;

const validateLabel = (label) => typeof label === 'string' && label.trim().length >= MIN_LABEL_LENGTH;
const validateAddressLine = (addressLine) => typeof addressLine === 'string' && addressLine.trim().length >= MIN_ADDRESS_LENGTH;

exports.getMyAddresses = async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const locationId = req.locationId;

        const sql = `
            SELECT id, user_id, location_id, label, address_line, is_default, created_at, updated_at
            FROM addresses
            WHERE user_id = $1
              AND location_id = $2
              AND deleted_at IS NULL
            ORDER BY is_default DESC, created_at DESC
        `;

        const result = await query(sql, [userId, locationId]);
        res.json({ data: result.rows });
    } catch (err) {
        console.error('Error fetching addresses:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.createAddress = async (req, res, next) => {
    const client = await pool.connect();
    try {
        const userId = req.user.user_id;
        const locationId = req.locationId;
        const { label, address_line: addressLine, is_default: isDefault } = req.body;

        if (!validateLabel(label)) {
            return next(createError(400, 'INVALID_LABEL', 'Label must be at least 3 characters'));
        }

        if (!validateAddressLine(addressLine)) {
            return next(createError(400, 'INVALID_ADDRESS', 'Address must be at least 5 characters'));
        }

        await client.query('BEGIN');

        const countRes = await client.query(
            `
            SELECT COUNT(*)::int AS count
            FROM addresses
            WHERE user_id = $1
              AND location_id = $2
              AND deleted_at IS NULL
            `,
            [userId, locationId]
        );

        const hasExisting = countRes.rows[0].count > 0;
        const shouldBeDefault = hasExisting ? Boolean(isDefault) : true;

        if (shouldBeDefault) {
            await client.query(
                `
                UPDATE addresses
                SET is_default = false,
                    updated_at = NOW()
                WHERE user_id = $1
                  AND location_id = $2
                  AND deleted_at IS NULL
                `,
                [userId, locationId]
            );
        }

        const insertRes = await client.query(
            `
            INSERT INTO addresses (
                user_id,
                location_id,
                label,
                address_line,
                is_default,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING id, user_id, location_id, label, address_line, is_default, created_at, updated_at
            `,
            [userId, locationId, label.trim(), addressLine.trim(), shouldBeDefault]
        );

        await client.query('COMMIT');

        res.status(201).json({ data: insertRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating address:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    } finally {
        client.release();
    }
};

exports.updateAddress = async (req, res, next) => {
    const client = await pool.connect();
    try {
        const userId = req.user.user_id;
        const locationId = req.locationId;
        const { addressId } = req.params;
        const { label, address_line: addressLine, is_default: isDefault } = req.body;

        if (label === undefined && addressLine === undefined && isDefault === undefined) {
            return next(createError(400, 'NO_UPDATES', 'No valid fields provided for update'));
        }

        if (label !== undefined && !validateLabel(label)) {
            return next(createError(400, 'INVALID_LABEL', 'Label must be at least 3 characters'));
        }

        if (addressLine !== undefined && !validateAddressLine(addressLine)) {
            return next(createError(400, 'INVALID_ADDRESS', 'Address must be at least 5 characters'));
        }

        await client.query('BEGIN');

        const existingRes = await client.query(
            `
            SELECT id
            FROM addresses
            WHERE id = $1
              AND user_id = $2
              AND location_id = $3
              AND deleted_at IS NULL
            `,
            [addressId, userId, locationId]
        );

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(createError(404, 'ADDRESS_NOT_FOUND', 'Address not found'));
        }

        if (isDefault === true) {
            await client.query(
                `
                UPDATE addresses
                SET is_default = false,
                    updated_at = NOW()
                WHERE user_id = $1
                  AND location_id = $2
                  AND deleted_at IS NULL
                `,
                [userId, locationId]
            );
        }

        const fields = [];
        const values = [];
        let idx = 1;

        if (label !== undefined) {
            fields.push(`label = $${idx}`);
            values.push(label.trim());
            idx += 1;
        }

        if (addressLine !== undefined) {
            fields.push(`address_line = $${idx}`);
            values.push(addressLine.trim());
            idx += 1;
        }

        if (isDefault !== undefined) {
            fields.push(`is_default = $${idx}`);
            values.push(Boolean(isDefault));
            idx += 1;
        }

        fields.push('updated_at = NOW()');

        const updateSql = `
            UPDATE addresses
            SET ${fields.join(', ')}
            WHERE id = $${idx}
              AND user_id = $${idx + 1}
              AND location_id = $${idx + 2}
              AND deleted_at IS NULL
            RETURNING id, user_id, location_id, label, address_line, is_default, created_at, updated_at
        `;

        values.push(addressId, userId, locationId);

        const updateRes = await client.query(updateSql, values);

        if (updateRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(createError(404, 'ADDRESS_NOT_FOUND', 'Address not found'));
        }

        await client.query('COMMIT');

        res.json({ data: updateRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating address:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    } finally {
        client.release();
    }
};

exports.deleteAddress = async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const locationId = req.locationId;
        const { addressId } = req.params;

        const result = await query(
            `
            UPDATE addresses
            SET deleted_at = NOW(),
                updated_at = NOW(),
                is_default = false
            WHERE id = $1
              AND user_id = $2
              AND location_id = $3
              AND deleted_at IS NULL
            RETURNING id
            `,
            [addressId, userId, locationId]
        );

        if (result.rows.length === 0) {
            return next(createError(404, 'ADDRESS_NOT_FOUND', 'Address not found'));
        }

        res.status(200).json({ message: 'Address deleted successfully' });
    } catch (err) {
        console.error('Error deleting address:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};
