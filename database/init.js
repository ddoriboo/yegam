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
            
            // 이슈 테이블
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
            )`,
            
            // 감 거래 내역 테이블
            `CREATE TABLE IF NOT EXISTS gam_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL, -- 'earn' 또는 'burn'
                category TEXT NOT NULL, -- 'signup', 'login', 'betting_success', 'betting_fail', 'commission' 등
                amount INTEGER NOT NULL,
                description TEXT,
                reference_id INTEGER, -- 관련된 베팅이나 이슈 ID
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // 업적 테이블
            `CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                type TEXT NOT NULL, -- 'win_streak', 'accuracy', 'volume' 등
                condition_value INTEGER NOT NULL, -- 달성 조건 값
                reward_gam INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 사용자 업적 테이블
            `CREATE TABLE IF NOT EXISTS user_achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                achievement_id INTEGER NOT NULL,
                achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (achievement_id) REFERENCES achievements (id),
                UNIQUE(user_id, achievement_id)
            )`,
            
            // 주간 랭킹 테이블
            `CREATE TABLE IF NOT EXISTS weekly_rankings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                week_start DATE NOT NULL,
                week_end DATE NOT NULL,
                profit_rate REAL NOT NULL,
                total_volume INTEGER NOT NULL,
                rank_position INTEGER NOT NULL,
                reward_gam INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // 댓글 테이블 (베스트 댓글 보상용)
            `CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                issue_id INTEGER NOT NULL,
                parent_id INTEGER,
                content TEXT NOT NULL,
                likes INTEGER DEFAULT 0,
                is_highlighted BOOLEAN DEFAULT 0,
                highlight_expires_at DATETIME,
                deleted_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (issue_id) REFERENCES issues (id),
                FOREIGN KEY (parent_id) REFERENCES comments (id)
            )`,
            
            // 댓글 좋아요 테이블
            `CREATE TABLE IF NOT EXISTS comment_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                comment_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (comment_id) REFERENCES comments (id),
                UNIQUE(user_id, comment_id)
            )`,
            
            // 관리자 테이블
            `CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
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
                        .then(() => insertInitialAchievements())
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    });
};

const insertInitialData = () => {
    return new Promise((resolve, reject) => {
        // 기존 DB에 description 컬럼 추가 (에러 무시)
        db.run('ALTER TABLE issues ADD COLUMN description TEXT', (err) => {
            // 이미 존재하는 컬럼인 경우 에러가 발생하지만 무시함
        });
        
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

const insertInitialAchievements = () => {
    return new Promise((resolve, reject) => {
        // 기존 업적 데이터 확인
        db.get('SELECT COUNT(*) as count FROM achievements', (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row.count > 0) {
                // 이미 데이터가 있으면 스킵
                resolve();
                return;
            }
            
            // 초기 업적 데이터
            const initialAchievements = [
                {
                    name: '5연승 달성',
                    description: '연속으로 5번 예측에 성공하세요',
                    type: 'win_streak',
                    condition_value: 5,
                    reward_gam: 3000
                },
                {
                    name: '정확도 70% 달성',
                    description: '전체 예측 정확도 70%를 달성하세요',
                    type: 'accuracy',
                    condition_value: 70,
                    reward_gam: 5000
                },
                {
                    name: '베팅 고수',
                    description: '총 베팅 금액 100만감을 달성하세요',
                    type: 'volume',
                    condition_value: 1000000,
                    reward_gam: 10000
                }
            ];
            
            const insertQuery = `INSERT INTO achievements (name, description, type, condition_value, reward_gam)
                                VALUES (?, ?, ?, ?, ?)`;
            
            let completed = 0;
            initialAchievements.forEach(achievement => {
                db.run(insertQuery, [
                    achievement.name, achievement.description, achievement.type, 
                    achievement.condition_value, achievement.reward_gam
                ], (err) => {
                    if (err) {
                        console.error('초기 업적 데이터 삽입 실패:', err);
                        reject(err);
                        return;
                    }
                    
                    completed++;
                    if (completed === initialAchievements.length) {
                        console.log('✅ 초기 업적 데이터 삽입 완료');
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