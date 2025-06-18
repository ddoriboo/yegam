const express = require('express');
const router = express.Router();
const { getDB } = require('../database/init');
const gamService = require('../services/gamService');

// 특정 이슈의 댓글 조회 (스레드 형태)
router.get('/issue/:issueId', (req, res) => {
    const { issueId } = req.params;
    const db = getDB();
    
    const query = `
        SELECT 
            c.id,
            c.user_id,
            c.content,
            c.likes,
            c.is_highlighted,
            c.highlight_expires_at,
            c.created_at,
            u.username,
            u.profile_image,
            COUNT(r.id) as reply_count
        FROM comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN comments r ON r.parent_id = c.id
        WHERE c.issue_id = ? AND c.parent_id IS NULL
        GROUP BY c.id
        ORDER BY c.is_highlighted DESC, c.likes DESC, c.created_at DESC
    `;
    
    db.all(query, [issueId], (err, comments) => {
        if (err) {
            console.error('댓글 조회 실패:', err);
            return res.status(500).json({ error: '댓글 조회에 실패했습니다.' });
        }
        
        // 각 댓글의 답글도 조회
        const commentsWithReplies = [];
        let completed = 0;
        
        if (comments.length === 0) {
            return res.json({ success: true, comments: [] });
        }
        
        comments.forEach(comment => {
            const replyQuery = `
                SELECT 
                    c.id,
                    c.user_id,
                    c.content,
                    c.likes,
                    c.created_at,
                    u.username,
                    u.profile_image
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.parent_id = ?
                ORDER BY c.created_at ASC
                LIMIT 50
            `;
            
            db.all(replyQuery, [comment.id], (err, replies) => {
                if (err) {
                    console.error('답글 조회 실패:', err);
                    replies = [];
                }
                
                // 강조 만료 확인
                let isHighlighted = comment.is_highlighted;
                if (isHighlighted && comment.highlight_expires_at) {
                    const expiresAt = new Date(comment.highlight_expires_at);
                    const now = new Date();
                    if (now > expiresAt) {
                        isHighlighted = false;
                        // DB에서도 업데이트
                        db.run('UPDATE comments SET is_highlighted = 0 WHERE id = ?', [comment.id]);
                    }
                }
                
                commentsWithReplies.push({
                    ...comment,
                    is_highlighted: isHighlighted,
                    replies: replies.map(reply => ({
                        ...reply,
                        timeAgo: getTimeAgo(reply.created_at)
                    })),
                    timeAgo: getTimeAgo(comment.created_at)
                });
                
                completed++;
                if (completed === comments.length) {
                    res.json({
                        success: true,
                        comments: commentsWithReplies
                    });
                }
            });
        });
    });
});

// 댓글 작성
router.post('/', async (req, res) => {
    const { userId, issueId, content, parentId = null } = req.body;
    
    if (!userId || !issueId || !content) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    if (content.length > 500) {
        return res.status(400).json({ error: '댓글은 500자 이내로 작성해주세요.' });
    }
    
    // 스레드 깊이 제한 (최대 3단계)
    if (parentId) {
        const db = getDB();
        
        // 부모 댓글의 깊이 확인
        db.get(`
            WITH RECURSIVE comment_depth AS (
                SELECT id, parent_id, 1 as depth
                FROM comments 
                WHERE id = ?
                
                UNION ALL
                
                SELECT c.id, c.parent_id, cd.depth + 1
                FROM comments c
                JOIN comment_depth cd ON c.parent_id = cd.id
            )
            SELECT MAX(depth) as max_depth FROM comment_depth
        `, [parentId], async (err, result) => {
            if (err || (result && result.max_depth >= 3)) {
                return res.status(400).json({ error: '댓글 깊이는 최대 3단계까지 허용됩니다.' });
            }
            
            await createComment(userId, issueId, content, parentId, res);
        });
    } else {
        await createComment(userId, issueId, content, parentId, res);
    }
});

// 댓글 생성 헬퍼 함수
async function createComment(userId, issueId, content, parentId, res) {
    const db = getDB();
    
    try {
        // 30초 쿨다운 확인
        db.get(
            'SELECT created_at FROM comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId],
            async (err, lastComment) => {
                if (err) {
                    return res.status(500).json({ error: '댓글 생성 중 오류가 발생했습니다.' });
                }
                
                if (lastComment) {
                    const lastCommentTime = new Date(lastComment.created_at);
                    const now = new Date();
                    const timeDiff = (now - lastCommentTime) / 1000; // 초 단위
                    
                    if (timeDiff < 30) {
                        const remainingTime = Math.ceil(30 - timeDiff);
                        return res.status(400).json({ 
                            error: `댓글 작성은 30초에 한 번만 가능합니다. ${remainingTime}초 후에 다시 시도해주세요.` 
                        });
                    }
                }
                
                // 댓글 생성
                db.run(
                    'INSERT INTO comments (user_id, issue_id, content, parent_id) VALUES (?, ?, ?, ?)',
                    [userId, issueId, content, parentId],
                    async function(err) {
                        if (err) {
                            console.error('댓글 생성 실패:', err);
                            return res.status(500).json({ error: '댓글 생성에 실패했습니다.' });
                        }
                        
                        const commentId = this.lastID;
                        
                        try {
                            // 첫 댓글 보상 확인
                            if (!parentId) { // 최상위 댓글만
                                const firstCommentResult = await gamService.giveFirstCommentReward(userId);
                                if (firstCommentResult.success) {
                                    console.log(`사용자 ${userId}에게 첫 댓글 보상 지급`);
                                }
                            }
                            
                            // 생성된 댓글 정보 반환
                            db.get(`
                                SELECT 
                                    c.id,
                                    c.user_id,
                                    c.content,
                                    c.likes,
                                    c.created_at,
                                    u.username,
                                    u.profile_image
                                FROM comments c
                                JOIN users u ON c.user_id = u.id
                                WHERE c.id = ?
                            `, [commentId], (err, comment) => {
                                if (err) {
                                    return res.status(500).json({ error: '댓글 정보 조회에 실패했습니다.' });
                                }
                                
                                res.json({
                                    success: true,
                                    message: '댓글이 작성되었습니다.',
                                    comment: {
                                        ...comment,
                                        timeAgo: getTimeAgo(comment.created_at)
                                    }
                                });
                            });
                            
                        } catch (error) {
                            console.error('댓글 후처리 실패:', error);
                            res.json({
                                success: true,
                                message: '댓글이 작성되었습니다.',
                                commentId: commentId
                            });
                        }
                    }
                );
            }
        );
        
    } catch (error) {
        console.error('댓글 생성 실패:', error);
        res.status(500).json({ error: '댓글 생성에 실패했습니다.' });
    }
}

// 댓글 추천/비추천
router.post('/:commentId/like', (req, res) => {
    const { commentId } = req.params;
    const { userId, action } = req.body; // action: 'like' 또는 'unlike'
    
    if (!userId || !action) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    const db = getDB();
    
    // 기존 추천 상태 확인
    db.get(
        'SELECT * FROM comment_likes WHERE user_id = ? AND comment_id = ?',
        [userId, commentId],
        (err, existingLike) => {
            if (err) {
                return res.status(500).json({ error: '추천 상태 확인에 실패했습니다.' });
            }
            
            if (action === 'like') {
                if (existingLike) {
                    return res.status(400).json({ error: '이미 추천한 댓글입니다.' });
                }
                
                // 추천 추가
                db.run(
                    'INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)',
                    [userId, commentId],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: '추천 처리에 실패했습니다.' });
                        }
                        
                        // 댓글 좋아요 수 증가
                        db.run(
                            'UPDATE comments SET likes = likes + 1 WHERE id = ?',
                            [commentId],
                            (err) => {
                                if (err) {
                                    console.error('댓글 좋아요 수 업데이트 실패:', err);
                                }
                                
                                res.json({
                                    success: true,
                                    message: '댓글을 추천했습니다.'
                                });
                            }
                        );
                    }
                );
                
            } else if (action === 'unlike') {
                if (!existingLike) {
                    return res.status(400).json({ error: '추천하지 않은 댓글입니다.' });
                }
                
                // 추천 제거
                db.run(
                    'DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?',
                    [userId, commentId],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: '추천 취소에 실패했습니다.' });
                        }
                        
                        // 댓글 좋아요 수 감소
                        db.run(
                            'UPDATE comments SET likes = likes - 1 WHERE id = ?',
                            [commentId],
                            (err) => {
                                if (err) {
                                    console.error('댓글 좋아요 수 업데이트 실패:', err);
                                }
                                
                                res.json({
                                    success: true,
                                    message: '댓글 추천을 취소했습니다.'
                                });
                            }
                        );
                    }
                );
            } else {
                res.status(400).json({ error: '올바르지 않은 액션입니다.' });
            }
        }
    );
});

// 사용자의 댓글 추천 상태 조회
router.get('/likes/:userId/:issueId', (req, res) => {
    const { userId, issueId } = req.params;
    const db = getDB();
    
    const query = `
        SELECT cl.comment_id
        FROM comment_likes cl
        JOIN comments c ON cl.comment_id = c.id
        WHERE cl.user_id = ? AND c.issue_id = ?
    `;
    
    db.all(query, [userId, issueId], (err, likes) => {
        if (err) {
            console.error('댓글 추천 상태 조회 실패:', err);
            return res.status(500).json({ error: '댓글 추천 상태 조회에 실패했습니다.' });
        }
        
        const likedComments = likes.map(like => like.comment_id);
        
        res.json({
            success: true,
            likedComments: likedComments
        });
    });
});

// 댓글 강조 구매
router.post('/:commentId/highlight', async (req, res) => {
    const { commentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }
    
    try {
        const db = getDB();
        
        // 댓글 소유자 확인
        db.get('SELECT user_id FROM comments WHERE id = ?', [commentId], async (err, comment) => {
            if (err || !comment) {
                return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
            }
            
            if (comment.user_id !== parseInt(userId)) {
                return res.status(403).json({ error: '자신의 댓글만 강조할 수 있습니다.' });
            }
            
            try {
                // 감 차감 및 강조 처리
                const result = await gamService.burnCommentHighlight(userId, commentId);
                
                if (result.success) {
                    res.json({
                        success: true,
                        message: '댓글이 24시간 동안 강조됩니다.'
                    });
                } else {
                    res.status(400).json({ error: result.message });
                }
                
            } catch (error) {
                console.error('댓글 강조 구매 실패:', error);
                res.status(500).json({ error: '댓글 강조 구매에 실패했습니다.' });
            }
        });
        
    } catch (error) {
        console.error('댓글 강조 처리 실패:', error);
        res.status(500).json({ error: '댓글 강조 처리에 실패했습니다.' });
    }
});

// 댓글 삭제 (작성자만)
router.delete('/:commentId', (req, res) => {
    const { commentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }
    
    const db = getDB();
    
    // 댓글 소유자 확인
    db.get('SELECT user_id FROM comments WHERE id = ?', [commentId], (err, comment) => {
        if (err || !comment) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        if (comment.user_id !== parseInt(userId)) {
            return res.status(403).json({ error: '자신의 댓글만 삭제할 수 있습니다.' });
        }
        
        // 댓글 삭제 (소프트 삭제 - 내용만 변경)
        db.run(
            'UPDATE comments SET content = "[삭제된 댓글]", deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
            [commentId],
            function(err) {
                if (err) {
                    console.error('댓글 삭제 실패:', err);
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