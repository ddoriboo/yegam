const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../middleware/auth');
const { getBustabitEngine } = require('../../services/minigames/bustabit-engine');

// Bustabit 게임 상태 조회 (공개)
router.get('/state', async (req, res) => {
    try {
        const engine = getBustabitEngine();
        const gameState = engine.getGameState();
        
        res.json({
            success: true,
            gameState: gameState
        });
    } catch (error) {
        console.error('Bustabit 상태 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 상태를 불러올 수 없습니다'
        });
    }
});

// 새 게임 시작 (개발/테스트용 - 실제로는 자동화)
router.post('/start', async (req, res) => {
    try {
        const engine = getBustabitEngine();
        const result = engine.startNewGame();
        
        if (result) {
            console.log('🎮 새 Bustabit 게임 시작됨');
            res.json({
                success: true,
                message: '새 게임이 시작되었습니다',
                gameState: result
            });
        } else {
            res.json({
                success: false,
                message: '게임을 시작할 수 없습니다'
            });
        }
    } catch (error) {
        console.error('게임 시작 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 시작 중 오류가 발생했습니다'
        });
    }
});

// 베팅하기
router.post('/bet', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const username = req.user.username;
    const { betAmount } = req.body;
    
    try {
        // 입력 검증
        if (!betAmount || betAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: '베팅 금액을 입력해주세요'
            });
        }
        
        // GAM 차감 처리
        console.log(`💸 베팅 처리 시작: 사용자 ${userId}, 금액 ${betAmount} GAM`);
        
        const { query } = require('../../database/postgres');
        
        await query('BEGIN');
        console.log('🔄 트랜잭션 시작');
        
        try {
            // 사용자 잔액 확인 및 잠금
            const userResult = await query(
                'SELECT id, username, gam_balance FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            console.log(`👤 사용자 조회 결과:`, userResult.rows);
            
            if (userResult.rows.length === 0) {
                await query('ROLLBACK');
                console.log('❌ 사용자를 찾을 수 없음');
                return res.status(404).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다'
                });
            }
            
            const user = userResult.rows[0];
            console.log(`💰 현재 GAM 잔액: ${user.gam_balance} GAM`);
            
            // 잔액 확인
            if (user.gam_balance < betAmount) {
                await query('ROLLBACK');
                console.log(`❌ GAM 부족: 필요 ${betAmount}, 보유 ${user.gam_balance}`);
                return res.status(400).json({
                    success: false,
                    message: '보유 GAM이 부족합니다'
                });
            }
            
            // 게임 엔진에 베팅 등록
            const engine = getBustabitEngine();
            const betResult = engine.placeBet(userId, username, betAmount);
            console.log(`🎮 게임 엔진 베팅 결과:`, betResult);
            
            if (!betResult.success) {
                await query('ROLLBACK');
                console.log(`❌ 게임 엔진 베팅 실패: ${betResult.message}`);
                return res.json(betResult);
            }
            
            // GAM 차감
            const newBalance = user.gam_balance - betAmount;
            console.log(`💰 GAM 차감: ${user.gam_balance} → ${newBalance}`);
            
            await query(
                'UPDATE users SET gam_balance = $1 WHERE id = $2',
                [newBalance, userId]
            );
            console.log('✅ 사용자 GAM 잔액 업데이트 완료');
            
            // 거래 기록
            await query(
                `INSERT INTO gam_transactions 
                (user_id, type, category, amount, description, reference_id) 
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    userId,
                    'burn',
                    'minigame_bet',
                    betAmount,
                    'Bustabit 게임 베팅',
                    JSON.stringify({ gameType: 'bustabit', betAmount })
                ]
            );
            console.log('✅ GAM 거래 기록 완료');
            
            await query('COMMIT');
            console.log('✅ 트랜잭션 커밋 완료');
            
            console.log(`✅ Bustabit 베팅 성공: ${username} - ${betAmount} GAM`);
            
            res.json({
                success: true,
                message: '베팅이 완료되었습니다',
                newBalance: newBalance,
                playerCount: betResult.playerCount
            });
            
        } catch (innerError) {
            await query('ROLLBACK');
            console.log('🔄 트랜잭션 롤백 완료');
            throw innerError;
        }
        
    } catch (error) {
        console.error('❌ Bustabit 베팅 실패 상세:', {
            error: error.message,
            stack: error.stack,
            userId: userId,
            betAmount: betAmount
        });
        
        let errorMessage = '베팅 처리 중 오류가 발생했습니다';
        
        // 특정 에러에 대한 사용자 친화적 메시지
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            errorMessage = '데이터베이스 테이블 오류가 발생했습니다. 관리자에게 문의해주세요.';
        } else if (error.message.includes('invalid input syntax')) {
            errorMessage = '입력 데이터 형식 오류가 발생했습니다.';
        } else if (error.message.includes('connection')) {
            errorMessage = '데이터베이스 연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            errorCode: 'BETTING_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

// 캐시아웃
router.post('/cashout', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const username = req.user.username;
    
    try {
        console.log(`💰 캐시아웃 처리 시작: 사용자 ${userId}`);
        
        // 게임 엔진에서 캐시아웃 처리
        const engine = getBustabitEngine();
        const cashoutResult = engine.cashOut(userId);
        console.log(`🎮 게임 엔진 캐시아웃 결과:`, cashoutResult);
        
        if (!cashoutResult.success) {
            console.log(`❌ 게임 엔진 캐시아웃 실패: ${cashoutResult.message}`);
            return res.json(cashoutResult);
        }
        
        // GAM 지급 처리
        const { query } = require('../../database/postgres');
        
        await query('BEGIN');
        console.log('🔄 캐시아웃 트랜잭션 시작');
        
        try {
            // 사용자 잔액 업데이트
            const userResult = await query(
                'SELECT id, username, gam_balance FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                await query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다'
                });
            }
            
            const user = userResult.rows[0];
            const payout = cashoutResult.payout;
            const newBalance = Math.min(user.gam_balance + payout, 99999999);
            const actualPayout = newBalance - user.gam_balance;
            
            await query(
                'UPDATE users SET gam_balance = $1 WHERE id = $2',
                [newBalance, userId]
            );
            
            // 수익 거래 기록
            await query(
                `INSERT INTO gam_transactions 
                (user_id, type, category, amount, description, reference_id) 
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    userId,
                    'earn',
                    'minigame_win',
                    actualPayout,
                    `Bustabit 캐시아웃 (${cashoutResult.multiplier.toFixed(2)}x)`,
                    JSON.stringify({ 
                        gameType: 'bustabit', 
                        multiplier: cashoutResult.multiplier,
                        originalPayout: payout 
                    })
                ]
            );
            
            await query('COMMIT');
            
            console.log(`💰 Bustabit 캐시아웃 성공: ${username} - ${cashoutResult.multiplier.toFixed(2)}x, ${actualPayout} GAM`);
            
            res.json({
                success: true,
                message: `${cashoutResult.multiplier.toFixed(2)}x 캐시아웃 완료!`,
                multiplier: cashoutResult.multiplier,
                payout: actualPayout,
                newBalance: newBalance
            });
            
        } catch (innerError) {
            await query('ROLLBACK');
            throw innerError;
        }
        
    } catch (error) {
        console.error('Bustabit 캐시아웃 실패:', error);
        res.status(500).json({
            success: false,
            message: '캐시아웃 처리 중 오류가 발생했습니다'
        });
    }
});

// 플레이어 개별 상태 조회
router.get('/player-state', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    
    try {
        const engine = getBustabitEngine();
        const playerState = engine.getPlayerState(userId);
        
        res.json({
            success: true,
            playerState: playerState
        });
    } catch (error) {
        console.error('플레이어 상태 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '플레이어 상태를 불러올 수 없습니다'
        });
    }
});

// 게임 통계 조회
router.get('/stats', async (req, res) => {
    try {
        const engine = getBustabitEngine();
        const stats = engine.getGameStats();
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Bustabit 통계 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 통계를 불러올 수 없습니다'
        });
    }
});

// 게임 히스토리 조회
router.get('/history', async (req, res) => {
    const { limit = 20 } = req.query;
    
    try {
        const engine = getBustabitEngine();
        const gameState = engine.getGameState();
        const history = gameState.recentHistory.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            history: history
        });
    } catch (error) {
        console.error('Bustabit 히스토리 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '게임 히스토리를 불러올 수 없습니다'
        });
    }
});

module.exports = router;