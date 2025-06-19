const express = require('express');
const router = express.Router();
const { query, run, get } = require('../database/database');

// 관리자 권한 확인 미들웨어 (간단 버전)
const requireAdmin = (req, res, next) => {
    // 실제 환경에서는 더 엄격한 관리자 인증을 구현해야 합니다
    next();
};

// 모든 댓글 조회 (관리자용)
router.get('/all', requireAdmin, async (req, res) => {
    const { filter = 'all', page = 1, limit = 50 } = req.query;
    
    try {
        let whereCondition = '';
        let params = [];
        
        switch (filter) {
            case 'highlighted':
                whereCondition = 'WHERE c.is_highlighted = TRUE';
                break;
            case 'reported':
                // 신고된 댓글 (현재는 좋아요가 -5 이하인 댓글을 임시로 사용)
                whereCondition = 'WHERE c.likes < -5';
                break;
            case 'all':
            default:
                whereCondition = '';
                break;
        }
        
        const offset = (page - 1) * limit;
        
        const commentsQuery = `
            SELECT 
                c.id,
                c.content,
                c.likes,
                c.is_highlighted,
                c.highlight_expires_at,
                c.created_at,
                c.deleted_at,
                c.parent_id,
                u.username,
                u.id as user_id,
                i.title as issue_title,
                i.id as issue_id,
                COUNT(replies.id) as reply_count
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN issues i ON c.issue_id = i.id
            LEFT JOIN comments replies ON replies.parent_id = c.id
            ${whereCondition}
            GROUP BY c.id, c.content, c.likes, c.is_highlighted, c.highlight_expires_at, c.created_at, c.deleted_at, c.parent_id, u.username, u.id, i.title, i.id
            ORDER BY c.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        // 파라미터 순서: limit, offset
        params = [parseInt(limit), parseInt(offset)];
        
        const result = await query(commentsQuery, params);
        const comments = result.rows;
        
        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(DISTINCT c.id) as total
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN issues i ON c.issue_id = i.id
            ${whereCondition}
        `;
        
        const countResult = await query(countQuery, []);
        const total = countResult.rows[0].total;
        
        const processedComments = comments.map(comment => ({
            ...comment,
            timeAgo: getTimeAgo(comment.created_at),
            isDeleted: !!comment.deleted_at,
            contentPreview: comment.content.length > 100 ? 
                comment.content.substring(0, 100) + '...' : 
                comment.content
        }));
        
        res.json({
            success: true,
            comments: processedComments,
            pagination: {
                total: parseInt(total),
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('관리자 댓글 조회 실패:', error);
        return res.status(500).json({ error: '댓글 조회에 실패했습니다.' });
    }
});

// 댓글 삭제 (관리자용)
router.delete('/:commentId', requireAdmin, async (req, res) => {
    const { commentId } = req.params;
    
    try {
        // 댓글 존재 확인
        const comment = await get('SELECT id FROM comments WHERE id = $1', [commentId]);
        
        if (!comment) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        // 소프트 삭제
        await run(
            'UPDATE comments SET content = $1, deleted_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['[관리자에 의해 삭제된 댓글]', commentId]
        );
        
        res.json({
            success: true,
            message: '댓글이 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('관리자 댓글 삭제 실패:', error);
        return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
    }
});

// 댓글 강조 토글 (관리자용)
router.post('/:commentId/highlight', requireAdmin, async (req, res) => {
    const { commentId } = req.params;
    const { action } = req.body; // 'highlight' 또는 'unhighlight'
    
    try {
        let updateQuery;
        let params;
        
        if (action === 'highlight') {
            // 24시간 강조
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            
            updateQuery = 'UPDATE comments SET is_highlighted = TRUE, highlight_expires_at = $1 WHERE id = $2';
            params = [expiresAt.toISOString(), commentId];
        } else {
            updateQuery = 'UPDATE comments SET is_highlighted = FALSE, highlight_expires_at = NULL WHERE id = $1';
            params = [commentId];
        }
        
        const result = await run(updateQuery, params);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            message: action === 'highlight' ? '댓글이 강조되었습니다.' : '댓글 강조가 해제되었습니다.'
        });
        
    } catch (error) {
        console.error('댓글 강조 처리 실패:', error);
        return res.status(500).json({ error: '댓글 강조 처리에 실패했습니다.' });
    }
});

// 댓글 복구 (관리자용)
router.post('/:commentId/restore', requireAdmin, async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '복구할 댓글 내용이 필요합니다.' });
    }
    
    try {
        const result = await run(
            'UPDATE comments SET content = $1, deleted_at = NULL WHERE id = $2',
            [content.trim(), commentId]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            message: '댓글이 복구되었습니다.'
        });
        
    } catch (error) {
        console.error('댓글 복구 실패:', error);
        return res.status(500).json({ error: '댓글 복구에 실패했습니다.' });
    }
});

// 댓글 통계 조회 (관리자용)
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await Promise.all([
            query('SELECT COUNT(*) as total FROM comments'),
            query('SELECT COUNT(*) as highlighted FROM comments WHERE is_highlighted = TRUE'),
            query('SELECT COUNT(*) as deleted FROM comments WHERE deleted_at IS NOT NULL'),
            query('SELECT COUNT(*) as today FROM comments WHERE DATE(created_at) = DATE(NOW())'),
            query('SELECT AVG(likes) as avg_likes FROM comments WHERE deleted_at IS NULL')
        ]);
        
        res.json({
            success: true,
            stats: {
                total: parseInt(stats[0].rows[0].total),
                highlighted: parseInt(stats[1].rows[0].highlighted),
                deleted: parseInt(stats[2].rows[0].deleted),
                today: parseInt(stats[3].rows[0].today),
                averageLikes: Math.round(parseFloat(stats[4].rows[0].avg_likes) || 0)
            }
        });
        
    } catch (error) {
        console.error('댓글 통계 조회 실패:', error);
        res.status(500).json({ error: '통계 조회에 실패했습니다.' });
    }
});

// 시간 차이 계산 헬퍼 함수
function getTimeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    
    return past.toLocaleDateString('ko-KR');
}

module.exports = router;