const express = require('express');
const { getDB } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 베팅하기
router.post('/', authMiddleware, (req, res) => {
    const { issueId, choice, amount } = req.body;
    const userId = req.user.id;
    
    if (!issueId || !choice || !amount) {
        return res.status(400).json({ 
            success: false, 
            message: '모든 필드를 입력해주세요.' 
        });
    }
    
    if (amount <= 0) {
        return res.status(400).json({ 
            success: false, 
            message: '베팅 금액은 0보다 커야 합니다.' 
        });
    }
    
    if (!['Yes', 'No'].includes(choice)) {
        return res.status(400).json({ 
            success: false, 
            message: '올바른 선택이 아닙니다.' 
        });
    }
    
    const db = getDB();
    
    // 트랜잭션 시작
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 사용자 코인 확인
        db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ 
                    success: false, 
                    message: '사용자 정보를 확인하는 중 오류가 발생했습니다.' 
                });
            }
            
            if (!user) {
                db.run('ROLLBACK');
                return res.status(404).json({ 
                    success: false, 
                    message: '사용자를 찾을 수 없습니다.' 
                });
            }
            
            if (user.coins < amount) {
                db.run('ROLLBACK');
                return res.status(400).json({ 
                    success: false, 
                    message: '보유 코인이 부족합니다.' 
                });
            }
            
            // 이슈 존재 확인
            db.get('SELECT * FROM issues WHERE id = ? AND status = "active"', [issueId], (err, issue) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ 
                        success: false, 
                        message: '이슈 정보를 확인하는 중 오류가 발생했습니다.' 
                    });
                }
                
                if (!issue) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ 
                        success: false, 
                        message: '존재하지 않는 이슈입니다.' 
                    });
                }
                
                // 이미 베팅했는지 확인
                db.get('SELECT id FROM bets WHERE user_id = ? AND issue_id = ?', [userId, issueId], (err, existingBet) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ 
                            success: false, 
                            message: '베팅 내역을 확인하는 중 오류가 발생했습니다.' 
                        });
                    }
                    
                    if (existingBet) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ 
                            success: false, 
                            message: '이미 베팅한 이슈입니다.' 
                        });
                    }
                    
                    // 베팅 기록 생성
                    db.run('INSERT INTO bets (user_id, issue_id, choice, amount) VALUES (?, ?, ?, ?)', 
                        [userId, issueId, choice, amount], 
                        function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ 
                                    success: false, 
                                    message: '베팅 기록 생성 중 오류가 발생했습니다.' 
                                });
                            }
                            
                            // 사용자 코인 차감
                            db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [amount, userId], (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ 
                                        success: false, 
                                        message: '코인 차감 중 오류가 발생했습니다.' 
                                    });
                                }
                                
                                // 이슈 볼륨 및 가격 업데이트
                                const newYesVolume = choice === 'Yes' ? issue.yes_volume + amount : issue.yes_volume;
                                const newNoVolume = choice === 'No' ? issue.no_volume + amount : issue.no_volume;
                                const newTotalVolume = newYesVolume + newNoVolume;
                                const newYesPrice = newTotalVolume > 0 ? Math.round((newYesVolume / newTotalVolume) * 100) : 50;
                                
                                db.run('UPDATE issues SET yes_volume = ?, no_volume = ?, total_volume = ?, yes_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                                    [newYesVolume, newNoVolume, newTotalVolume, newYesPrice, issueId], 
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ 
                                                success: false, 
                                                message: '이슈 정보 업데이트 중 오류가 발생했습니다.' 
                                            });
                                        }
                                        
                                        // 트랜잭션 커밋
                                        db.run('COMMIT', (err) => {
                                            if (err) {
                                                return res.status(500).json({ 
                                                    success: false, 
                                                    message: '베팅 처리 중 오류가 발생했습니다.' 
                                                });
                                            }
                                            
                                            res.json({
                                                success: true,
                                                message: '베팅이 성공적으로 완료되었습니다.',
                                                bet: {
                                                    id: this.lastID,
                                                    userId,
                                                    issueId,
                                                    choice,
                                                    amount
                                                },
                                                updatedUser: {
                                                    coins: user.coins - amount
                                                },
                                                updatedIssue: {
                                                    yesPrice: newYesPrice,
                                                    totalVolume: newTotalVolume
                                                }
                                            });
                                        });
                                    }
                                );
                            });
                        }
                    );
                });
            });
        });
    });
});

// 사용자 베팅 내역 조회
router.get('/my-bets', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const db = getDB();
    
    const query = `
        SELECT 
            b.id,
            b.choice,
            b.amount,
            b.created_at,
            i.id as issue_id,
            i.title as issue_title,
            i.category,
            i.correct_answer
        FROM bets b
        JOIN issues i ON b.issue_id = i.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
    `;
    
    db.all(query, [userId], (err, bets) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '베팅 내역을 불러오는 중 오류가 발생했습니다.' 
            });
        }
        
        res.json({
            success: true,
            bets: bets.map(bet => ({
                id: bet.id,
                choice: bet.choice,
                amount: bet.amount,
                createdAt: bet.created_at,
                issue: {
                    id: bet.issue_id,
                    title: bet.issue_title,
                    category: bet.category
                },
                result: bet.correct_answer ? 
                    (bet.choice === bet.correct_answer ? 'win' : 'lose') : 
                    'pending'
            }))
        });
    });
});

// 특정 이슈의 베팅 통계 조회
router.get('/issue/:issueId/stats', (req, res) => {
    const issueId = req.params.issueId;
    const db = getDB();
    
    const query = `
        SELECT 
            choice,
            COUNT(*) as bet_count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount
        FROM bets 
        WHERE issue_id = ?
        GROUP BY choice
    `;
    
    db.all(query, [issueId], (err, stats) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '베팅 통계를 불러오는 중 오류가 발생했습니다.' 
            });
        }
        
        res.json({
            success: true,
            stats: stats.reduce((acc, stat) => {
                acc[stat.choice.toLowerCase()] = {
                    betCount: stat.bet_count,
                    totalAmount: stat.total_amount,
                    avgAmount: Math.round(stat.avg_amount)
                };
                return acc;
            }, {})
        });
    });
});

module.exports = router;