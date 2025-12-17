-- Add performance indexes for service_requests

-- Composite index for filtering by location and status, ordered by creation date (common for feeds/lists)
CREATE INDEX IF NOT EXISTS idx_service_requests_loc_status_created ON service_requests(location_id, status, created_at DESC);

-- Index for filtering by location and category (Type A vs Type B logic often checks category_id nullability)
-- Note: 'type' column doesn't exist in schema provided, assuming category_id is the proxy for type or this is a future requirement.
-- Based on context, Type A has category_id, Type B has category_id IS NULL.
-- Creating index on category_id to help with joins and filtering.
CREATE INDEX IF NOT EXISTS idx_service_requests_category_id ON service_requests(category_id);

-- Index for user lookups (requester)
CREATE INDEX IF NOT EXISTS idx_service_requests_requester_id_perf ON service_requests(requester_id);

-- Index for assigned provider lookups
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned_user_id_perf ON service_requests(assigned_user_id);

-- Indexes for service_offers are already created in 007_create_services.sql (idx_service_offers_request_id, idx_service_offers_provider_user_id)
-- but we can ensure they exist just in case.
CREATE INDEX IF NOT EXISTS idx_service_offers_request_id_perf ON service_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_service_offers_provider_user_id_perf ON service_offers(provider_user_id);