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
    const { placeBet, BetPlacementError } = require('../services/placeBet');
    try {
        const placed = await placeBet({ issueId, userId, choice, amount });
        const { bet, previousBalance, balance, yesPrice, totalVolume } = placed;
        console.log('베팅 성공 - 사용자 ' + userId + ', 이전 잔액: ' + previousBalance + ', 베팅 금액: ' + amount + ', 현재 잔액: ' + balance);
        res.json({
            success: true,
            message: '베팅이 성공적으로 완료되었습니다.',
            bet: { id: bet.id, userId, issueId, choice: bet.choice, amount: bet.amount },
            updatedUser: { gam_balance: balance },
            updatedIssue: { yesPrice, totalVolume },
            debug: { previousBalance, betAmount: amount, expectedBalance: previousBalance - amount, actualBalance: balance }
        });
    } catch (error) {
        if (error instanceof BetPlacementError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        console.error('베팅 오류:', error);
        res.status(500).json({ success: false, message: '베팅 처리 중 오류가 발생했습니다.', error: 'BET_PLACEMENT_FAILED' });
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