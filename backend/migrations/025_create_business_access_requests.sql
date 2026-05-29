-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create business access requests table for onboarding users into business accounts
CREATE TABLE IF NOT EXISTS business_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    location_id UUID NOT NULL,

    business_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,

    category TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    rejection_reason TEXT,

    approved_by UUID,
    approved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_business_access_requests_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_business_access_requests_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_business_access_requests_approved_by
        FOREIGN KEY (approved_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_business_access_requests_status
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_access_requests_user_id
    ON business_access_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_business_access_requests_status
    ON business_access_requests(status);

CREATE INDEX IF NOT EXISTS idx_business_access_requests_location_id
    ON business_access_requests(location_id);

-- Enforce one active pending business access request per user.
-- Rejected requests intentionally do not block re-application.
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_access_requests_pending_user_unique
    ON business_access_requests(user_id)
    WHERE status = 'PENDING';
