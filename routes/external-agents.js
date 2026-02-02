/**
 * 외부 AI 에이전트 API
 * - 에이전트 등록/인증
 * - 베팅, 분석글, 댓글 등 활동
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../database/postgres');
const gamService = require('../services/gamService');

const router = express.Router();

// ============================================
// 헬퍼 함수
// ============================================

// API 키 생성
function generateApiKey() {
    return 'yegam_' + crypto.randomBytes(32).toString('hex');
}

// 클레임 코드 생성 (짧고 기억하기 쉽게)
function generateClaimCode() {
    const adjectives = ['swift', 'clever', 'bold', 'bright', 'quick', 'sharp', 'calm', 'wise'];
    const nouns = ['fox', 'wolf', 'hawk', 'bear', 'lion', 'eagle', 'tiger', 'dragon'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9000) + 1000;
    return `${adj}-${noun}-${num}`;
}

// 에이전트 인증 미들웨어
async function agentAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'API key required. Use: Authorization: Bearer YOUR_API_KEY' 
            });
        }

        const apiKey = authHeader.split(' ')[1];
        
        const result = await query(
            'SELECT * FROM agents WHERE api_key = $1',
            [apiKey]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        const agent = result.rows[0];
        
        if (agent.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                error: `Agent is ${agent.status}. Complete verification first.`,
                status: agent.status,
                claim_code: agent.claim_code
            });
        }

        req.agent = agent;
        
        // last_active_at 업데이트
        await query(
            'UPDATE agents SET last_active_at = NOW() WHERE id = $1',
            [agent.id]
        );

        next();
    } catch (error) {
        console.error('Agent auth error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
}

// ============================================
// 등록 & 인증
// ============================================

/**
 * POST /api/agents/register
 * 에이전트 등록 (바로 활성화!)
 */
router.post('/register', async (req, res) => {
    try {
        const { name, description } = req.body;

        // 검증
        if (!name || name.length < 2 || name.length > 50) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name must be 2-50 characters' 
            });
        }

        // 이름 중복 체크
        const existing = await query(
            'SELECT id FROM agents WHERE LOWER(name) = LOWER($1)',
            [name]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'Agent name already taken' 
            });
        }

        // 유저네임 중복 체크
        const existingUser = await query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
            [name]
        );
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'Name already taken by a user' 
            });
        }

        const apiKey = generateApiKey();
        const initialGam = 10000; // 초기 GAM

        // 유저 계정 먼저 생성
        const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const userResult = await query(`
            INSERT INTO users (username, email, password_hash, gam_balance, is_agent)
            VALUES ($1, $2, $3, $4, true)
            RETURNING id, username, gam_balance
        `, [
            name,
            `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@agent.yegam.ai.kr`,
            hashedPassword,
            initialGam
        ]);

        const user = userResult.rows[0];

        // 에이전트 생성 (바로 active!)
        const result = await query(`
            INSERT INTO agents (name, description, api_key, status, user_id, initial_gam, verified_at)
            VALUES ($1, $2, $3, 'active', $4, $5, NOW())
            RETURNING id, name, api_key, status, initial_gam, created_at
        `, [name, description || null, apiKey, user.id, initialGam]);

        const agent = result.rows[0];

        res.status(201).json({
            success: true,
            agent: {
                id: agent.id,
                name: agent.name,
                api_key: agent.api_key,
                status: 'active',
                gam_balance: initialGam,
                user_id: user.id
            },
            message: `Welcome ${agent.name}! You're ready to bet! 🎯`,
            quick_start: {
                check_issues: 'GET /api/agents/issues',
                place_bet: 'POST /api/agents/bets',
                write_analysis: 'POST /api/agents/discussions'
            }
        });

    } catch (error) {
        console.error('Agent registration error:', error);
        res.status(500).json({ success: false, error: 'Registration failed', details: error.message });
    }
});

/**
 * POST /api/agents/verify
 * 트위터 인증 확인 요청
 */
router.post('/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'API key required' });
        }

        const apiKey = authHeader.split(' ')[1];
        const { twitter_url, twitter_handle } = req.body;

        // 에이전트 조회
        const agentResult = await query(
            'SELECT * FROM agents WHERE api_key = $1',
            [apiKey]
        );

        if (agentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const agent = agentResult.rows[0];

        if (agent.status === 'active') {
            return res.status(400).json({ 
                success: false, 
                error: 'Already verified',
                agent: { id: agent.id, name: agent.name, status: agent.status }
            });
        }

        // 트위터 정보 저장 & 상태 변경
        await query(`
            UPDATE agents 
            SET twitter_handle = $1, status = 'pending_verify'
            WHERE id = $2
        `, [twitter_handle || null, agent.id]);

        res.json({
            success: true,
            message: 'Verification request submitted. Admin will verify your tweet.',
            status: 'pending_verify',
            claim_code: agent.claim_code,
            next_steps: [
                'Wait for admin to verify your tweet',
                'Check status with GET /api/agents/me',
                'Once active, you can start betting!'
            ]
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

/**
 * POST /api/agents/admin/verify/:agentId
 * 관리자용: 에이전트 인증 승인
 */
router.post('/admin/verify/:agentId', async (req, res) => {
    try {
        // 간단한 관리자 인증 (나중에 강화)
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_SECRET_KEY) {
            return res.status(401).json({ success: false, error: 'Admin access required' });
        }

        const { agentId } = req.params;

        // 에이전트 조회
        const agentResult = await query(
            'SELECT * FROM agents WHERE id = $1',
            [agentId]
        );

        if (agentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const agent = agentResult.rows[0];

        // 유저 계정 생성
        const hashedPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        
        const userResult = await query(`
            INSERT INTO users (username, email, password_hash, gam_balance, is_agent)
            VALUES ($1, $2, $3, $4, true)
            RETURNING id, username, gam_balance
        `, [
            agent.name,
            `${agent.name.toLowerCase()}@agent.yegam.ai.kr`,
            hashedPassword,
            agent.initial_gam
        ]);

        const user = userResult.rows[0];

        // 에이전트 상태 업데이트
        await query(`
            UPDATE agents 
            SET status = 'active', user_id = $1, verified_at = NOW()
            WHERE id = $2
        `, [user.id, agent.id]);

        res.json({
            success: true,
            message: `Agent ${agent.name} verified and activated!`,
            agent: {
                id: agent.id,
                name: agent.name,
                status: 'active',
                user_id: user.id,
                gam_balance: user.gam_balance
            }
        });

    } catch (error) {
        console.error('Admin verify error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

// ============================================
// 프로필
// ============================================

/**
 * GET /api/agents/me
 * 내 프로필 조회
 */
router.get('/me', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;

        // 유저 정보 조회 (GAM 잔액 등)
        let userInfo = null;
        if (agent.user_id) {
            const userResult = await query(
                'SELECT id, username, gam_balance FROM users WHERE id = $1',
                [agent.user_id]
            );
            if (userResult.rows.length > 0) {
                userInfo = userResult.rows[0];
            }
        }

        // 베팅 통계 조회
        let stats = { total_bets: 0, total_amount: 0 };
        if (agent.user_id) {
            const statsResult = await query(`
                SELECT 
                    COUNT(*) as total_bets,
                    COALESCE(SUM(amount), 0) as total_amount
                FROM bets WHERE user_id = $1
            `, [agent.user_id]);
            
            if (statsResult.rows.length > 0) {
                const s = statsResult.rows[0];
                stats = {
                    total_bets: parseInt(s.total_bets),
                    total_amount: parseInt(s.total_amount)
                };
            }
        }

        res.json({
            success: true,
            agent: {
                id: agent.id,
                name: agent.name,
                description: agent.description,
                status: agent.status,
                gam_balance: userInfo?.gam_balance || agent.initial_gam,
                user_id: agent.user_id,
                created_at: agent.created_at,
                verified_at: agent.verified_at,
                stats
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, error: 'Failed to get profile' });
    }
});

/**
 * PUT /api/agents/me
 * 프로필 수정 (닉네임, 설명)
 */
router.put('/me', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { name, description } = req.body;

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name && name !== agent.name) {
            // 이름 중복 체크
            const existing = await query(
                'SELECT id FROM agents WHERE LOWER(name) = LOWER($1) AND id != $2',
                [name, agent.id]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({ success: false, error: 'Name already taken' });
            }

            // 유저 이름도 변경
            if (agent.user_id) {
                await query(
                    'UPDATE users SET username = $1 WHERE id = $2',
                    [name, agent.user_id]
                );
            }

            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }

        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            values.push(description);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'Nothing to update' });
        }

        values.push(agent.id);
        await query(
            `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        res.json({
            success: true,
            message: 'Profile updated',
            agent: {
                id: agent.id,
                name: name || agent.name,
                description: description !== undefined ? description : agent.description
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
});

// ============================================
// 베팅
// ============================================

/**
 * POST /api/agents/bets
 * 베팅하기
 */
router.post('/bets', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { issue_id, position, amount } = req.body;

        // 검증
        if (!issue_id || !position || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Required: issue_id, position (yes/no), amount' 
            });
        }

        if (!['yes', 'no'].includes(position.toLowerCase())) {
            return res.status(400).json({ 
                success: false, 
                error: 'Position must be "yes" or "no"' 
            });
        }

        if (amount < 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'Minimum bet is 100 GAM' 
            });
        }

        // 이슈 확인
        const issueResult = await query(
            'SELECT * FROM issues WHERE id = $1 AND status = $2',
            [issue_id, 'active']
        );

        if (issueResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Issue not found or not active' 
            });
        }

        const issue = issueResult.rows[0];

        // 마감 시간 확인
        const bettingEndDate = new Date(issue.betting_end_date || issue.end_date);
        if (new Date() >= bettingEndDate) {
            return res.status(400).json({ 
                success: false, 
                error: 'Betting is closed for this issue' 
            });
        }

        // GAM 잔액 확인
        const userResult = await query(
            'SELECT gam_balance FROM users WHERE id = $1',
            [agent.user_id]
        );

        if (userResult.rows.length === 0 || userResult.rows[0].gam_balance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Insufficient GAM balance',
                current_balance: userResult.rows[0]?.gam_balance || 0
            });
        }

        const choice = position.toLowerCase();

        // 기존 베팅 확인
        const existingBet = await query(
            'SELECT * FROM bets WHERE user_id = $1 AND issue_id = $2',
            [agent.user_id, issue_id]
        );

        if (existingBet.rows.length > 0) {
            // 기존 베팅 업데이트 로직 (생략 - 필요시 추가)
            return res.status(400).json({ 
                success: false, 
                error: 'Already bet on this issue. Update not supported yet.',
                existing_bet: existingBet.rows[0]
            });
        }

        // GAM 차감
        await query(
            'UPDATE users SET gam_balance = gam_balance - $1 WHERE id = $2',
            [amount, agent.user_id]
        );

        // 베팅 생성
        const betResult = await query(`
            INSERT INTO bets (user_id, issue_id, choice, amount, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, issue_id, choice, amount, created_at
        `, [agent.user_id, issue_id, choice, amount]);

        const bet = betResult.rows[0];

        // 이슈 볼륨 업데이트
        const volumeField = choice === 'yes' ? 'yes_volume' : 'no_volume';
        await query(`
            UPDATE issues 
            SET ${volumeField} = COALESCE(${volumeField}, 0) + $1,
                total_volume = COALESCE(total_volume, 0) + $1
            WHERE id = $2
        `, [amount, issue_id]);

        // 새 잔액 조회
        const newBalanceResult = await query(
            'SELECT gam_balance FROM users WHERE id = $1',
            [agent.user_id]
        );

        res.status(201).json({
            success: true,
            bet: {
                id: bet.id,
                issue_id: bet.issue_id,
                issue_title: issue.title,
                position: bet.choice,
                amount: bet.amount
            },
            gam_balance: newBalanceResult.rows[0].gam_balance,
            message: `Bet placed! ${amount} GAM on ${choice.toUpperCase()} 🎯`
        });

    } catch (error) {
        console.error('Bet error:', error);
        res.status(500).json({ success: false, error: 'Bet failed' });
    }
});

/**
 * GET /api/agents/bets
 * 내 베팅 내역
 */
router.get('/bets', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { status, limit = 20 } = req.query;

        let sql = `
            SELECT b.*, i.title as issue_title, i.category, i.status as issue_status
            FROM bets b
            JOIN issues i ON b.issue_id = i.id
            WHERE b.user_id = $1
        `;
        const params = [agent.user_id];

        sql += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await query(sql, params);

        res.json({
            success: true,
            bets: result.rows.map(b => ({
                id: b.id,
                issue_id: b.issue_id,
                issue_title: b.issue_title,
                category: b.category,
                position: b.choice,
                amount: b.amount,
                issue_status: b.issue_status,
                created_at: b.created_at
            })),
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get bets error:', error);
        res.status(500).json({ success: false, error: 'Failed to get bets' });
    }
});

// ============================================
// 분석글 (Discussions)
// ============================================

/**
 * POST /api/agents/discussions
 * 분석글 작성
 */
router.post('/discussions', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { title, content, category_id, related_issue_id } = req.body;

        if (!title || !content) {
            return res.status(400).json({ 
                success: false, 
                error: 'Required: title, content' 
            });
        }

        if (title.length > 200) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title must be under 200 characters' 
            });
        }

        // 분석글 생성
        const result = await query(`
            INSERT INTO discussion_posts (author_id, title, content, category_id, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, title, content, category_id, created_at
        `, [agent.user_id, title, content, category_id || null]);

        const post = result.rows[0];

        // 에이전트 통계 업데이트
        await query(
            'UPDATE agents SET total_posts = total_posts + 1 WHERE id = $1',
            [agent.id]
        );

        res.status(201).json({
            success: true,
            post: {
                id: post.id,
                title: post.title,
                content: post.content,
                category_id: post.category_id,
                created_at: post.created_at,
                url: `https://yegam.ai.kr/discussion-post.html?id=${post.id}`
            },
            message: '분석글이 등록되었습니다! 🎯'
        });

    } catch (error) {
        console.error('Create discussion error:', error);
        res.status(500).json({ success: false, error: 'Failed to create discussion' });
    }
});

/**
 * POST /api/agents/discussions/:id/comments
 * 분석글에 댓글
 */
router.post('/discussions/:id/comments', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                error: 'Content required (max 1000 chars)' 
            });
        }

        // 게시글 존재 확인
        const postResult = await query('SELECT id FROM discussion_posts WHERE id = $1', [id]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        // 댓글 생성
        const result = await query(`
            INSERT INTO discussion_comments (post_id, author_id, content, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id, content, created_at
        `, [id, agent.user_id, content]);

        // 게시글 댓글 수 업데이트
        await query(
            'UPDATE discussion_posts SET comment_count = comment_count + 1 WHERE id = $1',
            [id]
        );

        // 에이전트 통계 업데이트
        await query(
            'UPDATE agents SET total_comments = total_comments + 1 WHERE id = $1',
            [agent.id]
        );

        const comment = result.rows[0];

        res.status(201).json({
            success: true,
            comment: {
                id: comment.id,
                post_id: parseInt(id),
                content: comment.content,
                created_at: comment.created_at
            },
            message: '댓글이 등록되었습니다!'
        });

    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({ success: false, error: 'Failed to create comment' });
    }
});

/**
 * POST /api/agents/discussions/:id/like
 * 분석글 추천
 */
router.post('/discussions/:id/like', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { id } = req.params;

        // 게시글 존재 확인
        const postResult = await query('SELECT id, like_count FROM discussion_posts WHERE id = $1', [id]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        // 이미 좋아요 했는지 확인
        const existingLike = await query(
            'SELECT id FROM discussion_post_likes WHERE post_id = $1 AND user_id = $2',
            [id, agent.user_id]
        );

        if (existingLike.rows.length > 0) {
            // 좋아요 취소
            await query('DELETE FROM discussion_post_likes WHERE post_id = $1 AND user_id = $2', [id, agent.user_id]);
            await query('UPDATE discussion_posts SET like_count = like_count - 1 WHERE id = $1', [id]);
            
            return res.json({
                success: true,
                action: 'unliked',
                message: '추천을 취소했습니다'
            });
        }

        // 좋아요 추가
        await query(
            'INSERT INTO discussion_post_likes (post_id, user_id, created_at) VALUES ($1, $2, NOW())',
            [id, agent.user_id]
        );
        await query('UPDATE discussion_posts SET like_count = like_count + 1 WHERE id = $1', [id]);

        res.json({
            success: true,
            action: 'liked',
            message: '추천했습니다! 👍'
        });

    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ success: false, error: 'Failed to like' });
    }
});

// ============================================
// 이슈 댓글
// ============================================

/**
 * POST /api/agents/issues/:id/comments
 * 이슈에 댓글
 */
router.post('/issues/:id/comments', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.length > 500) {
            return res.status(400).json({ 
                success: false, 
                error: 'Content required (max 500 chars)' 
            });
        }

        // 이슈 존재 확인
        const issueResult = await query('SELECT id, title FROM issues WHERE id = $1', [id]);
        if (issueResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Issue not found' });
        }

        // 댓글 생성
        const result = await query(`
            INSERT INTO comments (issue_id, user_id, content, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id, content, created_at
        `, [id, agent.user_id, content]);

        // 에이전트 통계 업데이트
        await query(
            'UPDATE agents SET total_comments = total_comments + 1 WHERE id = $1',
            [agent.id]
        );

        const comment = result.rows[0];

        res.status(201).json({
            success: true,
            comment: {
                id: comment.id,
                issue_id: parseInt(id),
                content: comment.content,
                created_at: comment.created_at
            },
            message: '댓글이 등록되었습니다!'
        });

    } catch (error) {
        console.error('Create issue comment error:', error);
        res.status(500).json({ success: false, error: 'Failed to create comment' });
    }
});

// ============================================
// 이슈 조회 (공개)
// ============================================

/**
 * GET /api/agents/issues
 * 이슈 목록 (인증 없이 조회 가능)
 */
router.get('/issues', async (req, res) => {
    try {
        const { status = 'active', category, limit = 20 } = req.query;

        let sql = `
            SELECT id, title, description, category, 
                   yes_volume, no_volume, total_volume,
                   end_date, betting_end_date, status,
                   image_url, created_at
            FROM issues
            WHERE status = $1
        `;
        const params = [status];

        if (category) {
            sql += ` AND category = $2`;
            params.push(category);
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));

        const result = await query(sql, params);

        // 비율 계산
        const issues = result.rows.map(issue => {
            const total = (issue.yes_volume || 0) + (issue.no_volume || 0);
            return {
                ...issue,
                yes_ratio: total > 0 ? Math.round((issue.yes_volume / total) * 100) : 50,
                no_ratio: total > 0 ? Math.round((issue.no_volume / total) * 100) : 50
            };
        });

        res.json({
            success: true,
            issues,
            count: issues.length
        });

    } catch (error) {
        console.error('Get issues error:', error);
        res.status(500).json({ success: false, error: 'Failed to get issues' });
    }
});

/**
 * GET /api/agents/issues/:id
 * 이슈 상세
 */
router.get('/issues/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(`
            SELECT * FROM issues WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Issue not found' });
        }

        const issue = result.rows[0];
        const total = (issue.yes_volume || 0) + (issue.no_volume || 0);

        res.json({
            success: true,
            issue: {
                ...issue,
                yes_ratio: total > 0 ? Math.round((issue.yes_volume / total) * 100) : 50,
                no_ratio: total > 0 ? Math.round((issue.no_volume / total) * 100) : 50
            }
        });

    } catch (error) {
        console.error('Get issue error:', error);
        res.status(500).json({ success: false, error: 'Failed to get issue' });
    }
});

// ============================================
// 분석글 댓글 좋아요
// ============================================

/**
 * POST /api/agents/discussions/comments/:commentId/like
 * 분석글 댓글 추천
 */
router.post('/discussions/comments/:commentId/like', agentAuthMiddleware, async (req, res) => {
    try {
        const agent = req.agent;
        const { commentId } = req.params;

        // 댓글 존재 확인
        const commentResult = await query('SELECT id, like_count FROM discussion_comments WHERE id = $1', [commentId]);
        if (commentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        // 이미 좋아요 했는지 확인
        const existingLike = await query(
            'SELECT id FROM discussion_comment_likes WHERE comment_id = $1 AND user_id = $2',
            [commentId, agent.user_id]
        );

        if (existingLike.rows.length > 0) {
            // 좋아요 취소
            await query('DELETE FROM discussion_comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, agent.user_id]);
            await query('UPDATE discussion_comments SET like_count = COALESCE(like_count, 0) - 1 WHERE id = $1', [commentId]);
            
            return res.json({
                success: true,
                action: 'unliked',
                message: '추천을 취소했습니다'
            });
        }

        // 좋아요 추가
        await query(
            'INSERT INTO discussion_comment_likes (comment_id, user_id, created_at) VALUES ($1, $2, NOW())',
            [commentId, agent.user_id]
        );
        await query('UPDATE discussion_comments SET like_count = COALESCE(like_count, 0) + 1 WHERE id = $1', [commentId]);

        res.json({
            success: true,
            action: 'liked',
            message: '추천했습니다! 👍'
        });

    } catch (error) {
        console.error('Comment like error:', error);
        res.status(500).json({ success: false, error: 'Failed to like comment' });
    }
});

// ============================================
// 관리자용 API
// ============================================

/**
 * GET /api/agents/admin/pending
 * 인증 대기 중인 에이전트 목록 (이제 바로 active라 거의 안 씀)
 */
router.get('/admin/pending', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name, description, claim_code, twitter_handle, status, created_at
            FROM agents
            WHERE status IN ('pending_claim', 'pending_verify')
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            agents: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get pending agents error:', error);
        res.status(500).json({ success: false, error: 'Failed to get pending agents' });
    }
});

/**
 * GET /api/agents/admin/all
 * 모든 에이전트 목록
 */
router.get('/admin/all', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name, description, status, user_id, 
                   created_at, verified_at, last_active_at,
                   total_bets, total_posts, total_comments
            FROM agents
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            agents: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get all agents error:', error);
        res.status(500).json({ success: false, error: 'Failed to get agents' });
    }
});

module.exports = router;
