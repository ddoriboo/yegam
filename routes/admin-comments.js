const express = require('express');
const router = express.Router();
const { query, run, get } = require('../database/database');

// 관리자 권한 확인 미들웨어 (간단 버전)
const requireAdmin = (req, res, next) => {
    // 실제 환경에서는 더 엄격한 관리자 인증을 구현해야 합니다
    next();
};

// 모든 댓글 조회 (관리자용)
router.get('/all', requireAdmin, (req, res) => {
    const db = getDB();
    const { filter = 'all', page = 1, limit = 50 } = req.query;
    
    let whereCondition = '';
    let params = [];
    
    switch (filter) {
        case 'highlighted':
            whereCondition = 'WHERE c.is_highlighted = 1';
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
    
    const query = `
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
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    db.all(query, params, (err, comments) => {
        if (err) {
            console.error('관리자 댓글 조회 실패:', err);
            return res.status(500).json({ error: '댓글 조회에 실패했습니다.' });
        }
        
        // 총 개수 조회
        const countQuery = `
            SELECT COUNT(DISTINCT c.id) as total
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN issues i ON c.issue_id = i.id
            ${whereCondition}
        `;
        
        db.get(countQuery, whereCondition ? [] : [], (err, countResult) => {
            if (err) {
                console.error('댓글 총 개수 조회 실패:', err);
                return res.status(500).json({ error: '댓글 개수 조회에 실패했습니다.' });
            }
            
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
                    total: countResult.total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(countResult.total / limit)
                }
            });
        });
    });
});

// 댓글 삭제 (관리자용)
router.delete('/:commentId', requireAdmin, (req, res) => {
    const { commentId } = req.params;
    const db = getDB();
    
    // 댓글 존재 확인
    db.get('SELECT id FROM comments WHERE id = ?', [commentId], (err, comment) => {
        if (err || !comment) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        // 소프트 삭제
        db.run(
            'UPDATE comments SET content = ?, deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['[관리자에 의해 삭제된 댓글]', commentId],
            function(err) {
                if (err) {
                    console.error('관리자 댓글 삭제 실패:', err);
                    return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
                }
                
                res.json({
                    success: true,
                    message: '댓글이 삭제되었습니다.'
                });
            }
        );
    });
});

// 댓글 강조 토글 (관리자용)
router.post('/:commentId/highlight', requireAdmin, (req, res) => {
    const { commentId } = req.params;
    const { action } = req.body; // 'highlight' 또는 'unhighlight'
    const db = getDB();
    
    let updateQuery;
    let params;
    
    if (action === 'highlight') {
        // 24시간 강조
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        updateQuery = 'UPDATE comments SET is_highlighted = 1, highlight_expires_at = ? WHERE id = ?';
        params = [expiresAt.toISOString(), commentId];
    } else {
        updateQuery = 'UPDATE comments SET is_highlighted = 0, highlight_expires_at = NULL WHERE id = ?';
        params = [commentId];
    }
    
    db.run(updateQuery, params, function(err) {
        if (err) {
            console.error('댓글 강조 처리 실패:', err);
            return res.status(500).json({ error: '댓글 강조 처리에 실패했습니다.' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            message: action === 'highlight' ? '댓글이 강조되었습니다.' : '댓글 강조가 해제되었습니다.'
        });
    });
});

// 댓글 복구 (관리자용)
router.post('/:commentId/restore', requireAdmin, (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;
    const db = getDB();
    
    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '복구할 댓글 내용이 필요합니다.' });
    }
    
    db.run(
        'UPDATE comments SET content = ?, deleted_at = NULL WHERE id = ?',
        [content.trim(), commentId],
        function(err) {
            if (err) {
                console.error('댓글 복구 실패:', err);
                return res.status(500).json({ error: '댓글 복구에 실패했습니다.' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
            }
            
            res.json({
                success: true,
                message: '댓글이 복구되었습니다.'
            });
        }
    );
});

// 댓글 통계 조회 (관리자용)
router.get('/stats', requireAdmin, (req, res) => {
    const db = getDB();
    
    const statsQueries = [
        'SELECT COUNT(*) as total FROM comments',
        'SELECT COUNT(*) as highlighted FROM comments WHERE is_highlighted = 1',
        'SELECT COUNT(*) as deleted FROM comments WHERE deleted_at IS NOT NULL',
        'SELECT COUNT(*) as today FROM comments WHERE date(created_at) = date("now")',
        'SELECT AVG(likes) as avg_likes FROM comments WHERE deleted_at IS NULL'
    ];
    
    Promise.all(statsQueries.map(query => 
        new Promise((resolve, reject) => {
            db.get(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        })
    )).then(results => {
        res.json({
            success: true,
            stats: {
                total: results[0].total,
                highlighted: results[1].highlighted,
                deleted: results[2].deleted,
                today: results[3].today,
                averageLikes: Math.round(results[4].avg_likes || 0)
            }
        });
    }).catch(err => {
        console.error('댓글 통계 조회 실패:', err);
        res.status(500).json({ error: '통계 조회에 실패했습니다.' });
    });
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