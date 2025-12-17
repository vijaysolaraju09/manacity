const { query } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');

exports.validateCart = async (req, res) => {
    try {
        const { items } = req.body;
        const locationId = req.locationId;

        const result = await validateCartItems(items, locationId, query);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result);

    } catch (err) {
        console.error('Cart validation error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};