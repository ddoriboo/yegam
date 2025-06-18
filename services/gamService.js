const { getDB } = require('../database/init');

class GamService {
    constructor() {
        this.db = null;
    }

    init() {
        this.db = getDB();
    }

    // 감 획득 관련 메서드들
    async earnGam(userId, category, amount, description = null, referenceId = null) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                // 사용자 잔액 업데이트
                this.db.run(
                    'UPDATE users SET gam_balance = gam_balance + ? WHERE id = ?',
                    [amount, userId],
                    (err) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        // 거래 내역 기록
                        this.db.run(
                            'INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
                            [userId, 'earn', category, amount, description, referenceId],
                            (err) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                this.db.run('COMMIT');
                                resolve({ success: true, newBalance: null });
                            }
                        );
                    }
                );
            });
        });
    }

    // 회원가입 보상
    async giveSignupReward(userId) {
        return this.earnGam(userId, 'signup', 10000, '회원가입 보상');
    }

    // 로그인 보상
    async giveLoginReward(userId) {
        return new Promise((resolve, reject) => {
            // 현재 사용자 로그인 정보 확인
            this.db.get(
                'SELECT last_login_date, consecutive_login_days FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const today = new Date().toISOString().split('T')[0];
                    const lastLogin = user.last_login_date;
                    let consecutiveDays = user.consecutive_login_days || 0;
                    let rewardAmount = 200; // 기본 보상
                    
                    // 연속 접속 계산
                    if (lastLogin === today) {
                        // 이미 오늘 로그인했음
                        resolve({ success: false, message: '오늘 이미 로그인 보상을 받았습니다.' });
                        return;
                    }
                    
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStr = yesterday.toISOString().split('T')[0];
                    
                    if (lastLogin === yesterdayStr) {
                        // 연속 접속
                        consecutiveDays += 1;
                    } else {
                        // 연속 접속 중단
                        consecutiveDays = 1;
                    }
                    
                    // 연속 접속 보너스
                    if (consecutiveDays === 3) rewardAmount = 300;
                    else if (consecutiveDays === 5) rewardAmount = 500;
                    else if (consecutiveDays >= 7) rewardAmount = 1000;
                    
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');
                        
                        // 사용자 로그인 정보 업데이트
                        this.db.run(
                            'UPDATE users SET last_login_date = ?, consecutive_login_days = ?, gam_balance = gam_balance + ? WHERE id = ?',
                            [today, consecutiveDays, rewardAmount, userId],
                            (err) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                // 거래 내역 기록
                                this.db.run(
                                    'INSERT INTO gam_transactions (user_id, type, category, amount, description) VALUES (?, ?, ?, ?, ?)',
                                    [userId, 'earn', 'login', rewardAmount, `로그인 보상 (${consecutiveDays}일 연속)`],
                                    (err) => {
                                        if (err) {
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        this.db.run('COMMIT');
                                        resolve({ 
                                            success: true, 
                                            amount: rewardAmount, 
                                            consecutiveDays: consecutiveDays 
                                        });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    // 첫 예측 보상
    async giveFirstPredictionReward(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT first_prediction_reward FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (user.first_prediction_reward) {
                        resolve({ success: false, message: '이미 첫 예측 보상을 받았습니다.' });
                        return;
                    }
                    
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');
                        
                        this.db.run(
                            'UPDATE users SET first_prediction_reward = 1, gam_balance = gam_balance + ? WHERE id = ?',
                            [100, userId],
                            (err) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                this.db.run(
                                    'INSERT INTO gam_transactions (user_id, type, category, amount, description) VALUES (?, ?, ?, ?, ?)',
                                    [userId, 'earn', 'first_prediction', 100, '첫 예측 보상'],
                                    (err) => {
                                        if (err) {
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        this.db.run('COMMIT');
                                        resolve({ success: true, amount: 100 });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    // 첫 댓글 보상
    async giveFirstCommentReward(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT first_comment_reward FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (user.first_comment_reward) {
                        resolve({ success: false, message: '이미 첫 댓글 보상을 받았습니다.' });
                        return;
                    }
                    
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');
                        
                        this.db.run(
                            'UPDATE users SET first_comment_reward = 1, gam_balance = gam_balance + ? WHERE id = ?',
                            [50, userId],
                            (err) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                this.db.run(
                                    'INSERT INTO gam_transactions (user_id, type, category, amount, description) VALUES (?, ?, ?, ?, ?)',
                                    [userId, 'earn', 'first_comment', 50, '첫 댓글 보상'],
                                    (err) => {
                                        if (err) {
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        this.db.run('COMMIT');
                                        resolve({ success: true, amount: 50 });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    // 감 소모 관련 메서드들
    async burnGam(userId, category, amount, description = null, referenceId = null) {
        return new Promise((resolve, reject) => {
            // 먼저 잔액 확인
            this.db.get(
                'SELECT gam_balance FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (user.gam_balance < amount) {
                        resolve({ success: false, message: '감이 부족합니다.' });
                        return;
                    }
                    
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');
                        
                        // 사용자 잔액 업데이트
                        this.db.run(
                            'UPDATE users SET gam_balance = gam_balance - ? WHERE id = ?',
                            [amount, userId],
                            (err) => {
                                if (err) {
                                    this.db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                // 거래 내역 기록
                                this.db.run(
                                    'INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
                                    [userId, 'burn', category, amount, description, referenceId],
                                    (err) => {
                                        if (err) {
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }
                                        
                                        this.db.run('COMMIT');
                                        resolve({ success: true });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    // 베팅 실패로 인한 감 소모
    async burnBettingLoss(userId, amount, issueId) {
        return this.burnGam(userId, 'betting_fail', amount, '베팅 실패', issueId);
    }

    // 베팅 성공 시 수수료 (총 획득액의 2%)
    async burnCommission(userId, totalWinAmount, issueId) {
        const commissionAmount = Math.floor(totalWinAmount * 0.02);
        return this.burnGam(userId, 'commission', commissionAmount, '베팅 성공 수수료 (2%)', issueId);
    }

    // 댓글 강조 비용
    async burnCommentHighlight(userId, commentId) {
        return this.burnGam(userId, 'comment_highlight', 200, '댓글 강조', commentId);
    }

    // 사용자 감 잔액 조회
    async getUserGamBalance(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT gam_balance FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(user ? user.gam_balance : 0);
                }
            );
        });
    }

    // 사용자 거래 내역 조회
    async getUserTransactions(userId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM gam_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit],
                (err, transactions) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(transactions);
                }
            );
        });
    }

    // 업적 확인 및 보상 지급
    async checkAndRewardAchievements(userId) {
        return new Promise((resolve, reject) => {
            // 사용자 통계 조회
            this.db.get(`
                SELECT 
                    u.total_predictions,
                    u.correct_predictions,
                    CASE 
                        WHEN u.total_predictions > 0 
                        THEN (u.correct_predictions * 100.0 / u.total_predictions) 
                        ELSE 0 
                    END as accuracy,
                    COALESCE(SUM(b.amount), 0) as total_volume
                FROM users u
                LEFT JOIN bets b ON u.id = b.user_id
                WHERE u.id = ?
                GROUP BY u.id
            `, [userId], (err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // 미달성 업적 조회
                this.db.all(`
                    SELECT a.* FROM achievements a
                    WHERE a.id NOT IN (
                        SELECT achievement_id FROM user_achievements WHERE user_id = ?
                    )
                `, [userId], (err, achievements) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const rewardedAchievements = [];
                    
                    achievements.forEach(achievement => {
                        let achieved = false;
                        
                        switch (achievement.type) {
                            case 'accuracy':
                                achieved = stats.accuracy >= achievement.condition_value;
                                break;
                            case 'volume':
                                achieved = stats.total_volume >= achievement.condition_value;
                                break;
                            // win_streak는 별도 로직 필요
                        }
                        
                        if (achieved) {
                            rewardedAchievements.push(achievement);
                        }
                    });
                    
                    if (rewardedAchievements.length === 0) {
                        resolve([]);
                        return;
                    }
                    
                    // 업적 보상 지급
                    this.db.serialize(() => {
                        this.db.run('BEGIN TRANSACTION');
                        
                        let completed = 0;
                        const total = rewardedAchievements.length;
                        
                        rewardedAchievements.forEach(achievement => {
                            // 업적 달성 기록
                            this.db.run(
                                'INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
                                [userId, achievement.id],
                                (err) => {
                                    if (err) {
                                        this.db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }
                                    
                                    // 감 보상 지급
                                    this.earnGam(userId, 'achievement', achievement.reward_gam, 
                                        `업적 달성: ${achievement.name}`, achievement.id)
                                        .then(() => {
                                            completed++;
                                            if (completed === total) {
                                                this.db.run('COMMIT');
                                                resolve(rewardedAchievements);
                                            }
                                        })
                                        .catch((err) => {
                                            this.db.run('ROLLBACK');
                                            reject(err);
                                        });
                                }
                            );
                        });
                    });
                });
            });
        });
    }
}

module.exports = new GamService();