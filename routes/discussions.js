const express = require('express');
const { query } = require('../database/postgres');
const { authMiddleware } = require('../middleware/auth');
const { secureAdminMiddleware } = require('../middleware/admin-auth-secure');

const router = express.Router();

// 카테고리 조회
router.get('/categories', async (req, res) => {
    try {
        const categoriesResult = await query(
            'SELECT * FROM discussion_categories WHERE is_active = true ORDER BY display_order, name'
        );
        
        res.json({
            success: true,
            data: categoriesResult.rows
        });
        
    } catch (error) {
        console.error('[토론 카테고리] 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '카테고리 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 목록 조회 (카테고리별, 페이지네이션)
router.get('/posts', async (req, res) => {
    try {
        const { 
            category_id, 
            page = 1, 
            limit = 20, 
            sort = 'latest',
            search,
            min_likes
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        let orderClause = 'p.created_at DESC';
        let params = [];
        let paramIndex = 1;
        
        // 카테고리 필터
        if (category_id && category_id !== 'all') {
            whereClause += ` AND p.category_id = $${paramIndex}`;
            params.push(category_id);
            paramIndex++;
        }
        
        // 검색
        if (search && search.trim()) {
            whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.content ILIKE $${paramIndex})`;
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        
        // 최소 좋아요 수 필터 (개념글)
        if (min_likes && !isNaN(min_likes)) {
            whereClause += ` AND p.like_count >= $${paramIndex}`;
            params.push(parseInt(min_likes));
            paramIndex++;
        }
        
        // 정렬
        switch (sort) {
            case 'popular':
                orderClause = 'p.like_count DESC, p.created_at DESC';
                break;
            case 'discussed':
                orderClause = 'p.comment_count DESC, p.created_at DESC';
                break;
            case 'viewed':
                orderClause = 'p.view_count DESC, p.created_at DESC';
                break;
            default:
                orderClause = 'p.is_notice DESC, p.is_pinned DESC, p.created_at DESC';
        }
        
        // 총 게시글 수 조회
        const countQuery = `
            SELECT COUNT(*) as total
            FROM discussion_posts p
            WHERE ${whereClause}
        `;
        
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        // 게시글 목록 조회
        const postsQuery = `
            SELECT 
                p.id,
                p.title,
                p.category_id,
                p.is_notice,
                p.is_pinned,
                p.view_count,
                p.like_count,
                p.comment_count,
                p.created_at,
                p.updated_at,
                p.media_urls,
                p.media_types,
                u.username as author_name,
                c.name as category_name,
                c.color as category_color,
                c.icon as category_icon,
                SUBSTRING(p.content, 1, 200) as content_preview
            FROM discussion_posts p
            LEFT JOIN users u ON p.author_id = u.id
            LEFT JOIN discussion_categories c ON p.category_id = c.id
            WHERE ${whereClause}
            ORDER BY ${orderClause}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        params.push(limit, offset);
        const postsResult = await query(postsQuery, params);
        
        res.json({
            success: true,
            data: {
                posts: postsResult.rows,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('[토론 게시글] 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 목록 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 상세 조회
router.get('/posts/:id', async (req, res) => {
    try {
        const postId = req.params.id;
        
        // 조회수 증가
        await query(
            'UPDATE discussion_posts SET view_count = view_count + 1 WHERE id = $1',
            [postId]
        );
        
        // 게시글 정보 조회
        const postResult = await query(`
            SELECT 
                p.*,
                u.username as author_name,
                c.name as category_name,
                c.color as category_color,
                c.icon as category_icon
            FROM discussion_posts p
            LEFT JOIN users u ON p.author_id = u.id
            LEFT JOIN discussion_categories c ON p.category_id = c.id
            WHERE p.id = $1
        `, [postId]);
        
        if (postResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }
        
        const post = postResult.rows[0];
        
        // 좋아요 여부 확인 (로그인한 경우)
        let userLiked = false;
        if (req.user) {
            const likeResult = await query(
                'SELECT id FROM discussion_post_likes WHERE post_id = $1 AND user_id = $2',
                [postId, req.user.id]
            );
            userLiked = likeResult.rows.length > 0;
        }
        
        res.json({
            success: true,
            data: {
                ...post,
                user_liked: userLiked
            }
        });
        
    } catch (error) {
        console.error('[토론 게시글] 상세 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 작성
router.post('/posts', authMiddleware, async (req, res) => {
    try {
        const { title, content, category_id, media_urls, media_types } = req.body;
        const userId = req.user.id;
        
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: '제목과 내용을 모두 입력해주세요.'
            });
        }
        
        if (title.length > 200) {
            return res.status(400).json({
                success: false,
                message: '제목은 200자 이내로 입력해주세요.'
            });
        }
        
        // 미디어 URL 처리
        let mediaUrlsArray = null;
        let mediaTypesArray = null;
        
        if (media_urls && Array.isArray(media_urls) && media_urls.length > 0) {
            mediaUrlsArray = media_urls.filter(url => url && url.trim());
            mediaTypesArray = media_types || mediaUrlsArray.map(() => 'unknown');
            
            // 최대 5개까지만 허용
            if (mediaUrlsArray.length > 5) {
                return res.status(400).json({
                    success: false,
                    message: '미디어는 최대 5개까지만 첨부할 수 있습니다.'
                });
            }
        }
        
        const result = await query(`
            INSERT INTO discussion_posts (title, content, category_id, author_id, media_urls, media_types)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [title, content, category_id, userId, mediaUrlsArray, mediaTypesArray]);
        
        const postId = result.rows[0].id;
        
        res.json({
            success: true,
            message: '게시글이 성공적으로 작성되었습니다.',
            data: { post_id: postId }
        });
        
    } catch (error) {
        console.error('[토론 게시글] 작성 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 작성 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 공지글 작성 (관리자 전용)
router.post('/posts/notice', secureAdminMiddleware, async (req, res) => {
    try {
        const { title, content, category_id, is_pinned = false, media_urls, media_types } = req.body;
        const adminId = req.admin.id;
        
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: '제목과 내용을 모두 입력해주세요.'
            });
        }
        
        // 미디어 URL 처리
        let mediaUrlsArray = null;
        let mediaTypesArray = null;
        
        if (media_urls && Array.isArray(media_urls) && media_urls.length > 0) {
            mediaUrlsArray = media_urls.filter(url => url && url.trim());
            mediaTypesArray = media_types || mediaUrlsArray.map(() => 'unknown');
        }
        
        // 관리자의 user_id 조회 (게시글 작성자로 사용)
        const adminUserResult = await query(
            'SELECT id FROM users WHERE email = $1 LIMIT 1',
            ['admin@yegam.com']
        );
        
        const authorId = adminUserResult.rows[0]?.id || 1; // 기본값
        
        const result = await query(`
            INSERT INTO discussion_posts (title, content, category_id, author_id, is_notice, is_pinned, media_urls, media_types)
            VALUES ($1, $2, $3, $4, true, $5, $6, $7)
            RETURNING id
        `, [title, content, category_id, authorId, is_pinned, mediaUrlsArray, mediaTypesArray]);
        
        const postId = result.rows[0].id;
        
        res.json({
            success: true,
            message: '공지글이 성공적으로 작성되었습니다.',
            data: { post_id: postId }
        });
        
    } catch (error) {
        console.error('[토론 공지글] 작성 오류:', error);
        res.status(500).json({
            success: false,
            message: '공지글 작성 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 수정
router.put('/posts/:id', authMiddleware, async (req, res) => {
    try {
        const postId = req.params.id;
        const { title, content, category_id } = req.body;
        const userId = req.user.id;
        
        // 게시글 작성자 확인
        const postResult = await query(
            'SELECT author_id FROM discussion_posts WHERE id = $1',
            [postId]
        );
        
        if (postResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }
        
        // 관리자 권한 확인 (legacy admin system)
        let isAdmin = false;
        try {
            const adminResult = await query(
                'SELECT id FROM admins WHERE user_id = $1',
                [userId]
            );
            isAdmin = adminResult.rows.length > 0;
        } catch (error) {
            console.log('관리자 확인 중 오류 (무시됨):', error.message);
        }
        
        // 작성자이거나 관리자인 경우에만 수정 가능
        if (postResult.rows[0].author_id !== userId && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: '게시글을 수정할 권한이 없습니다.'
            });
        }
        
        await query(`
            UPDATE discussion_posts 
            SET title = $1, content = $2, category_id = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [title, content, category_id, postId]);
        
        res.json({
            success: true,
            message: '게시글이 성공적으로 수정되었습니다.'
        });
        
    } catch (error) {
        console.error('[토론 게시글] 수정 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 수정 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 삭제
router.delete('/posts/:id', authMiddleware, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        
        // 게시글 작성자 확인
        const postResult = await query(
            'SELECT author_id FROM discussion_posts WHERE id = $1',
            [postId]
        );
        
        if (postResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }
        
        // 관리자 권한 확인 (legacy admin system)
        let isAdmin = false;
        try {
            const adminResult = await query(
                'SELECT id FROM admins WHERE user_id = $1',
                [userId]
            );
            isAdmin = adminResult.rows.length > 0;
        } catch (error) {
            console.log('관리자 확인 중 오류 (무시됨):', error.message);
        }
        
        // 작성자이거나 관리자인 경우에만 삭제 가능
        if (postResult.rows[0].author_id !== userId && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: '게시글을 삭제할 권한이 없습니다.'
            });
        }
        
        await query('DELETE FROM discussion_posts WHERE id = $1', [postId]);
        
        res.json({
            success: true,
            message: '게시글이 성공적으로 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('[토론 게시글] 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 게시글 좋아요/취소
router.post('/posts/:id/like', authMiddleware, async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user.id;
        
        // 기존 좋아요 확인
        const existingLike = await query(
            'SELECT id FROM discussion_post_likes WHERE post_id = $1 AND user_id = $2',
            [postId, userId]
        );
        
        if (existingLike.rows.length > 0) {
            // 좋아요 취소
            await query(
                'DELETE FROM discussion_post_likes WHERE post_id = $1 AND user_id = $2',
                [postId, userId]
            );
            
            res.json({
                success: true,
                message: '좋아요를 취소했습니다.',
                liked: false
            });
        } else {
            // 좋아요 추가
            await query(
                'INSERT INTO discussion_post_likes (post_id, user_id) VALUES ($1, $2)',
                [postId, userId]
            );
            
            res.json({
                success: true,
                message: '좋아요를 추가했습니다.',
                liked: true
            });
        }
        
    } catch (error) {
        console.error('[토론 게시글] 좋아요 오류:', error);
        res.status(500).json({
            success: false,
            message: '좋아요 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 댓글 목록 조회
router.get('/posts/:id/comments', async (req, res) => {
    try {
        const postId = req.params.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        const commentsResult = await query(`
            SELECT 
                c.id,
                c.content,
                c.parent_id,
                c.like_count,
                c.created_at,
                c.updated_at,
                u.username as author_name
            FROM discussion_comments c
            LEFT JOIN users u ON c.author_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.created_at ASC
            LIMIT $2 OFFSET $3
        `, [postId, limit, offset]);
        
        // 총 댓글 수
        const countResult = await query(
            'SELECT COUNT(*) as total FROM discussion_comments WHERE post_id = $1',
            [postId]
        );
        
        const total = parseInt(countResult.rows[0].total);
        
        res.json({
            success: true,
            data: {
                comments: commentsResult.rows,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });
        
    } catch (error) {
        console.error('[토론 댓글] 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 목록 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 댓글 작성
router.post('/posts/:id/comments', authMiddleware, async (req, res) => {
    try {
        const postId = req.params.id;
        const { content, parent_id } = req.body;
        const userId = req.user.id;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '댓글 내용을 입력해주세요.'
            });
        }
        
        const result = await query(`
            INSERT INTO discussion_comments (post_id, author_id, content, parent_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [postId, userId, content.trim(), parent_id || null]);
        
        const commentId = result.rows[0].id;
        
        res.json({
            success: true,
            message: '댓글이 성공적으로 작성되었습니다.',
            data: { comment_id: commentId }
        });
        
    } catch (error) {
        console.error('[토론 댓글] 작성 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 작성 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 댓글 좋아요/취소
router.post('/comments/:id/like', authMiddleware, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user.id;
        
        // 기존 좋아요 확인
        const existingLike = await query(
            'SELECT id FROM discussion_comment_likes WHERE comment_id = $1 AND user_id = $2',
            [commentId, userId]
        );
        
        if (existingLike.rows.length > 0) {
            // 좋아요 취소
            await query(
                'DELETE FROM discussion_comment_likes WHERE comment_id = $1 AND user_id = $2',
                [commentId, userId]
            );
            
            res.json({
                success: true,
                message: '좋아요를 취소했습니다.',
                liked: false
            });
        } else {
            // 좋아요 추가
            await query(
                'INSERT INTO discussion_comment_likes (comment_id, user_id) VALUES ($1, $2)',
                [commentId, userId]
            );
            
            res.json({
                success: true,
                message: '좋아요를 추가했습니다.',
                liked: true
            });
        }
        
    } catch (error) {
        console.error('[토론 댓글] 좋아요 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 좋아요 처리 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;