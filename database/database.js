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

const isPostgreSQL = () => {
    return true; // 이제 PostgreSQL만 사용
};

// SQLite 플레이스홀더를 PostgreSQL로 변환하는 헬퍼 함수
const convertSQLiteToPostgreSQL = (query, params = []) => {
    let paramIndex = 1;
    const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
    return { query: convertedQuery, params };
};

// 임시 호환성 함수 - 기존 코드와의 호환성을 위해
const getDB = () => {
    return {
        all: async (text, params, callback) => {
            // SQLite 스타일: db.all(query, callback) 또는 db.all(query, params, callback)
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            try {
                const { query: convertedQuery, params: convertedParams } = convertSQLiteToPostgreSQL(text, params || []);
                const result = await pgQuery(convertedQuery, convertedParams);
                if (callback) callback(null, result.rows);
            } catch (err) {
                console.error('PostgreSQL all 쿼리 실패:', err);
                console.error('원본 쿼리:', text);
                console.error('파라미터:', params);
                if (callback) callback(err);
            }
        },
        get: async (text, params, callback) => {
            // SQLite 스타일: db.get(query, callback) 또는 db.get(query, params, callback)
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            try {
                const { query: convertedQuery, params: convertedParams } = convertSQLiteToPostgreSQL(text, params || []);
                const result = await pgQuery(convertedQuery, convertedParams);
                if (callback) callback(null, result.rows[0] || null);
            } catch (err) {
                console.error('PostgreSQL get 쿼리 실패:', err);
                console.error('원본 쿼리:', text);
                console.error('파라미터:', params);
                if (callback) callback(err);
            }
        },
        run: async (text, params, callback) => {
            // SQLite 스타일: db.run(query, callback) 또는 db.run(query, params, callback)
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            try {
                const { query: convertedQuery, params: convertedParams } = convertSQLiteToPostgreSQL(text, params || []);
                const result = await pgQuery(convertedQuery, convertedParams);
                if (callback) {
                    callback.call({ 
                        lastID: result.rows[0]?.id || result.insertId, 
                        changes: result.rowCount || 0 
                    });
                }
            } catch (err) {
                console.error('PostgreSQL run 쿼리 실패:', err);
                console.error('원본 쿼리:', text);
                console.error('파라미터:', params);
                if (callback) callback(err);
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
    getDB,
    isPostgreSQL
};