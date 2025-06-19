// PostgreSQL 전용 데이터베이스 인터페이스
const { initPostgreSQL, query: pgQuery, getClient } = require('./postgres');

const initDatabase = async () => {
    console.log('🔍 Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? '***설정됨***' : '설정되지 않음'
    });
    
    if (!process.env.DATABASE_URL) {
        throw new Error('❌ DATABASE_URL 환경 변수가 필요합니다. 로컬 개발시에도 PostgreSQL을 사용해주세요.');
    }
    
    console.log('🐘 PostgreSQL 데이터베이스 초기화 중...');
    return await initPostgreSQL();
};

// PostgreSQL 전용 간단한 인터페이스
const query = async (text, params = []) => {
    return await pgQuery(text, params);
};

const run = async (text, params = []) => {
    return await pgQuery(text, params);
};

const get = async (text, params = []) => {
    const result = await pgQuery(text, params);
    return result.rows[0] || null;
};

const getCurrentTimeSQL = () => {
    return 'NOW()';
};

// 임시 호환성 함수 - 기존 코드와의 호환성을 위해
const getDB = () => {
    return {
        all: async (text, params, callback) => {
            try {
                const result = await query(text, params || []);
                callback(null, result.rows);
            } catch (err) {
                callback(err);
            }
        },
        get: async (text, params, callback) => {
            try {
                const result = await get(text, params || []);
                callback(null, result);
            } catch (err) {
                callback(err);
            }
        },
        run: async (text, params, callback) => {
            try {
                const result = await run(text, params || []);
                callback.call({ lastID: result.rows[0]?.id, changes: result.rowCount || 0 });
            } catch (err) {
                callback(err);
            }
        }
    };
};

module.exports = {
    initDatabase,
    query,
    run,
    get,
    getClient,
    getCurrentTimeSQL,
    getDB
};