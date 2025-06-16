const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'yegame.db');

let db;

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('데이터베이스 연결 실패:', err);
                reject(err);
                return;
            }
            console.log('✅ SQLite 데이터베이스 연결 성공');
            
            // 테이블 생성
            createTables()
                .then(() => {
                    console.log('✅ 데이터베이스 테이블 초기화 완료');
                    resolve();
                })
                .catch(reject);
        });
    });
};

const createTables = () => {
    return new Promise((resolve, reject) => {
        const queries = [
            // 사용자 테이블
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                coins INTEGER DEFAULT 10000,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 이슈 테이블
            `CREATE TABLE IF NOT EXISTS issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
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
            
            // 베팅 테이블
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
            
            // 관리자 테이블
            `CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`
        ];
        
        let completed = 0;
        const total = queries.length;
        
        queries.forEach(query => {
            db.run(query, (err) => {
                if (err) {
                    console.error('테이블 생성 실패:', err);
                    reject(err);
                    return;
                }
                
                completed++;
                if (completed === total) {
                    // 초기 데이터 삽입
                    insertInitialData()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    });
};

const insertInitialData = () => {
    return new Promise((resolve, reject) => {
        // 기존 이슈 데이터 확인
        db.get('SELECT COUNT(*) as count FROM issues', (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row.count > 0) {
                // 이미 데이터가 있으면 스킵
                resolve();
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
                        console.error('초기 데이터 삽입 실패:', err);
                        reject(err);
                        return;
                    }
                    
                    completed++;
                    if (completed === initialIssues.length) {
                        console.log('✅ 초기 이슈 데이터 삽입 완료');
                        resolve();
                    }
                });
            });
        });
    });
};

const getDB = () => db;

module.exports = {
    initDatabase,
    getDB
};