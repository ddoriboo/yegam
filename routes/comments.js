const express = require('express');
const router = express.Router();
const { query, run, get } = require('../database/database');
const gamService = require('../services/gamService');

// 특정 이슈의 댓글 조회 (스레드 형태)
router.get('/issue/:issueId', async (req, res) => {
    const { issueId } = req.params;
    
    try {
        const commentsQuery = `
            SELECT 
                c.id,
                c.user_id,
                c.content,
                c.likes,
                c.is_highlighted,
                c.highlight_expires_at,
                c.created_at,
                u.username,
                u.coins,
                u.gam_balance,
                COUNT(r.id) as reply_count
            FROM comments c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN comments r ON r.parent_id = c.id
            WHERE c.issue_id = $1 AND c.parent_id IS NULL AND c.deleted_at IS NULL
            GROUP BY c.id, c.user_id, c.content, c.likes, c.is_highlighted, c.highlight_expires_at, c.created_at, u.username, u.coins, u.gam_balance
            ORDER BY c.is_highlighted DESC, c.likes DESC, c.created_at DESC
        `;
        
        const result = await query(commentsQuery, [issueId]);
        const comments = result.rows;
        
        // 각 댓글의 답글도 조회
        const commentsWithReplies = [];
        
        for (const comment of comments) {
            const replyQuery = `
                SELECT 
                    c.id,
                    c.user_id,
                    c.content,
                    c.likes,
                    c.created_at,
                    u.username,
                    u.coins,
                    u.gam_balance
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.parent_id = $1 AND c.deleted_at IS NULL
                ORDER BY c.created_at ASC
                LIMIT 50
            `;
            
            const replyResult = await query(replyQuery, [comment.id]);
            const replies = replyResult.rows;
            
            // 강조 만료 확인
            let isHighlighted = comment.is_highlighted;
            if (isHighlighted && comment.highlight_expires_at) {
                const expiresAt = new Date(comment.highlight_expires_at);
                const now = new Date();
                if (now > expiresAt) {
                    isHighlighted = false;
                    // DB에서도 업데이트
                    await run('UPDATE comments SET is_highlighted = FALSE WHERE id = $1', [comment.id]);
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
        }
        
        res.json({
            success: true,
            comments: commentsWithReplies
        });
        
    } catch (error) {
        console.error('댓글 조회 실패:', error);
        return res.status(500).json({ error: '댓글 조회에 실패했습니다.' });
    }
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
    
    try {
        // 스레드 깊이 제한 (최대 3단계)
        if (parentId) {
            const depthQuery = `
                WITH RECURSIVE comment_depth AS (
                    SELECT id, parent_id, 1 as depth
                    FROM comments 
                    WHERE id = $1
                    
                    UNION ALL
                    
                    SELECT c.id, c.parent_id, cd.depth + 1
                    FROM comments c
                    JOIN comment_depth cd ON c.parent_id = cd.id
                )
                SELECT MAX(depth) as max_depth FROM comment_depth
            `;
            
            const depthResult = await get(depthQuery, [parentId]);
            if (depthResult && depthResult.max_depth >= 3) {
                return res.status(400).json({ error: '댓글 깊이는 최대 3단계까지 허용됩니다.' });
            }
        }
        
        // 30초 쿨다운 확인
        const lastCommentQuery = 'SELECT created_at FROM comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1';
        const lastComment = await get(lastCommentQuery, [userId]);
        
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
        const insertQuery = 'INSERT INTO comments (user_id, issue_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING id';
        const insertResult = await query(insertQuery, [userId, issueId, content, parentId]);
        const commentId = insertResult.rows[0].id;
        
        try {
            // 첫 댓글 보상 확인
            if (!parentId && gamService && gamService.giveFirstCommentReward) {
                const firstCommentResult = await gamService.giveFirstCommentReward(userId);
                if (firstCommentResult.success) {
                    console.log(`사용자 ${userId}에게 첫 댓글 보상 지급`);
                }
            }
        } catch (rewardError) {
            console.error('댓글 보상 처리 실패:', rewardError);
            // 보상 실패는 댓글 작성을 방해하지 않음
        }
        
        // 생성된 댓글 정보 반환
        const commentQuery = `
            SELECT 
                c.id,
                c.user_id,
                c.content,
                c.likes,
                c.created_at,
                u.username
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = $1
        `;
        
        const commentResult = await get(commentQuery, [commentId]);
        
        res.json({
            success: true,
            message: '댓글이 작성되었습니다.',
            comment: {
                ...commentResult,
                timeAgo: getTimeAgo(commentResult.created_at)
            }
        });
        
    } catch (error) {
        console.error('댓글 작성 실패:', error);
        res.status(500).json({ error: '댓글 작성에 실패했습니다.' });
    }
});

// 댓글 추천/비추천
router.post('/:commentId/like', async (req, res) => {
    const { commentId } = req.params;
    const { userId, action } = req.body; // action: 'like' 또는 'unlike'
    
    if (!userId || !action) {
        return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    
    try {
        // 기존 추천 상태 확인
        const existingLikeQuery = 'SELECT * FROM comment_likes WHERE user_id = $1 AND comment_id = $2';
        const existingLike = await get(existingLikeQuery, [userId, commentId]);
        
        if (action === 'like') {
            if (existingLike) {
                return res.status(400).json({ error: '이미 추천한 댓글입니다.' });
            }
            
            // 추천 추가
            await run('INSERT INTO comment_likes (user_id, comment_id) VALUES ($1, $2)', [userId, commentId]);
            
            // 댓글 좋아요 수 증가
            await run('UPDATE comments SET likes = likes + 1 WHERE id = $1', [commentId]);
            
            res.json({
                success: true,
                message: '댓글을 추천했습니다.'
            });
            
        } else if (action === 'unlike') {
            if (!existingLike) {
                return res.status(400).json({ error: '추천하지 않은 댓글입니다.' });
            }
            
            // 추천 제거
            await run('DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2', [userId, commentId]);
            
            // 댓글 좋아요 수 감소
            await run('UPDATE comments SET likes = likes - 1 WHERE id = $1', [commentId]);
            
            res.json({
                success: true,
                message: '댓글 추천을 취소했습니다.'
            });
        } else {
            res.status(400).json({ error: '올바르지 않은 액션입니다.' });
        }
        
    } catch (error) {
        console.error('좋아요 처리 실패:', error);
        res.status(500).json({ error: '좋아요 처리에 실패했습니다.' });
    }
});

// 사용자의 댓글 추천 상태 조회
router.get('/likes/:userId/:issueId', async (req, res) => {
    const { userId, issueId } = req.params;
    
    try {
        const likesQuery = `
            SELECT cl.comment_id
            FROM comment_likes cl
            JOIN comments c ON cl.comment_id = c.id
            WHERE cl.user_id = $1 AND c.issue_id = $2
        `;
        
        const result = await query(likesQuery, [userId, issueId]);
        const likedComments = result.rows.map(row => row.comment_id);
        
        res.json({
            success: true,
            likedComments: likedComments
        });
        
    } catch (error) {
        console.error('댓글 추천 상태 조회 실패:', error);
        return res.status(500).json({ error: '댓글 추천 상태 조회에 실패했습니다.' });
    }
});

// 댓글 강조 구매
router.post('/:commentId/highlight', async (req, res) => {
    const { commentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }
    
    try {
        // 댓글 소유자 확인
        const commentQuery = 'SELECT user_id FROM comments WHERE id = $1';
        const comment = await get(commentQuery, [commentId]);
        
        if (!comment) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        if (comment.user_id !== parseInt(userId)) {
            return res.status(403).json({ error: '자신의 댓글만 강조할 수 있습니다.' });
        }
        
        try {
            // 감 차감 및 강조 처리
            if (gamService && gamService.burnCommentHighlight) {
                const result = await gamService.burnCommentHighlight(userId, commentId);
                
                if (result.success) {
                    res.json({
                        success: true,
                        message: '댓글이 24시간 동안 강조됩니다.'
                    });
                } else {
                    res.status(400).json({ error: result.message });
                }
            } else {
                // gamService가 없을 경우 직접 처리
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 24);
                
                await run(
                    'UPDATE comments SET is_highlighted = TRUE, highlight_expires_at = $1 WHERE id = $2',
                    [expiresAt.toISOString(), commentId]
                );
                
                res.json({
                    success: true,
                    message: '댓글이 24시간 동안 강조됩니다.'
                });
            }
        } catch (serviceError) {
            console.error('댓글 강조 구매 실패:', serviceError);
            res.status(500).json({ error: '댓글 강조 구매에 실패했습니다.' });
        }
        
    } catch (error) {
        console.error('댓글 강조 처리 실패:', error);
        res.status(500).json({ error: '댓글 강조 처리에 실패했습니다.' });
    }
});

// 댓글 삭제 (작성자만)
router.delete('/:commentId', async (req, res) => {
    const { commentId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }
    
    try {
        // 댓글 소유자 확인
        const commentQuery = 'SELECT user_id FROM comments WHERE id = $1';
        const comment = await get(commentQuery, [commentId]);
        
        if (!comment) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        
        if (comment.user_id !== parseInt(userId)) {
            return res.status(403).json({ error: '자신의 댓글만 삭제할 수 있습니다.' });
        }
        
        // 댓글 삭제 (소프트 삭제 - 내용만 변경)
        await run(
            'UPDATE comments SET content = $1, deleted_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['[삭제된 댓글]', commentId]
        );
        
        res.json({
            success: true,
            message: '댓글이 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('댓글 삭제 실패:', error);
        return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
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