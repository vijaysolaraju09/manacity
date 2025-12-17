exports.validateCartItems = async (items, locationId, dbQuery) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return { error: 'Cart is empty' };
    }

    // Extract unique IDs
    const productIds = [...new Set(items.map(i => i.productId))];

    const sql = `
        SELECT p.id, p.name, p.price, p.is_available, p.shop_id, 
               s.name as shop_name, s.location_id, s.approval_status, s.is_hidden, s.is_open
        FROM products p
        JOIN shops s ON p.shop_id = s.id
        WHERE p.id = ANY($1::uuid[])
          AND p.deleted_at IS NULL
    `;

    const { rows: products } = await dbQuery(sql, [productIds]);
    const productMap = new Map(products.map(p => [p.id, p]));

    let subtotal = 0;
    let shopId = null;
    let shopName = null;
    const validatedItems = [];

    for (const item of items) {
        const product = productMap.get(item.productId);

        // 1. Validate Existence
        if (!product) {
            return { error: `Product ${item.productId} not found or unavailable` };
        }

        // 2. Validate Location
        if (product.location_id !== locationId) {
            return { error: 'Products must belong to the current location' };
        }

        // 3. Validate Shop Consistency
        if (shopId === null) {
            shopId = product.shop_id;
            shopName = product.shop_name;

            if (product.approval_status !== 'APPROVED' || product.is_hidden) {
                return { error: 'Shop is unavailable' };
            }
        } else if (shopId !== product.shop_id) {
            return { error: 'All products must be from the same shop' };
        }

        // 4. Validate Availability
        if (!product.is_available) {
            return { error: `Product "${product.name}" is currently out of stock` };
        }

        const quantity = parseInt(item.quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
            return { error: `Invalid quantity for product "${product.name}"` };
        }

        const price = parseFloat(product.price);
        const lineTotal = price * quantity;
        subtotal += lineTotal;

        validatedItems.push({
            productId: product.id,
            name: product.name,
            price: price,
            quantity: quantity,
            total: lineTotal
        });
    }

    // Check if shop is open (using the first product's shop info)
    const isShopOpen = products.length > 0 ? products[0].is_open : false;

    return { valid: true, shopId, shopName, isShopOpen, items: validatedItems, subtotal, total: subtotal };
};