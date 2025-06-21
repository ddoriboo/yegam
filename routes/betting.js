const express = require('express');
const router = express.Router();
const { getDB } = require('../database/database');
const gamService = require('../services/gamService');

// 베팅 가능 여부 및 예상 수익 계산
router.post('/calculate', async (req, res) => {
    const { userId, issueId, choice, amount } = req.body;
    
    if (!userId || !issueId || !choice || !amount) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    if (amount < 100) {
        return res.status(400).json({ 
            error: '최소 베팅 금액은 100 GAM입니다.',
            minBet: 100
        });
    }
    
    try {
        const db = getDB();
        
        // 사용자 잔액 조회
        const userBalance = await gamService.getUserGamBalance(userId);
        
        // 최대 베팅 제한 계산
        const maxBet = Math.min(Math.floor(userBalance * 0.5), 1000000);
        
        if (amount > maxBet) {
            return res.status(400).json({ 
                error: `최대 베팅 금액은 ${maxBet.toLocaleString()} GAM입니다.`,
                maxBet: maxBet
            });
        }
        
        if (userBalance < amount) {
            return res.status(400).json({ 
                error: 'GAM이 부족합니다.',
                currentBalance: userBalance,
                required: amount
            });
        }
        
        // 이슈 정보 및 현재 베팅 상황 조회
        db.get(`
            SELECT *, 
                   COALESCE(yes_volume, 0) as yes_volume,
                   COALESCE(no_volume, 0) as no_volume,
                   COALESCE(total_volume, 0) as total_volume
            FROM issues 
            WHERE id = ? AND status = 'active'
        `, [issueId], (err, issue) => {
            if (err || !issue) {
                return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
            }
            
            // 마감 시간 확인
            const endDate = new Date(issue.end_date);
            const now = new Date();
            if (now >= endDate) {
                return res.status(400).json({ error: '마감된 이슈입니다.' });
            }
            
            // 사용자의 기존 베팅 확인
            db.get('SELECT * FROM bets WHERE user_id = ? AND issue_id = ?', [userId, issueId], (err, existingBet) => {
                if (err) {
                    return res.status(500).json({ error: '베팅 정보 조회에 실패했습니다.' });
                }
                
                // 예상 수익 계산
                let simulatedYesVolume = issue.yes_volume;
                let simulatedNoVolume = issue.no_volume;
                let simulatedTotalVolume = issue.total_volume;
                
                // 기존 베팅이 있으면 먼저 제거
                if (existingBet) {
                    if (existingBet.choice === 'yes') {
                        simulatedYesVolume -= existingBet.amount;
                    } else {
                        simulatedNoVolume -= existingBet.amount;
                    }
                    simulatedTotalVolume -= existingBet.amount;
                }
                
                // 새 베팅 추가
                if (choice === 'yes') {
                    simulatedYesVolume += amount;
                } else {
                    simulatedNoVolume += amount;
                }
                simulatedTotalVolume += amount;
                
                // 승리 시 예상 수익 계산
                let expectedReturn = amount; // 기본적으로 원금 반환
                let profit = 0;
                let commission = 0;
                
                if (simulatedTotalVolume > 0) {
                    const winnerPool = choice === 'yes' ? simulatedYesVolume : simulatedNoVolume;
                    const loserPool = choice === 'yes' ? simulatedNoVolume : simulatedYesVolume;
                    
                    if (winnerPool > 0 && loserPool > 0) {
                        // 정상적인 양방향 베팅 상황
                        const userWinRatio = amount / winnerPool;
                        profit = Math.floor(loserPool * userWinRatio);
                        const totalWinAmount = amount + profit;
                        commission = Math.floor(totalWinAmount * 0.02); // 2% 수수료
                        expectedReturn = totalWinAmount - commission;
                    } else if (winnerPool > 0 && loserPool === 0) {
                        // 한쪽에만 베팅이 있는 극단적 상황 (배당률 1.01배로 제한)
                        const totalWinAmount = Math.floor(amount * 1.01);
                        commission = Math.floor(totalWinAmount * 0.02);
                        expectedReturn = totalWinAmount - commission;
                        profit = expectedReturn - amount;
                    } else if (winnerPool === 0) {
                        // 새로운 베팅 방향 (반대편에만 베팅이 있었던 경우 - 높은 배당률)
                        const maxMultiplier = Math.min(10.0, (simulatedTotalVolume * 0.98) / amount);
                        const totalWinAmount = Math.floor(amount * maxMultiplier);
                        commission = Math.floor(totalWinAmount * 0.02);
                        expectedReturn = totalWinAmount - commission;
                        profit = expectedReturn - amount;
                    }
                } else {
                    // 첫 베팅인 경우 (2배 배당)
                    expectedReturn = Math.floor(amount * 2.0 * 0.98);
                    profit = expectedReturn - amount;
                }
                
                // 현재 확률 계산
                const currentYesPercentage = simulatedTotalVolume > 0 
                    ? Math.round((simulatedYesVolume / simulatedTotalVolume) * 100)
                    : 50;
                
                res.json({
                    success: true,
                    calculation: {
                        betAmount: amount,
                        choice: choice,
                        expectedReturn: expectedReturn,
                        profit: profit,
                        commission: commission,
                        roi: amount > 0 ? Math.round(((expectedReturn - amount) / amount) * 100) : 0
                    },
                    market: {
                        yesVolume: simulatedYesVolume,
                        noVolume: simulatedNoVolume,
                        totalVolume: simulatedTotalVolume,
                        yesPercentage: currentYesPercentage,
                        noPercentage: 100 - currentYesPercentage
                    },
                    limits: {
                        minBet: 100,
                        maxBet: maxBet,
                        currentBalance: userBalance
                    },
                    existingBet: existingBet ? {
                        amount: existingBet.amount,
                        choice: existingBet.choice
                    } : null
                });
            });
        });
        
    } catch (error) {
        console.error('베팅 계산 실패:', error);
        res.status(500).json({ error: '베팅 계산에 실패했습니다.' });
    }
});

// 실시간 이슈 확률 업데이트
router.get('/odds/:issueId', (req, res) => {
    const { issueId } = req.params;
    const db = getDB();
    
    db.get(`
        SELECT 
            COALESCE(yes_volume, 0) as yes_volume,
            COALESCE(no_volume, 0) as no_volume,
            COALESCE(total_volume, 0) as total_volume,
            end_date,
            status
        FROM issues 
        WHERE id = ?
    `, [issueId], (err, issue) => {
        if (err || !issue) {
            return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
        }
        
        const totalVolume = issue.total_volume || 0;
        const yesVolume = issue.yes_volume || 0;
        const noVolume = issue.no_volume || 0;
        
        let yesPercentage = 50; // 기본값
        if (totalVolume > 0) {
            yesPercentage = Math.round((yesVolume / totalVolume) * 100);
        }
        
        // 마감까지 남은 시간
        const endDate = new Date(issue.end_date);
        const now = new Date();
        const timeLeft = endDate - now;
        
        res.json({
            success: true,
            odds: {
                yesPercentage: yesPercentage,
                noPercentage: 100 - yesPercentage,
                yesVolume: yesVolume,
                noVolume: noVolume,
                totalVolume: totalVolume,
                timeLeft: Math.max(0, timeLeft),
                isActive: issue.status === 'active' && timeLeft > 0
            }
        });
    });
});

// 베팅 제한 정보 조회
router.get('/limits/:userId', async (req, res) => {
    const { userId } = req.params;
    
    try {
        const userBalance = await gamService.getUserGamBalance(userId);
        const maxBet = Math.min(Math.floor(userBalance * 0.5), 1000000);
        
        res.json({
            success: true,
            limits: {
                minBet: 100,
                maxBet: maxBet,
                currentBalance: userBalance,
                maxBetReason: maxBet === 1000000 ? '절대 한도 (100만 GAM)' : '보유 GAM의 50%'
            }
        });
        
    } catch (error) {
        console.error('베팅 제한 조회 실패:', error);
        res.status(500).json({ error: '베팅 제한 조회에 실패했습니다.' });
    }
});

module.exports = router;