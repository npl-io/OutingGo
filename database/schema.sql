
-- 1. ROLES (Account-level RBAC: ADMIN, MODERATOR, USER)
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- 3. CATEGORIES
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- 4. VENUES (Locations in HCMC)
CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    price_level SMALLINT NOT NULL DEFAULT 2 CHECK (price_level BETWEEN 1 AND 4),
    avg_rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00 CHECK (avg_rating BETWEEN 0 AND 5),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

-- 5. MEETUPS
CREATE TABLE meetups (
    id SERIAL PRIMARY KEY,
    leader_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    final_venue_id INT REFERENCES venues(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    meeting_time TIMESTAMPTZ NOT NULL,
    vote_deadline TIMESTAMPTZ NOT NULL,
    optimization_mode VARCHAR(20) NOT NULL DEFAULT 'MIN_SUM'
        CHECK (optimization_mode IN ('MIN_SUM', 'MIN_MAX', 'MIN_VARIANCE')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_vote_deadline CHECK (vote_deadline <= meeting_time)
);

-- 6. MEETUP_PARTICIPANTS (Junction Table: Users <-> Meetups + Meetup-level Role)
CREATE TABLE meetup_participants (
    id SERIAL PRIMARY KEY,
    meetup_id INT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meetup_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CHECK (meetup_role IN ('LEADER', 'MEMBER')),
    status VARCHAR(20) NOT NULL DEFAULT 'INVITED'
        CHECK (status IN ('INVITED', 'JOINED', 'DECLINED')),
    start_lat DECIMAL(10, 7),
    start_lng DECIMAL(10, 7),
    start_address VARCHAR(255),
    estimated_travel_sec INT,
    carpool_group_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meetup_id, user_id)
);

-- 7. MEETUP_CANDIDATES (Junction Table: Meetups <-> Venues proposed by Routing Engine)
CREATE TABLE meetup_candidates (
    id SERIAL PRIMARY KEY,
    meetup_id INT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    total_travel_sec INT NOT NULL,
    max_travel_sec INT NOT NULL,
    travel_time_gap_sec INT NOT NULL,
    rank_score DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meetup_id, venue_id)
);

-- 8. MEETUP_VOTES (Junction Table: Users <-> Meetup Candidates)
CREATE TABLE meetup_votes (
    id SERIAL PRIMARY KEY,
    meetup_id INT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    candidate_id INT NOT NULL REFERENCES meetup_candidates(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meetup_id, user_id)
);

-- 9. REVIEWS
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    meetup_id INT NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_by INT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (meetup_id, user_id)
);

-- 10. NOTIFICATIONS
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meetup_id INT REFERENCES meetups(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. AUDIT_LOGS
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    actor_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- INDEXES (Foreign Keys & Frequent Filters)
-- ==========================================
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_venues_category_id ON venues(category_id);
CREATE INDEX idx_venues_district ON venues(district);
CREATE INDEX idx_venues_price_rating ON venues(price_level, avg_rating);
CREATE INDEX idx_venues_active ON venues(is_active) WHERE deleted_at IS NULL;

CREATE INDEX idx_meetups_leader_id ON meetups(leader_id);
CREATE INDEX idx_meetups_final_venue_id ON meetups(final_venue_id);
CREATE INDEX idx_meetups_status_time ON meetups(status, meeting_time);

CREATE INDEX idx_participants_meetup_id ON meetup_participants(meetup_id);
CREATE INDEX idx_participants_user_id ON meetup_participants(user_id);

CREATE INDEX idx_candidates_meetup_id ON meetup_candidates(meetup_id);
CREATE INDEX idx_candidates_venue_id ON meetup_candidates(venue_id);

CREATE INDEX idx_votes_candidate_id ON meetup_votes(candidate_id);
CREATE INDEX idx_votes_user_id ON meetup_votes(user_id);

CREATE INDEX idx_reviews_venue_id ON reviews(venue_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);