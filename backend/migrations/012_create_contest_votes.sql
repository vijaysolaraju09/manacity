-- Ensure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop table if it exists to ensure schema matches new requirements
DROP TABLE IF EXISTS contest_votes;

-- Create contest_votes table
CREATE TABLE contest_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id UUID NOT NULL,
    entry_id UUID NOT NULL,
    user_id UUID NOT NULL,
    location_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_contest_votes_contest
        FOREIGN KEY (contest_id)
        REFERENCES contests(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_votes_entry
        FOREIGN KEY (entry_id)
        REFERENCES contest_entries(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_votes_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_contest_votes_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT uq_contest_votes_user_entry
        UNIQUE (user_id, entry_id)
);

CREATE INDEX idx_contest_votes_entry_id ON contest_votes(entry_id);
CREATE INDEX idx_contest_votes_contest_id ON contest_votes(contest_id);
CREATE INDEX idx_contest_votes_location_id ON contest_votes(location_id);