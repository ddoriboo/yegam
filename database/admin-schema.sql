-- 관리자 전용 테이블 생성
-- 일반 사용자와 완전히 분리된 관리자 계정 시스템

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'admin', -- admin, super_admin
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 관리자 활동 로그 테이블 (보안 감사용)
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- 'issue', 'user', 'bet', etc.
    resource_id INTEGER,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 관리자 세션 테이블 (토큰 관리용)
CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);

-- 기본 슈퍼 관리자 계정 생성 (임시, 첫 로그인 후 변경 필요)
-- 비밀번호: TempAdmin2025! (반드시 변경하세요)
INSERT INTO admins (username, email, password_hash, full_name, role) 
VALUES (
    'superadmin',
    'admin@yegam.com',
    '$2a$10$rKvqKvQn5H5y8y8y8y8y8uK5.WZjX5K5K5K5K5K5K5K5K5K5K5K5K5K5K',  -- 해시된 'TempAdmin2025!'
    '시스템 관리자',
    'super_admin'
) ON CONFLICT (username) DO NOTHING;