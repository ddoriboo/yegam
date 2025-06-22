const express = require('express');
const { query } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 실시간 사용자 GAM 잔액 조회 (캐시 없이 직접 DB 조회)
router.get('/realtime-gam', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`[실시간 GAM] 사용자 ${userId} GAM 잔액 조회 시작`);
        
        // 직접 데이터베이스에서 최신 GAM 잔액 조회
        const userResult = await query(
            'SELECT id, username, gam_balance FROM users WHERE id = $1',
            [userId]
        );
        
        const user = userResult.rows[0];
        
        if (!user) {
            console.error(`[실시간 GAM] 사용자 ${userId} 찾을 수 없음`);
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }
        
        const gamBalance = user.gam_balance ?? 10000;
        
        console.log(`[실시간 GAM] 사용자 ${userId} (${user.username}) GAM 잔액: ${gamBalance}`);
        
        res.json({
            success: true,
            data: {
                userId: user.id,
                username: user.username,
                gam_balance: gamBalance,
                formatted_balance: gamBalance.toLocaleString(),
                timestamp: new Date().toISOString(),
                source: 'direct_database_query'
            }
        });
        
    } catch (error) {
        console.error('[실시간 GAM] 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: 'GAM 잔액 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 사용자 전체 정보 조회 (실시간)
router.get('/full-info', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`[사용자 정보] 사용자 ${userId} 전체 정보 조회 시작`);
        
        // 직접 데이터베이스에서 모든 사용자 정보 조회
        const userResult = await query(
            'SELECT id, username, email, gam_balance, created_at FROM users WHERE id = $1',
            [userId]
        );
        
        const user = userResult.rows[0];
        
        if (!user) {
            console.error(`[사용자 정보] 사용자 ${userId} 찾을 수 없음`);
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }
        
        const gamBalance = user.gam_balance ?? 10000;
        
        console.log(`[사용자 정보] 사용자 ${userId} 전체 정보:`, {
            username: user.username,
            gam_balance: gamBalance,
            created_at: user.created_at
        });
        
        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                gam_balance: gamBalance,
                created_at: user.created_at,
                timestamp: new Date().toISOString(),
                source: 'direct_database_query'
            }
        });
        
    } catch (error) {
        console.error('[사용자 정보] 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '사용자 정보 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;