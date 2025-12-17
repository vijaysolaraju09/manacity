-- Ensure pgcrypto is enabled for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enquire_questions table
CREATE TABLE IF NOT EXISTS enquire_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    asked_by UUID NOT NULL,
    question TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    admin_answer TEXT,
    answered_by UUID,
    asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    closed_at TIMESTAMP,
    deleted_at TIMESTAMP,

    CONSTRAINT fk_enquire_location
        FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_enquire_asker
        FOREIGN KEY (asked_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_enquire_answerer
        FOREIGN KEY (answered_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_enquire_status
        CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_enquire_location_id ON enquire_questions(location_id);
CREATE INDEX IF NOT EXISTS idx_enquire_status ON enquire_questions(status);
CREATE INDEX IF NOT EXISTS idx_enquire_asked_by ON enquire_questions(asked_by);
CREATE INDEX IF NOT EXISTS idx_enquire_asked_at ON enquire_questions(asked_at);