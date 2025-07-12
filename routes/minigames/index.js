const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');

// Bustabit 게임 라우트 추가
const bustabitRouter = require('./bustabit');
router.use('/bustabit', bustabitRouter);

// 미니게임 통계 조회 (공개)
router.get('/stats', async (req, res) => {
    const { gameType } = req.query;
    
    try {
        const { query } = require('../../database/postgres');
        
        if (!gameType) {
            return res.status(400).json({
                success: false,
                message: '게임 타입이 필요합니다'
            });
        }
        
        // 현재 진행 중인 게임 세션 수 조회 (향후 구현)
        // 현재는 기본 통계 반환
        const stats = {
            currentPlayers: Math.floor(Math.random() * 20) + 1, // 임시 랜덤 데이터
            totalGames: 1000 + Math.floor(Math.random() * 500),
            totalVolume: 50000 + Math.floor(Math.random() * 100000),
            averageMultiplier: (1.5 + Math.random() * 2).toFixed(2)
        };
        
        console.log(`📊 ${gameType} 게임 통계 조회: ${JSON.stringify(stats)}`);
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('게임 통계 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 통계를 불러올 수 없습니다'
        });
    }
});

// 게임 히스토리 조회 (인증 필요)
router.get('/history', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { gameType, limit = 20 } = req.query;
    
    try {
        const { query } = require('../../database/postgres');
        
        if (!gameType) {
            return res.status(400).json({
                success: false,
                message: '게임 타입이 필요합니다'
            });
        }
        
        // 사용자의 미니게임 거래 내역 조회
        const historyResult = await query(
            `SELECT 
                id,
                type,
                category,
                amount,
                description,
                reference_id,
                created_at
            FROM gam_transactions 
            WHERE user_id = $1 
                AND (category = 'minigame_bet' OR category = 'minigame_win')
                AND description LIKE $2
            ORDER BY created_at DESC 
            LIMIT $3`,
            [userId, `%${gameType}%`, parseInt(limit)]
        );
        
        // 게임별 히스토리 데이터 구성
        const history = historyResult.rows.map(row => {
            let gameData = {};
            try {
                gameData = JSON.parse(row.reference_id || '{}');
            } catch (e) {
                gameData = {};
            }
            
            return {
                id: row.id,
                type: row.type, // 'burn' (베팅) 또는 'earn' (수익)
                amount: row.amount,
                description: row.description,
                gameData: gameData,
                timestamp: row.created_at,
                // Bustabit의 경우 배수 정보 포함
                multiplier: gameData.multiplier || (row.type === 'earn' ? 
                    (row.amount / (gameData.betAmount || 100)) : null)
            };
        });
        
        console.log(`📜 ${gameType} 게임 히스토리 조회: 사용자 ${userId}, ${history.length}건`);
        
        res.json({
            success: true,
            history: history
        });
        
    } catch (error) {
        console.error('게임 히스토리 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 히스토리를 불러올 수 없습니다'
        });
    }
});

// 게임 접근 권한 확인 (GAM.js와 동일하지만 별도 엔드포인트)
router.get('/access-check', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { gameType } = req.query;
    
    try {
        const { query } = require('../../database/postgres');
        
        // 사용자 정보 조회
        const userResult = await query(
            'SELECT id, username, gam_balance FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다'
            });
        }
        
        const user = userResult.rows[0];
        
        // 게임별 접근 권한 확인
        const gameAccessRules = {
            'bustabit': { minBalance: 10, maxBet: 10000, status: 'active' },
            'monster': { minBalance: 10, maxBet: 10000, status: 'coming_soon' },
            'slots': { minBalance: 10, maxBet: 10000, status: 'coming_soon' }
        };
        
        const gameRule = gameAccessRules[gameType];
        if (!gameRule) {
            return res.status(400).json({
                success: false,
                message: '지원하지 않는 게임입니다'
            });
        }
        
        // 게임 상태 확인
        if (gameRule.status !== 'active') {
            return res.json({
                success: false,
                message: '현재 준비 중인 게임입니다',
                userBalance: user.gam_balance
            });
        }
        
        const canPlay = user.gam_balance >= gameRule.minBalance;
        
        res.json({
            success: canPlay,
            message: canPlay ? '게임을 플레이할 수 있습니다' : '최소 GAM 잔액이 부족합니다',
            userBalance: user.gam_balance,
            minBalance: gameRule.minBalance,
            maxBet: gameRule.maxBet
        });
        
    } catch (error) {
        console.error('미니게임 접근 권한 확인 실패:', error);
        res.status(500).json({
            success: false,
            message: '접근 권한 확인 중 오류가 발생했습니다'
        });
    }
});

// 게임 세션 생성 (향후 멀티플레이어 대응)
router.post('/create-session', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { gameType } = req.body;
    
    try {
        if (!gameType) {
            return res.status(400).json({
                success: false,
                message: '게임 타입이 필요합니다'
            });
        }
        
        // 임시 세션 ID 생성
        const sessionId = `${gameType}_${Date.now()}_${userId}`;
        
        console.log(`🎮 게임 세션 생성: ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            gameType: gameType,
            message: '게임 세션이 생성되었습니다'
        });
        
    } catch (error) {
        console.error('게임 세션 생성 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 세션 생성 중 오류가 발생했습니다'
        });
    }
});

// 전체 게임 목록 조회
router.get('/games', async (req, res) => {
    try {
        const games = [
            {
                id: 'bustabit',
                name: 'Bustabit',
                description: '실시간으로 증가하는 배수에서 언제 캐시아웃할지 결정하는 스릴 넘치는 게임',
                category: 'multiplier',
                minBet: 10,
                maxBet: 10000,
                status: 'active',
                icon: '🚀',
                color: 'from-red-500 to-orange-500'
            },
            {
                id: 'monster',
                name: '몬스터 강화',
                description: '몬스터를 강화하여 더 강력하게 만드는 게임. 강화에 성공하면 배수 획득!',
                category: 'upgrade',
                minBet: 10,
                maxBet: 10000,
                status: 'coming_soon',
                icon: '🐉',
                color: 'from-green-500 to-emerald-500'
            },
            {
                id: 'slots',
                name: '슬롯머신',
                description: '클래식한 슬롯머신 게임으로 행운을 시험해보세요!',
                category: 'luck',
                minBet: 10,
                maxBet: 10000,
                status: 'coming_soon',
                icon: '🎰',
                color: 'from-purple-500 to-pink-500'
            }
        ];
        
        res.json({
            success: true,
            games: games
        });
        
    } catch (error) {
        console.error('게임 목록 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 목록을 불러올 수 없습니다'
        });
    }
});

module.exports = router;