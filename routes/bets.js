const express = require('express');
const { query, run, get, isPostgreSQL } = require('../database/database');
const { getClient } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');
const { validateBetRequest } = require('../middleware/validation');

const router = express.Router();

// 베팅하기
router.post('/', authMiddleware, validateBetRequest, async (req, res) => {
    const { issueId, choice, amount } = req.validatedData;
    const userId = req.user.id;
    
    let client;
    
    try {
        client = await getClient();
        await client.query('BEGIN');
        
        // 사용자 GAM 잔액 확인
        const userResult = await client.query('SELECT gam_balance FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];
        
        if (!user) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ 
                success: false, 
                message: '사용자를 찾을 수 없습니다.' 
            });
        }
        
        const gamBalance = user.gam_balance ?? 0;
        if (gamBalance < amount) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ 
                success: false, 
                message: '보유 GAM이 부족합니다.' 
            });
        }
        
        // 이슈 존재 확인
        const issueResult = await client.query('SELECT * FROM issues WHERE id = $1 AND status = $2', [issueId, 'active']);
        const issue = issueResult.rows[0];
        
        if (!issue) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        // 이미 베팅했는지 확인
        const betResult = await client.query('SELECT id FROM bets WHERE user_id = $1 AND issue_id = $2', [userId, issueId]);
        const existingBet = betResult.rows[0];
        
        if (existingBet) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ 
                success: false, 
                message: '이미 베팅한 이슈입니다.' 
            });
        }
        
        // 베팅 기록 생성
        const insertBetResult = await client.query(
            'INSERT INTO bets (user_id, issue_id, choice, amount) VALUES ($1, $2, $3, $4) RETURNING id', 
            [userId, issueId, choice, amount]
        );
        
        const betId = insertBetResult.rows[0].id;
        
        // 사용자 GAM 잔액 차감
        await client.query('UPDATE users SET gam_balance = gam_balance - $1 WHERE id = $2', [amount, userId]);
        
        // 이슈 볼륨 및 가격 업데이트
        const newYesVolume = choice === 'Yes' ? (issue.yes_volume || 0) + amount : (issue.yes_volume || 0);
        const newNoVolume = choice === 'No' ? (issue.no_volume || 0) + amount : (issue.no_volume || 0);
        const newTotalVolume = newYesVolume + newNoVolume;
        const newYesPrice = newTotalVolume > 0 ? Math.round((newYesVolume / newTotalVolume) * 100) : 50;
        
        await client.query(
            'UPDATE issues SET yes_volume = $1, no_volume = $2, total_volume = $3, yes_price = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5', 
            [newYesVolume, newNoVolume, newTotalVolume, newYesPrice, issueId]
        );
        
        // 트랜잭션 커밋
        await client.query('COMMIT');
        client.release();
        
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
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('롤백 오류:', rollbackError);
            }
            client.release();
        }
        res.status(500).json({ 
            success: false, 
            message: '베팅 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 사용자 베팅 내역 조회 (마이페이지용)
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
                i.result,
                i.status,
                i.end_date,
                r.reward_amount
            FROM bets b
            JOIN issues i ON b.issue_id = i.id
            LEFT JOIN rewards r ON r.bet_id = b.id AND r.user_id = b.user_id
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
                created_at: bet.created_at,
                issue_id: bet.issue_id,
                issue_title: bet.issue_title,
                category: bet.category,
                end_date: bet.end_date,
                result: bet.result,
                reward: bet.reward_amount || null,
                // 마이페이지에서 사용하는 형태로 추가 정보 제공
                status: !bet.result ? '진행중' : 
                       (bet.choice === bet.result ? '성공' : '실패')
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