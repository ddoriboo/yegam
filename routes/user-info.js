const express = require('express');
const { query } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');
const InputValidator = require('../utils/input-validation');

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

// 닉네임 중복 검사 API
router.get('/check-username/:username', authMiddleware, async (req, res) => {
    try {
        const { username } = req.params;
        const currentUserId = req.user.id;
        
        console.log(`[닉네임 중복검사] 사용자 ${currentUserId}, 확인할 닉네임: ${username}`);
        
        // 닉네임 유효성 검사
        const validation = InputValidator.validateUsername(username);
        if (!validation.valid) {
            return res.json({
                success: false,
                available: false,
                message: validation.message
            });
        }
        
        // 중복 검사 (현재 사용자 제외)
        const existingUserResult = await query(
            'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
            [validation.sanitized, currentUserId]
        );
        
        const isAvailable = existingUserResult.rows.length === 0;
        
        res.json({
            success: true,
            available: isAvailable,
            message: isAvailable ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.'
        });
        
    } catch (error) {
        console.error('[닉네임 중복검사] 오류:', error);
        res.status(500).json({
            success: false,
            available: false,
            message: '닉네임 확인 중 오류가 발생했습니다.'
        });
    }
});

// 닉네임 변경 API
router.put('/username', authMiddleware, async (req, res) => {
    try {
        const { newUsername } = req.body;
        const userId = req.user.id;
        
        console.log(`[닉네임 변경] 사용자 ${userId}, 새 닉네임: ${newUsername}`);
        
        // 입력값 검증
        if (!newUsername) {
            return res.status(400).json({
                success: false,
                message: '새 닉네임을 입력해주세요.'
            });
        }
        
        // 닉네임 유효성 검사
        const validation = InputValidator.validateUsername(newUsername);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }
        
        const sanitizedUsername = validation.sanitized;
        
        // 현재 사용자 정보 조회
        const currentUserResult = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [userId]
        );
        
        if (currentUserResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }
        
        const currentUser = currentUserResult.rows[0];
        
        // 현재 닉네임과 동일한지 확인
        if (currentUser.username.toLowerCase() === sanitizedUsername.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: '현재 닉네임과 동일합니다.'
            });
        }
        
        // 중복 검사 (다른 사용자가 사용 중인지)
        const duplicateResult = await query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
            [sanitizedUsername, userId]
        );
        
        if (duplicateResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: '이미 사용 중인 닉네임입니다.'
            });
        }
        
        // 닉네임 업데이트
        const updateResult = await query(
            'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, email, gam_balance, created_at',
            [sanitizedUsername, userId]
        );
        
        if (updateResult.rows.length === 0) {
            return res.status(500).json({
                success: false,
                message: '닉네임 변경에 실패했습니다.'
            });
        }
        
        const updatedUser = updateResult.rows[0];
        
        console.log(`[닉네임 변경] 성공! 사용자 ${userId}: ${currentUser.username} → ${sanitizedUsername}`);
        
        res.json({
            success: true,
            message: '닉네임이 변경되었습니다.',
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                gam_balance: updatedUser.gam_balance,
                created_at: updatedUser.created_at
            }
        });
        
    } catch (error) {
        console.error('[닉네임 변경] 오류:', error);
        res.status(500).json({
            success: false,
            message: '닉네임 변경 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;