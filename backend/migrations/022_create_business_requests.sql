-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create business_requests table
CREATE TABLE IF NOT EXISTS business_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    location_id UUID NOT NULL,
    business_name VARCHAR(150) NOT NULL,
    business_type VARCHAR(100) NOT NULL,
    description TEXT,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_business_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_business_requests_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_business_requests_status
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_requests_location_id ON business_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_business_requests_user_id ON business_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_business_requests_status ON business_requests(status);

-- Enforce one pending request per user per location
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_requests_pending_unique
    ON business_requests(user_id, location_id)
    WHERE status = 'PENDING';
