-- Marketplace workflow enhancements for services (additive changes)

-- Service request fields
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS title VARCHAR;

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS assigned_provider_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Backfill description and assigned provider where possible
UPDATE service_requests
SET description = request_text
WHERE description IS NULL;

UPDATE service_requests
SET assigned_provider_user_id = assigned_user_id
WHERE assigned_provider_user_id IS NULL AND assigned_user_id IS NOT NULL;

-- Offer workflow fields
ALTER TABLE service_offers
ADD COLUMN IF NOT EXISTS offer_status VARCHAR NOT NULL DEFAULT 'PENDING';

-- Ensure existing offers have a status
UPDATE service_offers
SET offer_status = 'PENDING'
WHERE offer_status IS NULL;

-- Update status constraint to include marketplace lifecycle statuses (keep legacy statuses for compatibility)
ALTER TABLE service_requests
DROP CONSTRAINT IF EXISTS chk_service_requests_status;

ALTER TABLE service_requests
ADD CONSTRAINT chk_service_requests_status
CHECK (status IN (
    'OPEN',
    'OFFERED',
    'ASSIGNED',
    'IN_PROGRESS',
    'ACCEPTED',
    'COMPLETED',
    'EXPIRED',
    'CANCELLED',
    'CANCELLED_BY_USER',
    'CANCELLED_BY_ADMIN'
));

-- Indexes for marketplace workflows
CREATE INDEX IF NOT EXISTS idx_service_requests_loc_status_public
ON service_requests(location_id, status, is_public);

CREATE INDEX IF NOT EXISTS idx_service_requests_requester_id_marketplace
ON service_requests(requester_id);
