-- ============================================================================
-- OutingGo — Group Meetup Planner Database Schema
-- Target: PostgreSQL 16 (Normalized to 3NF)
-- Tables: 8 Main Tables + 3 Junction Tables = 11 Tables
-- ============================================================================

-- Trigger function to automatically update `updated_at` on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 1. ROLES (Account-level RBAC: ADMIN, MODERATOR, USER)
CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE CHECK (name IN ('ADMIN', 'MODERATOR', 'USER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL,
    updated_by BIGINT NULL
);

-- 2. USERS
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NULL,
    avatar_url TEXT NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- Add deferred self-referencing FKs on roles now that users exists
ALTER TABLE roles
    ADD CONSTRAINT fk_roles_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_roles_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. CATEGORIES
CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- 4. VENUES
CREATE TABLE venues (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address TEXT NULL,
    district VARCHAR(100) NULL,
    lat DECIMAL(10, 7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DECIMAL(10, 7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    price_level SMALLINT NOT NULL DEFAULT 2 CHECK (price_level BETWEEN 1 AND 4),
    opening_time TIME NOT NULL DEFAULT '08:00:00',
    closing_time TIME NOT NULL DEFAULT '22:00:00', -- may be earlier than opening_time (crosses midnight)
    phone VARCHAR(30) NULL,
    description TEXT NULL,
    osm_id VARCHAR(64) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- 5. MEETUPS
CREATE TABLE meetups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    leader_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    meeting_time TIMESTAMPTZ NOT NULL,
    category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
    objective VARCHAR(20) NOT NULL DEFAULT 'MIN_TOTAL'
        CHECK (objective IN ('MIN_TOTAL', 'MIN_SPREAD')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    invite_code CHAR(8) NOT NULL UNIQUE CHECK (invite_code ~ '^[A-Z0-9]{8}$'),
    confirmed_venue_id BIGINT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- 6. REVIEWS
CREATE TABLE reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id BIGINT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    meetup_id BIGINT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_reviews_meetup_user UNIQUE (meetup_id, user_id)
);

-- 7. NOTIFICATIONS
CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    meetup_id BIGINT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL
);

-- 8. AUDIT_LOGS
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NULL,
    details JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- JUNCTION TABLES (3)
-- ============================================================================

-- 9. MEETUP_PARTICIPANTS (Users <-> Meetups + Meetup-level Role)
CREATE TABLE meetup_participants (
    meetup_id BIGINT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CHECK (role IN ('LEADER', 'MEMBER')),
    status VARCHAR(20) NOT NULL DEFAULT 'JOINED'
        CHECK (status IN ('JOINED', 'LEFT', 'REMOVED')),
    lat DECIMAL(10, 7) NULL CHECK (lat BETWEEN -90 AND 90),
    lng DECIMAL(10, 7) NULL CHECK (lng BETWEEN -180 AND 180),
    confirmed_travel_time_sec INT NULL CHECK (confirmed_travel_time_sec >= 0),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (meetup_id, user_id)
);

-- Partial unique index: enforce at most one LEADER per meetup
CREATE UNIQUE INDEX uq_meetup_participants_one_leader
    ON meetup_participants (meetup_id)
    WHERE role = 'LEADER';

-- 10. MEETUP_CANDIDATES (Meetups <-> Venues proposed by Routing Engine)
CREATE TABLE meetup_candidates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    meetup_id BIGINT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    venue_id BIGINT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    rank SMALLINT NOT NULL CHECK (rank >= 1),
    total_time_sec INT NOT NULL CHECK (total_time_sec >= 0),
    spread_sec INT NOT NULL CHECK (spread_sec >= 0),
    travel_times JSONB NOT NULL, -- justified denormalization: {"<userId>": seconds}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_meetup_candidates_meetup_venue UNIQUE (meetup_id, venue_id)
);

-- 11. MEETUP_VOTES (Users <-> Meetup Candidates)
CREATE TABLE meetup_votes (
    meetup_id BIGINT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id BIGINT NOT NULL REFERENCES meetup_candidates(id) ON DELETE CASCADE,
    voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (meetup_id, user_id)
);

-- ============================================================================
-- INDEXES (Every Foreign Key + Frequent Query Columns)
-- ============================================================================

-- roles
CREATE INDEX idx_roles_created_by ON roles(created_by);
CREATE INDEX idx_roles_updated_by ON roles(updated_by);

-- users
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_created_by ON users(created_by);
CREATE INDEX idx_users_updated_by ON users(updated_by);
CREATE INDEX idx_users_is_active ON users(is_active);

-- categories
CREATE INDEX idx_categories_created_by ON categories(created_by);
CREATE INDEX idx_categories_updated_by ON categories(updated_by);
CREATE INDEX idx_categories_is_active ON categories(is_active);

-- venues
CREATE INDEX idx_venues_category_id ON venues(category_id);
CREATE INDEX idx_venues_created_by ON venues(created_by);
CREATE INDEX idx_venues_updated_by ON venues(updated_by);
CREATE INDEX idx_venues_district ON venues(district);
CREATE INDEX idx_venues_price_level ON venues(price_level);
CREATE INDEX idx_venues_is_active ON venues(is_active);
CREATE INDEX idx_venues_osm_id ON venues(osm_id) WHERE osm_id IS NOT NULL;

-- meetups
CREATE INDEX idx_meetups_leader_id ON meetups(leader_id);
CREATE INDEX idx_meetups_category_id ON meetups(category_id);
CREATE INDEX idx_meetups_confirmed_venue_id ON meetups(confirmed_venue_id);
CREATE INDEX idx_meetups_created_by ON meetups(created_by);
CREATE INDEX idx_meetups_updated_by ON meetups(updated_by);
CREATE INDEX idx_meetups_status_meeting_time ON meetups(status, meeting_time);

-- reviews
CREATE INDEX idx_reviews_venue_id ON reviews(venue_id);
CREATE INDEX idx_reviews_meetup_id ON reviews(meetup_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_created_by ON reviews(created_by);
CREATE INDEX idx_reviews_updated_by ON reviews(updated_by);

-- notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_meetup_id ON notifications(meetup_id);
CREATE INDEX idx_notifications_created_by ON notifications(created_by);
CREATE INDEX idx_notifications_updated_by ON notifications(updated_by);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);

-- audit_logs
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- meetup_participants
CREATE INDEX idx_meetup_participants_user_id ON meetup_participants(user_id);
CREATE INDEX idx_meetup_participants_created_by ON meetup_participants(created_by);
CREATE INDEX idx_meetup_participants_updated_by ON meetup_participants(updated_by);

-- meetup_candidates
CREATE INDEX idx_meetup_candidates_meetup_id ON meetup_candidates(meetup_id);
CREATE INDEX idx_meetup_candidates_venue_id ON meetup_candidates(venue_id);
CREATE INDEX idx_meetup_candidates_created_by ON meetup_candidates(created_by);
CREATE INDEX idx_meetup_candidates_updated_by ON meetup_candidates(updated_by);

-- meetup_votes
CREATE INDEX idx_meetup_votes_user_id ON meetup_votes(user_id);
CREATE INDEX idx_meetup_votes_candidate_id ON meetup_votes(candidate_id);
CREATE INDEX idx_meetup_votes_created_by ON meetup_votes(created_by);
CREATE INDEX idx_meetup_votes_updated_by ON meetup_votes(updated_by);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_meetups_updated_at BEFORE UPDATE ON meetups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_meetup_participants_updated_at BEFORE UPDATE ON meetup_participants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_meetup_candidates_updated_at BEFORE UPDATE ON meetup_candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_meetup_votes_updated_at BEFORE UPDATE ON meetup_votes FOR EACH ROW EXECUTE FUNCTION set_updated_at();