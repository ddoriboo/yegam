// Unified database interface for SQLite (dev) and PostgreSQL (production)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { initPostgreSQL, query: pgQuery, getClient } = require('./postgres');

const DB_PATH = path.join(__dirname, 'yegame.db');
let db; // SQLite instance
let isPostgreSQL = false;

const initDatabase = async () => {
    // 임시로 SQLite만 사용 (PostgreSQL 연결 문제 해결 후 활성화)
    console.log('📁 Using SQLite database (temporary)...');
    isPostgreSQL = false;
    return initSQLite();
    
    // TODO: PostgreSQL 연결 문제 해결 후 아래 코드 활성화
    /*
    // Use PostgreSQL in production if DATABASE_URL is set
    if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
        console.log('🐘 Using PostgreSQL database...');
        isPostgreSQL = true;
        return await initPostgreSQL();
    }
    
    // Use SQLite for development
    console.log('📁 Using SQLite database...');
    isPostgreSQL = false;
    return initSQLite();
    */
};

const initSQLite = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ SQLite 연결 실패:', err);
                reject(err);
                return;
            }
            console.log('✅ SQLite 데이터베이스 연결 성공');
            
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) {
                    console.error('❌ Foreign keys 활성화 실패:', err);
                    reject(err);
                    return;
                }
                
                // Create tables
                createSQLiteTables()
                    .then(() => {
                        console.log('✅ SQLite 테이블 초기화 완료');
                        resolve();
                    })
                    .catch(reject);
            });
        });
    });
};

const createSQLiteTables = () => {
    return new Promise((resolve, reject) => {
        const queries = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                gam_balance INTEGER DEFAULT 10000,
                profile_image TEXT,
                provider TEXT DEFAULT 'local',
                provider_id TEXT,
                verified BOOLEAN DEFAULT FALSE,
                verification_token TEXT,
                last_login_date DATE,
                consecutive_login_days INTEGER DEFAULT 0,
                total_predictions INTEGER DEFAULT 0,
                correct_predictions INTEGER DEFAULT 0,
                first_prediction_reward BOOLEAN DEFAULT 0,
                first_comment_reward BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Issues table
            `CREATE TABLE IF NOT EXISTS issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                image_url TEXT,
                end_date DATETIME NOT NULL,
                yes_price INTEGER DEFAULT 50,
                total_volume INTEGER DEFAULT 0,
                yes_volume INTEGER DEFAULT 0,
                no_volume INTEGER DEFAULT 0,
                is_popular BOOLEAN DEFAULT FALSE,
                correct_answer TEXT DEFAULT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Bets table
            `CREATE TABLE IF NOT EXISTS bets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                issue_id INTEGER NOT NULL,
                choice TEXT NOT NULL,
                amount INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (issue_id) REFERENCES issues (id),
                UNIQUE(user_id, issue_id)
            )`,
            
            // Gam transactions table
            `CREATE TABLE IF NOT EXISTS gam_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                category TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT,
                reference_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // Admins table
            `CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`
        ];
        
        let completed = 0;
        const total = queries.length;
        
        queries.forEach((query, index) => {
            db.run(query, (err) => {
                if (err) {
                    console.error(`❌ SQLite 테이블 생성 실패 (${index + 1}):`, err);
                    reject(err);
                    return;
                }
                
                completed++;
                if (completed === total) {
                    insertSQLiteInitialData()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    });
};

const insertSQLiteInitialData = () => {
    return new Promise((resolve, reject) => {
        // Check if data already exists
        db.get('SELECT COUNT(*) as count FROM issues', (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row.count > 0) {
                console.log('✅ SQLite 초기 데이터가 이미 존재합니다.');
                resolve();
                return;
            }
            
            // Insert initial issues
            const initialIssues = [
                {
                    title: "윤석열 대통령, 2025년 내 탄핵소추안 통과될까?",
                    category: "정치",
                    end_date: "2025-12-31 23:59:59",
                    yes_price: 35,
                    total_volume: 85000000,
                    is_popular: 1,
                    yes_volume: 29750000,
                    no_volume: 55250000
                },
                {
                    title: "손흥민, 2025년 발롱도르 후보 30인에 선정될까?",
                    category: "스포츠",
                    end_date: "2025-10-15 23:59:59",
                    yes_price: 28,
                    total_volume: 45000000,
                    is_popular: 1,
                    yes_volume: 12600000,
                    no_volume: 32400000
                },
                {
                    title: "비트코인, 2025년 내 20만 달러 돌파할까?",
                    category: "코인",
                    end_date: "2025-12-31 23:59:59",
                    yes_price: 45,
                    total_volume: 250000000,
                    is_popular: 1,
                    yes_volume: 112500000,
                    no_volume: 137500000
                }
            ];
            
            const insertQuery = `INSERT INTO issues (title, category, end_date, yes_price, total_volume, is_popular, yes_volume, no_volume)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
            let completed = 0;
            initialIssues.forEach(issue => {
                db.run(insertQuery, [
                    issue.title, issue.category, issue.end_date, issue.yes_price,
                    issue.total_volume, issue.is_popular, issue.yes_volume, issue.no_volume
                ], (err) => {
                    if (err) {
                        console.error('❌ SQLite 초기 데이터 삽입 실패:', err);
                        reject(err);
                        return;
                    }
                    
                    completed++;
                    if (completed === initialIssues.length) {
                        console.log('✅ SQLite 초기 이슈 데이터 삽입 완료');
                        resolve();
                    }
                });
            });
        });
    });
};

// Convert PostgreSQL-style parameters ($1, $2) to SQLite-style (?, ?)
const convertParameters = (text, params) => {
    if (isPostgreSQL) {
        return { text, params };
    } else {
        // Convert $1, $2, etc. to ?
        let convertedText = text;
        const sortedParams = [];
        
        // Find all $n parameters and replace with ?
        const paramMatches = text.match(/\$(\d+)/g);
        if (paramMatches) {
            const paramNumbers = paramMatches.map(match => parseInt(match.substring(1)));
            const maxParam = Math.max(...paramNumbers);
            
            for (let i = 1; i <= maxParam; i++) {
                const paramIndex = i - 1;
                if (params[paramIndex] !== undefined) {
                    sortedParams.push(params[paramIndex]);
                }
                convertedText = convertedText.replace(new RegExp(`\\$${i}`, 'g'), '?');
            }
        }
        
        return { text: convertedText, params: sortedParams };
    }
};

// Unified query interface
const query = async (text, params = []) => {
    if (isPostgreSQL) {
        return await pgQuery(text, params);
    } else {
        const { text: convertedText, params: convertedParams } = convertParameters(text, params);
        return new Promise((resolve, reject) => {
            db.all(convertedText, convertedParams, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ rows });
                }
            });
        });
    }
};

// Unified run interface (for INSERT, UPDATE, DELETE)
const run = async (text, params = []) => {
    if (isPostgreSQL) {
        return await pgQuery(text, params);
    } else {
        const { text: convertedText, params: convertedParams } = convertParameters(text, params);
        return new Promise((resolve, reject) => {
            db.run(convertedText, convertedParams, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        lastID: this.lastID, 
                        changes: this.changes,
                        rows: [] 
                    });
                }
            });
        });
    }
};

// Get single row
const get = async (text, params = []) => {
    if (isPostgreSQL) {
        const result = await pgQuery(text, params);
        return result.rows[0] || null;
    } else {
        const { text: convertedText, params: convertedParams } = convertParameters(text, params);
        return new Promise((resolve, reject) => {
            db.get(convertedText, convertedParams, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }
};

// Legacy getter for SQLite compatibility
const getDB = () => {
    if (isPostgreSQL) {
        return {
            query,
            run,
            get,
            all: query
        };
    }
    return db;
};

module.exports = {
    initDatabase,
    query,
    run,
    get,
    getDB,
    isPostgreSQL: () => isPostgreSQL
};