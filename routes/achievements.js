const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');

// 모든 업적 조회
router.get('/', (req, res) => {
    const db = getDB();
    
    db.all('SELECT * FROM achievements ORDER BY reward_gam DESC', (err, achievements) => {
        if (err) {
            console.error('업적 조회 실패:', err);
            return res.status(500).json({ error: '업적 조회에 실패했습니다.' });
        }
        
        res.json(achievements);
    });
});

// 사용자별 업적 달성 현황 조회
router.get('/user/:userId', (req, res) => {
    const { userId } = req.params;
    const db = getDB();
    
    const query = `
        SELECT 
            a.*,
            ua.achieved_at,
            CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as is_achieved
        FROM achievements a
        LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
        ORDER BY is_achieved DESC, a.reward_gam DESC
    `;
    
    db.all(query, [userId], (err, achievements) => {
        if (err) {
            console.error('사용자 업적 조회 실패:', err);
            return res.status(500).json({ error: '사용자 업적 조회에 실패했습니다.' });
        }
        
        res.json(achievements);
    });
});

// 사용자 업적 진행 상황 조회
router.get('/progress/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const db = getDB();
        
        // 사용자 통계 조회
        db.get(`
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
                console.error('사용자 통계 조회 실패:', err);
                return res.status(500).json({ error: '사용자 통계 조회에 실패했습니다.' });
            }
            
            // 연승 기록 조회 (최근 베팅들의 결과를 확인)
            db.all(`
                SELECT b.*, i.correct_answer, i.status
                FROM bets b
                JOIN issues i ON b.issue_id = i.id
                WHERE b.user_id = ? AND i.status = 'settled'
                ORDER BY b.created_at DESC
                LIMIT 10
            `, [userId], (err, recentBets) => {
                if (err) {
                    console.error('최근 베팅 조회 실패:', err);
                    return res.status(500).json({ error: '최근 베팅 조회에 실패했습니다.' });
                }
                
                // 연승 계산
                let currentStreak = 0;
                for (const bet of recentBets) {
                    if (bet.choice === bet.correct_answer) {
                        currentStreak++;
                    } else {
                        break;
                    }
                }
                
                // 업적별 진행률 계산
                db.all('SELECT * FROM achievements', (err, achievements) => {
                    if (err) {
                        console.error('업적 조회 실패:', err);
                        return res.status(500).json({ error: '업적 조회에 실패했습니다.' });
                    }
                    
                    const progress = achievements.map(achievement => {
                        let currentValue = 0;
                        let progressPercent = 0;
                        
                        switch (achievement.type) {
                            case 'win_streak':
                                currentValue = currentStreak;
                                progressPercent = Math.min((currentValue / achievement.condition_value) * 100, 100);
                                break;
                            case 'accuracy':
                                currentValue = Math.round(stats.accuracy);
                                progressPercent = Math.min((currentValue / achievement.condition_value) * 100, 100);
                                break;
                            case 'volume':
                                currentValue = stats.total_volume;
                                progressPercent = Math.min((currentValue / achievement.condition_value) * 100, 100);
                                break;
                        }
                        
                        return {
                            ...achievement,
                            currentValue,
                            progressPercent: Math.round(progressPercent),
                            isCompleted: progressPercent >= 100
                        };
                    });
                    
                    res.json({
                        userStats: {
                            totalPredictions: stats.total_predictions,
                            correctPredictions: stats.correct_predictions,
                            accuracy: Math.round(stats.accuracy),
                            totalVolume: stats.total_volume,
                            currentStreak
                        },
                        achievements: progress
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('업적 진행 상황 조회 실패:', error);
        res.status(500).json({ error: '업적 진행 상황 조회에 실패했습니다.' });
    }
});

// 새 업적 추가 (관리자용)
router.post('/', (req, res) => {
    const { name, description, type, condition_value, reward_gam } = req.body;
    
    if (!name || !description || !type || !condition_value || !reward_gam) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    const db = getDB();
    
    const query = `INSERT INTO achievements (name, description, type, condition_value, reward_gam)
                   VALUES (?, ?, ?, ?, ?)`;
    
    db.run(query, [name, description, type, condition_value, reward_gam], function(err) {
        if (err) {
            console.error('업적 추가 실패:', err);
            return res.status(500).json({ error: '업적 추가에 실패했습니다.' });
        }
        
        res.json({ 
            success: true, 
            message: '새 업적이 추가되었습니다.',
            achievementId: this.lastID 
        });
    });
});

// 업적 수정 (관리자용)
router.put('/:achievementId', (req, res) => {
    const { achievementId } = req.params;
    const { name, description, type, condition_value, reward_gam } = req.body;
    
    if (!name || !description || !type || !condition_value || !reward_gam) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    const db = getDB();
    
    const query = `UPDATE achievements 
                   SET name = ?, description = ?, type = ?, condition_value = ?, reward_gam = ?
                   WHERE id = ?`;
    
    db.run(query, [name, description, type, condition_value, reward_gam, achievementId], function(err) {
        if (err) {
            console.error('업적 수정 실패:', err);
            return res.status(500).json({ error: '업적 수정에 실패했습니다.' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '업적을 찾을 수 없습니다.' });
        }
        
        res.json({ 
            success: true, 
            message: '업적이 수정되었습니다.' 
        });
    });
});

// 업적 삭제 (관리자용)
router.delete('/:achievementId', (req, res) => {
    const { achievementId } = req.params;
    const db = getDB();
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 먼저 사용자 업적 기록 삭제
        db.run('DELETE FROM user_achievements WHERE achievement_id = ?', [achievementId], (err) => {
            if (err) {
                db.run('ROLLBACK');
                console.error('사용자 업적 기록 삭제 실패:', err);
                return res.status(500).json({ error: '사용자 업적 기록 삭제에 실패했습니다.' });
            }
            
            // 업적 삭제
            db.run('DELETE FROM achievements WHERE id = ?', [achievementId], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    console.error('업적 삭제 실패:', err);
                    return res.status(500).json({ error: '업적 삭제에 실패했습니다.' });
                }
                
                if (this.changes === 0) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: '업적을 찾을 수 없습니다.' });
                }
                
                db.run('COMMIT');
                res.json({ 
                    success: true, 
                    message: '업적이 삭제되었습니다.' 
                });
            });
        });
    });
});

// 특정 사용자의 업적 달성 강제 지급 (관리자용 - 테스트/보상 목적)
router.post('/grant/:userId/:achievementId', async (req, res) => {
    const { userId, achievementId } = req.params;
    
    try {
        const db = getDB();
        
        // 업적 정보 조회
        db.get('SELECT * FROM achievements WHERE id = ?', [achievementId], async (err, achievement) => {
            if (err) {
                console.error('업적 조회 실패:', err);
                return res.status(500).json({ error: '업적 조회에 실패했습니다.' });
            }
            
            if (!achievement) {
                return res.status(404).json({ error: '업적을 찾을 수 없습니다.' });
            }
            
            // 이미 달성했는지 확인
            db.get('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?', 
                   [userId, achievementId], async (err, existing) => {
                if (err) {
                    console.error('기존 업적 확인 실패:', err);
                    return res.status(500).json({ error: '기존 업적 확인에 실패했습니다.' });
                }
                
                if (existing) {
                    return res.status(400).json({ error: '이미 달성한 업적입니다.' });
                }
                
                try {
                    // 업적 달성 기록
                    db.run('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
                           [userId, achievementId], async (err) => {
                        if (err) {
                            console.error('업적 달성 기록 실패:', err);
                            return res.status(500).json({ error: '업적 달성 기록에 실패했습니다.' });
                        }
                        
                        // 감 보상 지급
                        await gamService.earnGam(userId, 'achievement', achievement.reward_gam, 
                            `업적 달성: ${achievement.name}`, achievement.id);
                        
                        res.json({
                            success: true,
                            message: `업적 "${achievement.name}"이 달성되었습니다!`,
                            reward: achievement.reward_gam
                        });
                    });
                    
                } catch (error) {
                    console.error('업적 지급 처리 실패:', error);
                    res.status(500).json({ error: '업적 지급 처리에 실패했습니다.' });
                }
            });
        });
        
    } catch (error) {
        console.error('업적 강제 지급 실패:', error);
        res.status(500).json({ error: '업적 강제 지급에 실패했습니다.' });
    }
});

module.exports = router;