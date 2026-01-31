-- Add mobile UX fields to shops table
ALTER TABLE shops
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS category VARCHAR,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS phone VARCHAR,
    ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add mobile UX fields to products table
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS category_id UUID,
    ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 0;
