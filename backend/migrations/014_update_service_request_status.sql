-- Update the status check constraint for service_requests to include new states

-- Drop the existing constraint to redefine it.
ALTER TABLE service_requests
DROP CONSTRAINT IF EXISTS chk_service_requests_status;

-- Add the new, more comprehensive constraint that includes the ACCEPTED state
-- and other new cancellation states.
ALTER TABLE service_requests
ADD CONSTRAINT chk_service_requests_status
CHECK (status IN (
    'OPEN',
    'ASSIGNED',
    'ACCEPTED', -- Added for provider acceptance
    'COMPLETED',
    'EXPIRED',
    'CANCELLED', -- Kept for backward compatibility
    'CANCELLED_BY_USER', -- Added for user cancellation
    'CANCELLED_BY_ADMIN' -- Added for admin cancellation
));