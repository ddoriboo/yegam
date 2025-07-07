-- 방문자 트래킹 테이블 생성
CREATE TABLE IF NOT EXISTS visitor_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    page_url TEXT NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성 (성능 향상)
CREATE INDEX idx_visitor_tracking_visited_at ON visitor_tracking(visited_at);
CREATE INDEX idx_visitor_tracking_user_id ON visitor_tracking(user_id);
CREATE INDEX idx_visitor_tracking_session_id ON visitor_tracking(session_id);
CREATE INDEX idx_visitor_tracking_ip_address ON visitor_tracking(ip_address);

-- 일별 방문자 통계 뷰 생성
CREATE OR REPLACE VIEW daily_visitor_stats AS
SELECT 
    DATE(visited_at) as visit_date,
    COUNT(DISTINCT COALESCE(user_id::TEXT, ip_address)) as unique_visitors,
    COUNT(*) as total_page_views
FROM visitor_tracking
GROUP BY DATE(visited_at);

-- 오늘 방문자 수 조회 함수
CREATE OR REPLACE FUNCTION get_today_visitors()
RETURNS TABLE(unique_visitors BIGINT, total_page_views BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT COALESCE(user_id::TEXT, ip_address))::BIGINT as unique_visitors,
        COUNT(*)::BIGINT as total_page_views
    FROM visitor_tracking
    WHERE DATE(visited_at) = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- 전체 방문자 수 조회 함수
CREATE OR REPLACE FUNCTION get_total_visitors()
RETURNS TABLE(unique_visitors BIGINT, total_page_views BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT COALESCE(user_id::TEXT, ip_address))::BIGINT as unique_visitors,
        COUNT(*)::BIGINT as total_page_views
    FROM visitor_tracking;
END;
$$ LANGUAGE plpgsql;