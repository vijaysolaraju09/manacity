-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    phone VARCHAR(15) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    location_id UUID NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    CONSTRAINT fk_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_role
        CHECK (role IN ('SUPER_ADMIN', 'LOCAL_ADMIN', 'BUSINESS', 'USER')),

    CONSTRAINT chk_approval_status
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'))
);