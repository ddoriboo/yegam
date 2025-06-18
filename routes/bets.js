const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');

// 베팅하기 (베팅 규칙 적용)
router.post('/', async (req, res) => {
    const { userId, issueId, choice, amount } = req.body;
    
    if (!userId || !issueId || !choice || !amount) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    // 베팅 규칙 확인
    if (amount < 100) {
        return res.status(400).json({ error: '최소 베팅 금액은 100감입니다.' });
    }
    
    try {
        // 감 잔액 확인
        const userBalance = await gamService.getUserGamBalance(userId);
        if (userBalance < amount) {
            return res.status(400).json({ error: '감이 부족합니다.' });
        }
        
        // 최대 베팅 제한 (보유 감의 50% 또는 100만 감 중 작은 값)
        const maxBet = Math.min(Math.floor(userBalance * 0.5), 1000000);
        if (amount > maxBet) {
            return res.status(400).json({ 
                error: `최대 베팅 금액은 ${maxBet.toLocaleString()}감입니다. (보유 감의 50% 또는 100만감 중 작은 값)` 
            });
        }
        
        const db = getDB();
        
        // 이슈 상태 확인
        db.get('SELECT * FROM issues WHERE id = ? AND status = "active"', [issueId], async (err, issue) => {
            if (err) {
                console.error('이슈 확인 실패:', err);
                return res.status(500).json({ error: '이슈 확인에 실패했습니다.' });
            }
            
            if (!issue) {
                return res.status(400).json({ error: '존재하지 않거나 종료된 이슈입니다.' });
            }
            
            // 마감 시간 확인
            const endDate = new Date(issue.end_date);
            const now = new Date();
            if (now >= endDate) {
                return res.status(400).json({ error: '마감된 이슈입니다.' });
            }
            
            // 기존 베팅 확인
            db.get('SELECT * FROM bets WHERE user_id = ? AND issue_id = ?', [userId, issueId], async (err, existingBet) => {
            if (err) {
                console.error('베팅 확인 실패:', err);
                return res.status(500).json({ error: '베팅 확인에 실패했습니다.' });
            }
            
            try {
                if (existingBet) {
                    // 기존 베팅이 있는 경우, 차액만 처리
                    const difference = amount - existingBet.amount;
                    if (difference > 0) {
                        // 추가 베팅
                        const burnResult = await gamService.burnGam(userId, 'betting', difference, '베팅 추가', issueId);
                        if (!burnResult.success) {
                            return res.status(400).json({ error: burnResult.message });
                        }
                    } else if (difference < 0) {
                        // 베팅 감소 - 차액 환불
                        await gamService.earnGam(userId, 'betting_refund', Math.abs(difference), '베팅 감소 환불', issueId);
                    }
                } else {
                    // 새로운 베팅 - 전액 차감
                    const burnResult = await gamService.burnGam(userId, 'betting', amount, '베팅', issueId);
                    if (!burnResult.success) {
                        return res.status(400).json({ error: burnResult.message });
                    }
                    
                    // 첫 예측 보상 확인
                    const firstPredictionResult = await gamService.giveFirstPredictionReward(userId);
                    if (firstPredictionResult.success) {
                        console.log(`사용자 ${userId}에게 첫 예측 보상 지급`);
                    }
                }
                
                // 베팅 삽입 또는 업데이트
                const query = `INSERT OR REPLACE INTO bets (user_id, issue_id, choice, amount) 
                               VALUES (?, ?, ?, ?)`;
                
                db.run(query, [userId, issueId, choice, amount], function(err) {
                    if (err) {
                        console.error('베팅 저장 실패:', err);
                        return res.status(500).json({ error: '베팅 저장에 실패했습니다.' });
                    }
                    
                    // 이슈 베팅 볼륨 업데이트
                    const volumeUpdateQuery = existingBet 
                        ? `UPDATE issues SET 
                           ${choice}_volume = ${choice}_volume + ?,
                           total_volume = total_volume + ?,
                           ${existingBet.choice}_volume = ${existingBet.choice}_volume - ?
                           WHERE id = ?`
                        : `UPDATE issues SET 
                           ${choice}_volume = ${choice}_volume + ?,
                           total_volume = total_volume + ?
                           WHERE id = ?`;
                    
                    const volumeParams = existingBet 
                        ? [amount, amount - existingBet.amount, existingBet.amount, issueId]
                        : [amount, amount, issueId];
                    
                    db.run(volumeUpdateQuery, volumeParams, (err) => {
                        if (err) {
                            console.error('이슈 볼륨 업데이트 실패:', err);
                        }
                    });
                    
                    // 사용자 예측 횟수 업데이트 (새 베팅인 경우만)
                    if (!existingBet) {
                        db.run('UPDATE users SET total_predictions = total_predictions + 1 WHERE id = ?', [userId], (err) => {
                            if (err) {
                                console.error('사용자 통계 업데이트 실패:', err);
                            }
                        });
                    }
                    
                    res.json({ 
                        success: true, 
                        message: '베팅이 완료되었습니다.',
                        betId: this.lastID,
                        currentBalance: userBalance - (existingBet ? amount - existingBet.amount : amount)
                    });
                });
                
            } catch (error) {
                console.error('베팅 처리 중 오류:', error);
                res.status(500).json({ error: '베팅 처리에 실패했습니다.' });
            }
            });
        });
        
    } catch (error) {
        console.error('베팅 처리 중 오류:', error);
        res.status(500).json({ error: '베팅 처리에 실패했습니다.' });
    }
});

// 사용자의 베팅 내역 조회
router.get('/user/:userId', (req, res) => {
    const { userId } = req.params;
    const db = getDB();
    
    const query = `
        SELECT b.*, i.title, i.category, i.end_date, i.status
        FROM bets b
        JOIN issues i ON b.issue_id = i.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
    `;
    
    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.error('베팅 내역 조회 실패:', err);
            return res.status(500).json({ error: '베팅 내역 조회에 실패했습니다.' });
        }
        
        res.json(rows);
    });
});

// 특정 이슈의 베팅 통계
router.get('/stats/:issueId', (req, res) => {
    const { issueId } = req.params;
    const db = getDB();
    
    const query = `
        SELECT 
            choice,
            COUNT(*) as bet_count,
            SUM(amount) as total_amount
        FROM bets 
        WHERE issue_id = ?
        GROUP BY choice
    `;
    
    db.all(query, [issueId], (err, rows) => {
        if (err) {
            console.error('베팅 통계 조회 실패:', err);
            return res.status(500).json({ error: '베팅 통계 조회에 실패했습니다.' });
        }
        
        res.json(rows);
    });
});

module.exports = router;