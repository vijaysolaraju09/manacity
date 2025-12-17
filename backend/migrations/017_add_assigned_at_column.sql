-- Add assigned_at column to service_requests to track when a provider was assigned
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;