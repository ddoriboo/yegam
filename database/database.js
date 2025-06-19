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

module.exports = {
    initDatabase,
    query,
    run,
    get,
    getClient,
    getCurrentTimeSQL
};