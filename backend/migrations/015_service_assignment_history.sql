-- Create service_assignment_history table for audit trail
CREATE TABLE IF NOT EXISTS service_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES service_requests(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    assigned_by_admin_id UUID NOT NULL REFERENCES users(id),
    old_provider_user_id UUID REFERENCES users(id),
    new_provider_user_id UUID NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_assignment_history_loc_req ON service_assignment_history(location_id, request_id);
CREATE INDEX IF NOT EXISTS idx_service_assignment_history_req_created ON service_assignment_history(request_id, created_at DESC);