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
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        
        console.log('✅ PostgreSQL 연결 설정 완료');
        
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 이슈 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS issues (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                category VARCHAR(100) NOT NULL,
                description TEXT,
                image_url TEXT,
                end_date TIMESTAMP NOT NULL,
                yes_price INTEGER DEFAULT 50,
                total_volume INTEGER DEFAULT 0,
                yes_volume INTEGER DEFAULT 0,
                no_volume INTEGER DEFAULT 0,
                is_popular BOOLEAN DEFAULT FALSE,
                correct_answer TEXT DEFAULT NULL,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 기존 테이블에 새 컬럼 추가 (이미 존재하는 경우 무시)
        try {
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS description TEXT`);
            await client.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS image_url TEXT`);
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
        
        await client.query('COMMIT');
        console.log('✅ PostgreSQL 테이블 생성 완료');
        
        // 초기 데이터 삽입
        await insertInitialData();
        
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
    getClient
};