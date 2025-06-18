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
        
        // 사용자 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                gam_balance INTEGER DEFAULT 10000,
                profile_image TEXT,
                provider VARCHAR(50) DEFAULT 'local',
                provider_id TEXT,
                verified BOOLEAN DEFAULT FALSE,
                verification_token TEXT,
                last_login_date DATE,
                consecutive_login_days INTEGER DEFAULT 0,
                total_predictions INTEGER DEFAULT 0,
                correct_predictions INTEGER DEFAULT 0,
                first_prediction_reward BOOLEAN DEFAULT FALSE,
                first_comment_reward BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 이슈 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS issues (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                category VARCHAR(100) NOT NULL,
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
        
        // 감 거래 내역 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS gam_transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                type VARCHAR(50) NOT NULL,
                category VARCHAR(100) NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                reference_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        
        // 관리자 테이블
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
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
            console.log('✅ 초기 데이터가 이미 존재합니다.');
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