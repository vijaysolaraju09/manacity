-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create service_categories table (Type A)
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_service_categories_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_service_categories_location_name
        UNIQUE (location_id, name)
);

-- Create service_requests table (Type A and Type B)
CREATE TABLE IF NOT EXISTS service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    requester_id UUID NOT NULL,
    category_id UUID,
    request_text TEXT NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    assigned_user_id UUID,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,

    CONSTRAINT fk_service_requests_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_service_requests_requester
        FOREIGN KEY (requester_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_service_requests_category
        FOREIGN KEY (category_id)
        REFERENCES service_categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_service_requests_assigned_user
        FOREIGN KEY (assigned_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_service_requests_status
        CHECK (status IN ('OPEN', 'ASSIGNED', 'COMPLETED', 'EXPIRED', 'CANCELLED'))
);

-- Create indexes for service_requests
CREATE INDEX IF NOT EXISTS idx_service_requests_location_id ON service_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_requester_id ON service_requests(requester_id);

-- Create service_offers table (Type B public requests)
CREATE TABLE IF NOT EXISTS service_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    provider_user_id UUID NOT NULL,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_service_offers_request
        FOREIGN KEY (request_id)
        REFERENCES service_requests(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_service_offers_provider
        FOREIGN KEY (provider_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_service_offers_request_provider
        UNIQUE (request_id, provider_user_id)
);

-- Create indexes for service_offers
CREATE INDEX IF NOT EXISTS idx_service_offers_request_id ON service_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_provider_user_id ON service_offers(provider_user_id);