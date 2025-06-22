-- Railway PostgreSQL용 Discussion 테이블 생성 스크립트
-- 기존 8개 카테고리 시스템 준용

-- 1. 토론 카테고리 테이블
CREATE TABLE IF NOT EXISTS discussion_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(20),
    color VARCHAR(20) DEFAULT '#3B82F6',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 토론 게시글 테이블
CREATE TABLE IF NOT EXISTS discussion_posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category_id INTEGER REFERENCES discussion_categories(id) ON DELETE SET NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_notice BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    media_urls TEXT[], -- 이미지/영상 URL 배열
    media_types TEXT[], -- 미디어 타입 배열 (image, youtube, video)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 토론 댓글 테이블
CREATE TABLE IF NOT EXISTS discussion_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES discussion_posts(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id INTEGER REFERENCES discussion_comments(id) ON DELETE CASCADE, -- 대댓글용
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 좋아요 테이블 (게시글)
CREATE TABLE IF NOT EXISTS discussion_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES discussion_posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

-- 5. 좋아요 테이블 (댓글)
CREATE TABLE IF NOT EXISTS discussion_comment_likes (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER REFERENCES discussion_comments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- 6. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_discussion_posts_category ON discussion_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_author ON discussion_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_created ON discussion_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_likes ON discussion_posts(like_count DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_notice ON discussion_posts(is_notice, is_pinned);

CREATE INDEX IF NOT EXISTS idx_discussion_comments_post ON discussion_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_author ON discussion_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_discussion_comments_parent ON discussion_comments(parent_id);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON discussion_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON discussion_post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON discussion_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON discussion_comment_likes(user_id);

-- 7. 카테고리 데이터 삽입 ('전체'는 필터용이므로 제외, '일반' 카테고리 추가)
INSERT INTO discussion_categories (name, description, icon, color, display_order) VALUES
('일반', '일반적인 주제의 자유로운 토론', '💬', '#6B7280', 1),
('정치', '선거, 정책, 정치적 이벤트', '🏛️', '#DC2626', 2),
('스포츠', '경기 결과, 시즌 성과', '⚽', '#0891B2', 3),
('경제', '주식, 환율, 경제 지표', '📈', '#059669', 4),
('코인', '암호화폐 가격, 트렌드', '₿', '#F59E0B', 5),
('테크', '기술 트렌드, 제품 출시', '💻', '#7C3AED', 6),
('엔터', '연예계, 문화 콘텐츠', '🎭', '#EC4899', 7),
('날씨', '기상 예보, 계절 예측', '🌤️', '#3B82F6', 8),
('해외', '국제 정치, 글로벌 이벤트', '🌍', '#4F46E5', 9)
ON CONFLICT (name) DO NOTHING;

-- 8. 트리거: 댓글 수 자동 업데이트
CREATE OR REPLACE FUNCTION update_discussion_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussion_posts 
        SET comment_count = comment_count + 1 
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussion_posts 
        SET comment_count = comment_count - 1 
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_comment_count
    AFTER INSERT OR DELETE ON discussion_comments
    FOR EACH ROW EXECUTE FUNCTION update_discussion_post_comment_count();

-- 9. 트리거: 좋아요 수 자동 업데이트 (게시글)
CREATE OR REPLACE FUNCTION update_discussion_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussion_posts 
        SET like_count = like_count + 1 
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussion_posts 
        SET like_count = like_count - 1 
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_post_like_count
    AFTER INSERT OR DELETE ON discussion_post_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_post_like_count();

-- 10. 트리거: 좋아요 수 자동 업데이트 (댓글)
CREATE OR REPLACE FUNCTION update_discussion_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE discussion_comments 
        SET like_count = like_count + 1 
        WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE discussion_comments 
        SET like_count = like_count - 1 
        WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_update_comment_like_count
    AFTER INSERT OR DELETE ON discussion_comment_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_comment_like_count();