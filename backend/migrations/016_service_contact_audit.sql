CREATE TABLE IF NOT EXISTS service_contact_audit (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   request_id UUID NOT NULL REFERENCES service_requests(id),
   location_id UUID NOT NULL REFERENCES locations(id),
   viewer_user_id UUID NOT NULL REFERENCES users(id),
   viewed_user_id UUID NOT NULL REFERENCES users(id),
   viewer_role VARCHAR(30) NOT NULL,
   created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_contact_audit_loc_req ON service_contact_audit(location_id, request_id);
CREATE INDEX IF NOT EXISTS idx_service_contact_audit_viewer_created ON service_contact_audit(viewer_user_id, created_at DESC);