-- 주제별 분석방 데이터베이스 테이블 생성

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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스
    INDEX idx_discussion_posts_category (category_id),
    INDEX idx_discussion_posts_author (author_id),
    INDEX idx_discussion_posts_created (created_at DESC),
    INDEX idx_discussion_posts_likes (like_count DESC),
    INDEX idx_discussion_posts_notice (is_notice, is_pinned)
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 인덱스
    INDEX idx_discussion_comments_post (post_id, created_at),
    INDEX idx_discussion_comments_author (author_id),
    INDEX idx_discussion_comments_parent (parent_id)
);

-- 4. 좋아요 테이블 (게시글)
CREATE TABLE IF NOT EXISTS discussion_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES discussion_posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 중복 방지
    UNIQUE(post_id, user_id),
    INDEX idx_post_likes_post (post_id),
    INDEX idx_post_likes_user (user_id)
);

-- 5. 좋아요 테이블 (댓글)
CREATE TABLE IF NOT EXISTS discussion_comment_likes (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER REFERENCES discussion_comments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- 중복 방지
    UNIQUE(comment_id, user_id),
    INDEX idx_comment_likes_comment (comment_id),
    INDEX idx_comment_likes_user (user_id)
);

-- 6. 기본 카테고리 데이터 삽입
INSERT INTO discussion_categories (name, description, icon, color, display_order) VALUES
('전체', '모든 주제의 토론', '💬', '#6B7280', 0),
('정치', '정치 관련 예측 및 토론', '🏛️', '#DC2626', 1),
('경제', '경제 동향 및 시장 분석', '📈', '#059669', 2),
('스포츠', '스포츠 경기 예측 및 분석', '⚽', '#EA580C', 3),
('기술', 'IT 및 기술 트렌드', '💻', '#7C3AED', 4),
('연예', '연예계 및 엔터테인먼트', '🎭', '#EC4899', 5),
('사회', '사회 이슈 및 트렌드', '🏘️', '#0891B2', 6),
('기타', '기타 주제', '🔗', '#6B7280', 99)
ON CONFLICT (name) DO NOTHING;

-- 7. 트리거: 댓글 수 자동 업데이트
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

CREATE TRIGGER trigger_update_comment_count
    AFTER INSERT OR DELETE ON discussion_comments
    FOR EACH ROW EXECUTE FUNCTION update_discussion_post_comment_count();

-- 8. 트리거: 좋아요 수 자동 업데이트 (게시글)
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

CREATE TRIGGER trigger_update_post_like_count
    AFTER INSERT OR DELETE ON discussion_post_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_post_like_count();

-- 9. 트리거: 좋아요 수 자동 업데이트 (댓글)
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

CREATE TRIGGER trigger_update_comment_like_count
    AFTER INSERT OR DELETE ON discussion_comment_likes
    FOR EACH ROW EXECUTE FUNCTION update_discussion_comment_like_count();