const express = require('express');
const { query, run, get } = require('../database/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 모든 이슈 조회
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM issues WHERE status = $1 ORDER BY created_at DESC', ['active']);
        const issues = result.rows;
        
        res.json({
            success: true,
            issues: issues.map(issue => ({
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }))
        });
    } catch (error) {
        console.error('이슈 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 특정 이슈 조회
router.get('/:id', async (req, res) => {
    try {
        const issueId = req.params.id;
        const issue = await get('SELECT * FROM issues WHERE id = $1 AND status = $2', [issueId, 'active']);
        
        if (!issue) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        res.json({
            success: true,
            issue: {
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }
        });
    } catch (error) {
        console.error('이슈 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 새 이슈 생성 (관리자용)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, category, description, imageUrl, endDate, yesPrice, isPopular } = req.body;
        
        if (!title || !category || !endDate) {
            return res.status(400).json({ 
                success: false, 
                message: '필수 필드를 모두 입력해주세요.' 
            });
        }
        
        const insertQuery = `
            INSERT INTO issues (title, category, description, image_url, end_date, yes_price, is_popular) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;
        
        const result = await query(insertQuery, [
            title, 
            category, 
            description || null, 
            imageUrl || null, 
            endDate, 
            yesPrice || 50, 
            isPopular ? true : false
        ]);
        
        const issueId = result.rows[0]?.id || result.lastID;
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 생성되었습니다.',
            issueId
        });
    } catch (error) {
        console.error('이슈 생성 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 생성 중 오류가 발생했습니다.' 
        });
    }
});

// 이슈 수정 (관리자용)
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const issueId = req.params.id;
        const { title, category, description, imageUrl, endDate, yesPrice, isPopular } = req.body;
        
        const updateQuery = `
            UPDATE issues 
            SET title = $1, category = $2, description = $3, image_url = $4, 
                end_date = $5, yes_price = $6, is_popular = $7, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $8
        `;
        
        const result = await run(updateQuery, [
            title, 
            category, 
            description || null, 
            imageUrl || null, 
            endDate, 
            yesPrice, 
            isPopular ? true : false, 
            issueId
        ]);
        
        if (result.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 수정되었습니다.'
        });
    } catch (error) {
        console.error('이슈 수정 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 수정 중 오류가 발생했습니다.' 
        });
    }
});

// 이슈 삭제 (관리자용)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const issueId = req.params.id;
        
        const result = await run('UPDATE issues SET status = $1 WHERE id = $2', ['deleted', issueId]);
        
        if (result.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('이슈 삭제 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 삭제 중 오류가 발생했습니다.' 
        });
    }
});

// 인기 이슈 토글 (관리자용)
router.patch('/:id/toggle-popular', authMiddleware, async (req, res) => {
    try {
        const issueId = req.params.id;
        
        // 현재 상태 확인 후 토글
        const issue = await get('SELECT is_popular FROM issues WHERE id = $1', [issueId]);
        
        if (!issue) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        const newPopularStatus = !issue.is_popular;
        
        await run('UPDATE issues SET is_popular = $1 WHERE id = $2', [newPopularStatus, issueId]);
        
        res.json({
            success: true,
            message: `이슈가 ${newPopularStatus ? '인기' : '일반'} 이슈로 변경되었습니다.`,
            isPopular: newPopularStatus
        });
    } catch (error) {
        console.error('이슈 토글 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 수정 중 오류가 발생했습니다.' 
        });
    }
});

module.exports = router;