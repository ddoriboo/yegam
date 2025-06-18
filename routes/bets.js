const express = require('express');
const { query, run, get, isPostgreSQL } = require('../database/database');
const { getClient } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 베팅하기
router.post('/', authMiddleware, async (req, res) => {
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
    
    let client;
    
    try {
        if (isPostgreSQL()) {
            client = await getClient();
            await client.query('BEGIN');
        }
        
        // 사용자 감 잔액 확인
        const user = await get('SELECT gam_balance FROM users WHERE id = $1', [userId]);
        
        if (!user) {
            if (client) await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: '사용자를 찾을 수 없습니다.' 
            });
        }
        
        const gamBalance = user.gam_balance || user.coins || 0;
        if (gamBalance < amount) {
            if (client) await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: '보유 감이 부족합니다.' 
            });
        }
        
        // 이슈 존재 확인
        const issue = await get('SELECT * FROM issues WHERE id = $1 AND status = $2', [issueId, 'active']);
        
        if (!issue) {
            if (client) await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        // 이미 베팅했는지 확인
        const existingBet = await get('SELECT id FROM bets WHERE user_id = $1 AND issue_id = $2', [userId, issueId]);
        
        if (existingBet) {
            if (client) await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                message: '이미 베팅한 이슈입니다.' 
            });
        }
        
        // 베팅 기록 생성
        const betResult = await run('INSERT INTO bets (user_id, issue_id, choice, amount) VALUES ($1, $2, $3, $4)', 
            [userId, issueId, choice, amount]);
        
        const betId = betResult.lastID || betResult.rows[0]?.id;
        
        // 사용자 감 잔액 차감
        await run('UPDATE users SET gam_balance = gam_balance - $1 WHERE id = $2', [amount, userId]);
        
        // 이슈 볼륨 및 가격 업데이트
        const newYesVolume = choice === 'Yes' ? issue.yes_volume + amount : issue.yes_volume;
        const newNoVolume = choice === 'No' ? issue.no_volume + amount : issue.no_volume;
        const newTotalVolume = newYesVolume + newNoVolume;
        const newYesPrice = newTotalVolume > 0 ? Math.round((newYesVolume / newTotalVolume) * 100) : 50;
        
        await run('UPDATE issues SET yes_volume = $1, no_volume = $2, total_volume = $3, yes_price = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5', 
            [newYesVolume, newNoVolume, newTotalVolume, newYesPrice, issueId]);
        
        // 감 거래 내역 기록
        await run('INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, 'SPEND', 'BET', -amount, `${issue.title} - ${choice} 베팅`, betId]);
        
        if (client) {
            await client.query('COMMIT');
            client.release();
        }
        
        res.json({
            success: true,
            message: '베팅이 성공적으로 완료되었습니다.',
            bet: {
                id: betId,
                userId,
                issueId,
                choice,
                amount
            },
            updatedUser: {
                gam_balance: gamBalance - amount
            },
            updatedIssue: {
                yesPrice: newYesPrice,
                totalVolume: newTotalVolume
            }
        });
        
    } catch (error) {
        console.error('베팅 오류:', error);
        if (client) {
            await client.query('ROLLBACK');
            client.release();
        }
        res.status(500).json({ 
            success: false, 
            message: '베팅 처리 중 오류가 발생했습니다.' 
        });
    }
});

// 사용자 베팅 내역 조회
router.get('/my-bets', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const sql = `
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
            WHERE b.user_id = $1
            ORDER BY b.created_at DESC
        `;
        
        const result = await query(sql, [userId]);
        const bets = result.rows;
        
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
    } catch (error) {
        console.error('베팅 내역 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '베팅 내역을 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 특정 이슈의 베팅 통계 조회
router.get('/issue/:issueId/stats', async (req, res) => {
    try {
        const issueId = req.params.issueId;
        
        const sql = `
            SELECT 
                choice,
                COUNT(*) as bet_count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount
            FROM bets 
            WHERE issue_id = $1
            GROUP BY choice
        `;
        
        const result = await query(sql, [issueId]);
        const stats = result.rows;
        
        res.json({
            success: true,
            stats: stats.reduce((acc, stat) => {
                acc[stat.choice.toLowerCase()] = {
                    betCount: parseInt(stat.bet_count),
                    totalAmount: parseInt(stat.total_amount),
                    avgAmount: Math.round(parseFloat(stat.avg_amount))
                };
                return acc;
            }, {})
        });
    } catch (error) {
        console.error('베팅 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '베팅 통계를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

module.exports = router;