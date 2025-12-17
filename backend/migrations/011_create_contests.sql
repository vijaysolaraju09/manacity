-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create contests table
CREATE TABLE IF NOT EXISTS contests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    created_by UUID NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    CONSTRAINT fk_contests_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contests_creator
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_contests_dates
        CHECK (starts_at < ends_at)
);

-- Create indexes for contests
CREATE INDEX IF NOT EXISTS idx_contests_location_id ON contests(location_id);
CREATE INDEX IF NOT EXISTS idx_contests_starts_at ON contests(starts_at);
CREATE INDEX IF NOT EXISTS idx_contests_ends_at ON contests(ends_at);

-- Create contest_entries table
CREATE TABLE IF NOT EXISTS contest_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id UUID NOT NULL,
    location_id UUID NOT NULL,
    participant_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    approval_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,

    CONSTRAINT fk_contest_entries_contest
        FOREIGN KEY (contest_id)
        REFERENCES contests(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_entries_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_entries_participant
        FOREIGN KEY (participant_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_contest_entries_contest_participant
        UNIQUE (contest_id, participant_id),

    CONSTRAINT chk_contest_entries_status
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Create indexes for contest_entries
CREATE INDEX IF NOT EXISTS idx_contest_entries_contest_id ON contest_entries(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_entries_participant_id ON contest_entries(participant_id);

-- Create contest_votes table
CREATE TABLE IF NOT EXISTS contest_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_entry_id UUID NOT NULL,
    location_id UUID NOT NULL,
    voted_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_contest_votes_entry
        FOREIGN KEY (contest_entry_id)
        REFERENCES contest_entries(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_votes_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_votes_voter
        FOREIGN KEY (voted_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_contest_votes_entry_voter
        UNIQUE (contest_entry_id, voted_by)
);

-- Create indexes for contest_votes
CREATE INDEX IF NOT EXISTS idx_contest_votes_entry_id ON contest_votes(contest_entry_id);
CREATE INDEX IF NOT EXISTS idx_contest_votes_voted_by ON contest_votes(voted_by);
CREATE INDEX IF NOT EXISTS idx_contest_votes_location_id ON contest_votes(location_id);