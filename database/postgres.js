const { Pool } = require('pg');

let pool;

const initPostgreSQL = () => {
    return new Promise((resolve, reject) => {
        // PostgreSQL 연결 설정
        const connectionString = process.env.DATABASE_URL;
        
        if (!connectionString) {
            console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
            reject(new Error('DATABASE_URL not set'));
            return;
        }
        
        pool = new Pool({
            connectionString: connectionString,
            ssl: connectionString.includes('railway') || connectionString.includes('postgres://') ? { rejectUnauthorized: false } : false
        });
        
        console.log('✅ PostgreSQL 연결 설정 완료');
        
        // 🇰🇷 PostgreSQL 타임존을 한국시간으로 설정
        pool.query("SET timezone = 'Asia/Seoul'", (err) => {
            if (err) {
                console.warn('⚠️ 타임존 설정 실패:', err.message);
            } else {
                console.log('🇰🇷 PostgreSQL 타임존이 Asia/Seoul로 설정되었습니다.');
            }
        });
        
        // 테이블 생성
        createTables()
            .then(() => {
                console.log('✅ PostgreSQL 테이블 초기화 완료');
                resolve();
            })
            .catch(reject);
    });
};

const createTables = async () => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // ⚠️ 운영 데이터 보호: 테이블 삭제 제거
        // 기존 테이블을 삭제하지 않고 CREATE TABLE IF NOT EXISTS 사용
        console.log('✅ 기존 데이터 보존 모드로 테이블 생성 시작');
        
        // 사용자 테이블 (SQLite와 호환)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                coins INTEGER DEFAULT 10000,
                gam_balance INTEGER DEFAULT 10000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Panel marker must exist before legacy balance migration.
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_panel_role TEXT');

        // 이슈 테이블 (TIMESTAMPTZ 사용으로 타임존 정보 보존)
        await client.query(`
            CREATE TABLE IF NOT EXISTS issues (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                category VARCHAR(100) NOT NULL,
                description TEXT,
                image_url TEXT,
                end_date TIMESTAMPTZ NOT NULL,
                betting_end_date TIMESTAMPTZ,
                yes_price INTEGER DEFAULT 50,
                total_volume INTEGER DEFAULT 0,
                yes_volume INTEGER DEFAULT 0,
                no_volume INTEGER DEFAULT 0,
                is_popular BOOLEAN DEFAULT FALSE,
                correct_answer TEXT DEFAULT NULL,
                status VARCHAR(50) DEFAULT 'active',
                result TEXT DEFAULT NULL,
                decided_by INTEGER DEFAULT NULL,
                decided_at TIMESTAMPTZ DEFAULT NULL,
                decision_reason TEXT DEFAULT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (decided_by) REFERENCES users (id)
            )
        `);
        
        // betting_end_date 컬럼 추가 (기존 테이블 호환)
        try {
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS betting_end_date TIMESTAMPTZ`);
            // 기존 데이터 마이그레이션: betting_end_date가 NULL이면 end_date로 설정
            await client.query(`UPDATE issues SET betting_end_date = end_date WHERE betting_end_date IS NULL`);
            console.log('✅ betting_end_date 컬럼 확인/추가 완료');
        } catch (error) {
            console.log('betting_end_date 컬럼 추가 스킵 (이미 존재함)');
        }
        
        // 기존 테이블에 새 컬럼 추가 (이미 존재하는 경우 무시)
        try {
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gam_balance INTEGER DEFAULT 10000`);
            // 기존 사용자들의 gam_balance를 coins 값으로 초기화
            await client.query(`UPDATE users SET gam_balance = coins WHERE gam_balance IS NULL AND ai_panel_role IS NULL`);
            console.log('✅ 사용자 테이블 gam_balance 컬럼 추가 완료');
        } catch (error) {
            console.log('사용자 테이블 gam_balance 컬럼 추가 스킵 (이미 존재함)');
        }
        
        // 인기이슈 순서 관리를 위한 popular_order 컬럼 추가
        try {
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS popular_order INTEGER DEFAULT NULL`);
            console.log('✅ 이슈 테이블 popular_order 컬럼 추가 완료');
        } catch (error) {
            console.log('이슈 테이블 popular_order 컬럼 추가 스킵 (이미 존재함)');
        }

        // 타임존 지원을 위한 TIMESTAMP -> TIMESTAMPTZ 마이그레이션
        // ⚠️ CRITICAL FIX: 이 마이그레이션이 배포 시마다 실행되어 마감시간이 계속 변경되는 문제 발생
        // 이미 TIMESTAMPTZ로 변환되었으므로 재실행 불필요 - 영구 비활성화
        /*
        try {
            // issues 테이블의 timestamp 컬럼들을 timestamptz로 변경
            await client.query(`ALTER TABLE issues ALTER COLUMN end_date TYPE TIMESTAMPTZ USING end_date AT TIME ZONE 'Asia/Seoul'`);
            await client.query(`ALTER TABLE issues ALTER COLUMN decided_at TYPE TIMESTAMPTZ USING decided_at AT TIME ZONE 'Asia/Seoul'`);
            await client.query(`ALTER TABLE issues ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul'`);
            await client.query(`ALTER TABLE issues ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'Asia/Seoul'`);
            console.log('✅ 이슈 테이블 타임존 마이그레이션 완료');
        } catch (error) {
            console.log('이슈 테이블 타임존 마이그레이션 스킵:', error.message);
        }
        */
        console.log('⏭️  타임존 마이그레이션 영구 비활성화 (이미 완료됨)');

        // 일일 출석 보상용 컬럼들 추가
        try {
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS consecutive_login_days INTEGER DEFAULT 0`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_prediction_reward BOOLEAN DEFAULT FALSE`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_comment_reward BOOLEAN DEFAULT FALSE`);
            console.log('✅ 사용자 테이블 출석 보상 컬럼들 추가 완료');
        } catch (error) {
            console.log('사용자 테이블 출석 보상 컬럼들 추가 스킵 (이미 존재함)');
        }
        
        // 튜토리얼 완료 상태 추적 컬럼 추가
        try {
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT FALSE`);
            console.log('✅ 사용자 테이블 튜토리얼 완료 컬럼 추가 완료');
        } catch (error) {
            console.log('사용자 테이블 튜토리얼 완료 컬럼 추가 스킵 (이미 존재함)');
        }
        
        // coins 데이터를 gam_balance로 마이그레이션 (데이터 통일)
        try {
            // 1. coins가 있지만 gam_balance가 없거나 0인 경우 동기화
            await client.query(`
                UPDATE users 
                SET gam_balance = COALESCE(coins, 10000) 
                WHERE (gam_balance IS NULL OR gam_balance = 0) AND ai_panel_role IS NULL
            `);
            
            // 2. 앞으로는 gam_balance를 기본값으로 설정
            await client.query(`
                UPDATE users 
                SET gam_balance = COALESCE(gam_balance, 10000) 
                WHERE gam_balance IS NULL AND ai_panel_role IS NULL
            `);
            
            // 3. coins 컬럼을 gam_balance와 동기화 (하위 호환성)
            await client.query(`
                UPDATE users 
                SET coins = gam_balance 
                WHERE (coins != gam_balance OR coins IS NULL) AND ai_panel_role IS NULL
            `);
            
            console.log('✅ GAM 시스템 완전 통일 마이그레이션 완료');
        } catch (error) {
            console.log('GAM 마이그레이션 스킵:', error.message);
        }
        
        try {
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS description TEXT`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS image_url TEXT`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS result TEXT DEFAULT NULL`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS decided_by INTEGER`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP DEFAULT NULL`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS decision_reason TEXT DEFAULT NULL`);
            console.log('✅ 이슈 테이블 누락 컬럼 추가 완료');
        } catch (error) {
            // 컬럼이 이미 존재하는 경우 무시
            console.log('이슈 테이블 컬럼 추가 스킵 (이미 존재함)');
        }
        
        // 베팅 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS bets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                issue_id INTEGER NOT NULL,
                choice VARCHAR(10) NOT NULL,
                amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (issue_id) REFERENCES issues (id),
                UNIQUE(user_id, issue_id)
            )
        `);
        
        // 관리자 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        
        // 댓글 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                issue_id INTEGER NOT NULL,
                parent_id INTEGER DEFAULT NULL,
                content TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                is_highlighted BOOLEAN DEFAULT FALSE,
                highlight_expires_at TIMESTAMP DEFAULT NULL,
                deleted_at TIMESTAMP DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (issue_id) REFERENCES issues (id),
                FOREIGN KEY (parent_id) REFERENCES comments (id)
            )
        `);
        
        // 댓글 좋아요 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS comment_likes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                comment_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (comment_id) REFERENCES comments (id),
                UNIQUE(user_id, comment_id)
            )
        `);
        
        // 보상 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS rewards (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                issue_id INTEGER NOT NULL,
                bet_id INTEGER NOT NULL,
                reward_amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (issue_id) REFERENCES issues (id),
                FOREIGN KEY (bet_id) REFERENCES bets (id)
            )
        `);
        
        // 알림 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(200) NOT NULL,
                message TEXT NOT NULL,
                related_id INTEGER,
                related_type VARCHAR(50),
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        
        // GAM 거래 내역 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS gam_transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'burn')),
                category VARCHAR(50) NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                reference_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);
        
        // reference_id 컬럼 타입을 TEXT로 변경 (기존 데이터베이스 대응)
        try {
            await client.query(`
                ALTER TABLE gam_transactions 
                ALTER COLUMN reference_id TYPE TEXT
            `);
            console.log('✅ gam_transactions.reference_id 컬럼 타입을 TEXT로 변경 완료');
        } catch (alterError) {
            // 이미 TEXT 타입이거나 다른 이유로 실패한 경우 무시
            console.log('ℹ️ gam_transactions.reference_id 컬럼 타입 변경 스킵:', alterError.message.substring(0, 100));
        }
        
        // === 주제별 분석방 Discussion 테이블들 ===
        console.log('💬 분석방 Discussion 테이블 생성 중...');
        
        // 1. 토론 카테고리 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS discussion_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                icon VARCHAR(20),
                color VARCHAR(20) DEFAULT '#3B82F6',
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 2. 토론 게시글 테이블
        await client.query(`
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
                media_urls TEXT[],
                media_types TEXT[],
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 3. 토론 댑글 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS discussion_comments (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES discussion_posts(id) ON DELETE CASCADE,
                author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                parent_id INTEGER REFERENCES discussion_comments(id) ON DELETE CASCADE,
                like_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 4. 토론 게시글 좋아요 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS discussion_post_likes (
                id SERIAL PRIMARY KEY,
                post_id INTEGER REFERENCES discussion_posts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id)
            )
        `);
        
        // 5. 토론 댑글 좋아요 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS discussion_comment_likes (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER REFERENCES discussion_comments(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            )
        `);
        
        console.log('✅ 분석방 Discussion 테이블 생성 완료');
        
        // 성능 최적화를 위한 인덱스 생성
        console.log('🔧 데이터베이스 인덱스 생성 중...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_issues_end_date ON issues(end_date)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_issues_betting_end_date ON issues(betting_end_date)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_bets_user_issue ON bets(user_id, issue_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_gam_transactions_user_id ON gam_transactions(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_gam_transactions_type ON gam_transactions(type)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_gam_transactions_created_at ON gam_transactions(created_at)');
        
        // Discussion 테이블 인덱스
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_posts_category ON discussion_posts(category_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_posts_author ON discussion_posts(author_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_posts_created ON discussion_posts(created_at DESC)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_posts_likes ON discussion_posts(like_count DESC)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_posts_notice ON discussion_posts(is_notice, is_pinned)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_comments_post ON discussion_comments(post_id, created_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_comments_author ON discussion_comments(author_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_discussion_comments_parent ON discussion_comments(parent_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_post_likes_post ON discussion_post_likes(post_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_post_likes_user ON discussion_post_likes(user_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON discussion_comment_likes(comment_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON discussion_comment_likes(user_id)');
        
        console.log('✅ 데이터베이스 인덱스 생성 완료');
        
        await client.query('COMMIT');
        console.log('✅ PostgreSQL 테이블 생성 완료');
        
        // 초기 데이터 삽입
        await insertInitialData();
        
        // Discussion 카테골4리 초기 데이터
        await insertDiscussionCategories();
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ PostgreSQL 테이블 생성 실패:', error);
        throw error;
    } finally {
        client.release();
    }
};

const insertInitialData = async () => {
    const client = await pool.connect();
    
    try {
        // 기존 이슈 데이터 확인
        const result = await client.query('SELECT COUNT(*) as count FROM issues');
        const count = parseInt(result.rows[0].count);
        
        if (count > 0) {
            console.log('✅ 기존 이슈 데이터 보존 - 초기 데이터 삽입 건너뜀');
            return;
        }
        
        // 초기 이슈 데이터 삽입
        const initialIssues = [
            {
                title: "윤석열 대통령, 2025년 내 탄핵소추안 통과될까?",
                category: "정치",
                end_date: "2025-12-31 23:59:59",
                yes_price: 35,
                total_volume: 85000000,
                is_popular: true,
                yes_volume: 29750000,
                no_volume: 55250000
            },
            {
                title: "손흥민, 2025년 발롱도르 후보 30인에 선정될까?",
                category: "스포츠",
                end_date: "2025-10-15 23:59:59",
                yes_price: 28,
                total_volume: 45000000,
                is_popular: true,
                yes_volume: 12600000,
                no_volume: 32400000
            },
            {
                title: "비트코인, 2025년 내 20만 달러 돌파할까?",
                category: "코인",
                end_date: "2025-12-31 23:59:59",
                yes_price: 45,
                total_volume: 250000000,
                is_popular: true,
                yes_volume: 112500000,
                no_volume: 137500000
            },
            {
                title: "애플, 2025년 내 폴더블 아이폰 출시할까?",
                category: "테크",
                end_date: "2025-09-30 23:59:59",
                yes_price: 30,
                total_volume: 75000000,
                is_popular: false,
                yes_volume: 22500000,
                no_volume: 52500000
            }
        ];
        
        for (const issue of initialIssues) {
            await client.query(`
                INSERT INTO issues (title, category, end_date, yes_price, total_volume, is_popular, yes_volume, no_volume)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                issue.title, issue.category, issue.end_date, issue.yes_price,
                issue.total_volume, issue.is_popular, issue.yes_volume, issue.no_volume
            ]);
        }
        
        console.log('✅ 초기 이슈 데이터 삽입 완료');
        
    } catch (error) {
        console.error('❌ 초기 데이터 삽입 실패:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Discussion 카테고리 초기 데이터 삽입
const insertDiscussionCategories = async () => {
    const client = await pool.connect();
    
    try {
        // 기존 카테고리 데이터 확인
        const result = await client.query('SELECT COUNT(*) as count FROM discussion_categories');
        const count = parseInt(result.rows[0].count);
        
        if (count > 0) {
            console.log('✅ 기존 Discussion 카테고리 데이터 보존 - 초기 데이터 삽입 건너뜌');
            return;
        }
        
        console.log('💬 기존 8개 카테고리 시스템 데이터 삽입 중...');
        
        // 기존 8개 카테고리 데이터 삽입
        const categories = [
            {name: '전체', description: '모든 주제의 토론', icon: '💬', color: '#6B7280', display_order: 0},
            {name: '정치', description: '선거, 정책, 정치적 이벤트', icon: '🏛️', color: '#DC2626', display_order: 1},
            {name: '스포츠', description: '경기 결과, 시즌 성과', icon: '⚽', color: '#0891B2', display_order: 2},
            {name: '경제', description: '주식, 환율, 경제 지표', icon: '📈', color: '#059669', display_order: 3},
            {name: '코인', description: '암호화폐 가격, 트렌드', icon: '₿', color: '#F59E0B', display_order: 4},
            {name: '테크', description: '기술 트렌드, 제품 출시', icon: '💻', color: '#7C3AED', display_order: 5},
            {name: '엔터', description: '연예계, 문화 콘텐츠', icon: '🎭', color: '#EC4899', display_order: 6},
            {name: '날씨', description: '기상 예보, 계절 예측', icon: '🌤️', color: '#3B82F6', display_order: 7},
            {name: '해외', description: '국제 정치, 글로벌 이벤트', icon: '🌍', color: '#4F46E5', display_order: 8}
        ];
        
        for (const category of categories) {
            await client.query(`
                INSERT INTO discussion_categories (name, description, icon, color, display_order)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (name) DO NOTHING
            `, [category.name, category.description, category.icon, category.color, category.display_order]);
        }
        
        // 트리거 생성
        await createDiscussionTriggers(client);
        
        console.log('✅ Discussion 카테고리 초기 데이터 삽입 완료 (9개)');
        
    } catch (error) {
        console.error('❌ Discussion 카테고리 데이터 삽입 실패:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Discussion 트리거 생성
const createDiscussionTriggers = async (client) => {
    try {
        // 댑글 수 자동 업데이트 트리거
        await client.query(`
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
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_comment_count ON discussion_comments;
            CREATE TRIGGER trigger_update_comment_count
                AFTER INSERT OR DELETE ON discussion_comments
                FOR EACH ROW EXECUTE FUNCTION update_discussion_post_comment_count();
        `);
        
        // 게시글 좋아요 수 자동 업데이트 트리거
        await client.query(`
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
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_post_like_count ON discussion_post_likes;
            CREATE TRIGGER trigger_update_post_like_count
                AFTER INSERT OR DELETE ON discussion_post_likes
                FOR EACH ROW EXECUTE FUNCTION update_discussion_post_like_count();
        `);
        
        // 댑글 좋아요 수 자동 업데이트 트리거
        await client.query(`
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
        `);
        
        await client.query(`
            DROP TRIGGER IF EXISTS trigger_update_comment_like_count ON discussion_comment_likes;
            CREATE TRIGGER trigger_update_comment_like_count
                AFTER INSERT OR DELETE ON discussion_comment_likes
                FOR EACH ROW EXECUTE FUNCTION update_discussion_comment_like_count();
        `);
        
        console.log('✅ Discussion 트리거 생성 완료');
        
    } catch (error) {
        console.error('❌ Discussion 트리거 생성 실패:', error);
        throw error;
    }
};

const getPool = () => {
    if (!pool) {
        throw new Error('PostgreSQL pool not initialized');
    }
    return pool;
};

// Helper functions for database operations
const query = async (text, params) => {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
};

const getClient = async () => {
    return await pool.connect();
};

module.exports = {
    initPostgreSQL,
    getPool,
    query,
    getClient,
    insertDiscussionCategories
};