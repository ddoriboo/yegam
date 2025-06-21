const express = require('express');
const { query, run, get } = require('../database/database');
const { authMiddleware } = require('../middleware/auth');
const { validateIdParam, validatePagination } = require('../middleware/validation');

const router = express.Router();

/**
 * 사용자의 알림 목록 조회
 * GET /api/notifications?page=1&limit=20
 */
router.get('/', authMiddleware, validatePagination, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, limit, offset } = req.pagination;
        
        // 전체 알림 개수 조회
        const countResult = await get(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1',
            [userId]
        );
        const total = parseInt(countResult.total);
        
        // 읽지 않은 알림 개수 조회
        const unreadResult = await get(
            'SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        const unreadCount = parseInt(unreadResult.unread);
        
        // 알림 목록 조회 (최신순)
        const notifications = await query(
            `SELECT id, type, title, message, related_id, related_type, is_read, created_at
             FROM notifications 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        
        res.json({
            success: true,
            data: {
                notifications: notifications.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNext: offset + limit < total,
                    hasPrev: page > 1
                },
                unreadCount
            }
        });
        
    } catch (error) {
        console.error('알림 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '알림 목록 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 읽지 않은 알림 개수 조회
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await get(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        
        res.json({
            success: true,
            data: {
                unreadCount: parseInt(result.count)
            }
        });
        
    } catch (error) {
        console.error('읽지 않은 알림 개수 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '읽지 않은 알림 개수 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 특정 알림을 읽음으로 표시
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', authMiddleware, validateIdParam('id'), async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.validatedParams.id;
        
        // 알림이 해당 사용자의 것인지 확인
        const notification = await get(
            'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
        
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: '알림을 찾을 수 없습니다.'
            });
        }
        
        // 읽음으로 표시
        await run(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1',
            [notificationId]
        );
        
        res.json({
            success: true,
            message: '알림이 읽음으로 표시되었습니다.'
        });
        
    } catch (error) {
        console.error('알림 읽음 처리 오류:', error);
        res.status(500).json({
            success: false,
            message: '알림 읽음 처리 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 모든 알림을 읽음으로 표시
 * PUT /api/notifications/read-all
 */
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await run(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        
        const updatedCount = result.rowCount || 0;
        
        res.json({
            success: true,
            message: `${updatedCount}개의 알림이 읽음으로 표시되었습니다.`,
            data: {
                updatedCount
            }
        });
        
    } catch (error) {
        console.error('모든 알림 읽음 처리 오류:', error);
        res.status(500).json({
            success: false,
            message: '모든 알림 읽음 처리 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 특정 알림 삭제
 * DELETE /api/notifications/:id
 */
router.delete('/:id', authMiddleware, validateIdParam('id'), async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.validatedParams.id;
        
        // 알림이 해당 사용자의 것인지 확인
        const notification = await get(
            'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
        
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: '알림을 찾을 수 없습니다.'
            });
        }
        
        // 알림 삭제
        await run(
            'DELETE FROM notifications WHERE id = $1',
            [notificationId]
        );
        
        res.json({
            success: true,
            message: '알림이 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('알림 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '알림 삭제 중 오류가 발생했습니다.'
        });
    }
});

/**
 * 모든 읽은 알림 삭제
 * DELETE /api/notifications/read
 */
router.delete('/read', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await run(
            'DELETE FROM notifications WHERE user_id = $1 AND is_read = TRUE',
            [userId]
        );
        
        const deletedCount = result.rowCount || 0;
        
        res.json({
            success: true,
            message: `${deletedCount}개의 읽은 알림이 삭제되었습니다.`,
            data: {
                deletedCount
            }
        });
        
    } catch (error) {
        console.error('읽은 알림 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '읽은 알림 삭제 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;