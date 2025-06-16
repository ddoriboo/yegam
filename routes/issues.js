const express = require('express');
const { getDB } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 모든 이슈 조회
router.get('/', (req, res) => {
    const db = getDB();
    
    db.all('SELECT * FROM issues WHERE status = "active" ORDER BY created_at DESC', (err, issues) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '이슈를 불러오는 중 오류가 발생했습니다.' 
            });
        }
        
        res.json({
            success: true,
            issues: issues.map(issue => ({
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }))
        });
    });
});

// 특정 이슈 조회
router.get('/:id', (req, res) => {
    const db = getDB();
    const issueId = req.params.id;
    
    db.get('SELECT * FROM issues WHERE id = ? AND status = "active"', [issueId], (err, issue) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '이슈를 불러오는 중 오류가 발생했습니다.' 
            });
        }
        
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
    });
});

// 새 이슈 생성 (관리자용)
router.post('/', authMiddleware, (req, res) => {
    const { title, category, endDate, yesPrice, isPopular } = req.body;
    
    if (!title || !category || !endDate) {
        return res.status(400).json({ 
            success: false, 
            message: '필수 필드를 모두 입력해주세요.' 
        });
    }
    
    const db = getDB();
    
    db.run('INSERT INTO issues (title, category, end_date, yes_price, is_popular) VALUES (?, ?, ?, ?, ?)', 
        [title, category, endDate, yesPrice || 50, isPopular ? 1 : 0], 
        function(err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: '이슈 생성 중 오류가 발생했습니다.' 
                });
            }
            
            res.json({
                success: true,
                message: '이슈가 성공적으로 생성되었습니다.',
                issueId: this.lastID
            });
        }
    );
});

// 이슈 수정 (관리자용)
router.put('/:id', authMiddleware, (req, res) => {
    const issueId = req.params.id;
    const { title, category, endDate, yesPrice, isPopular } = req.body;
    
    const db = getDB();
    
    db.run('UPDATE issues SET title = ?, category = ?, end_date = ?, yes_price = ?, is_popular = ? WHERE id = ?', 
        [title, category, endDate, yesPrice, isPopular ? 1 : 0, issueId], 
        function(err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: '이슈 수정 중 오류가 발생했습니다.' 
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: '존재하지 않는 이슈입니다.' 
                });
            }
            
            res.json({
                success: true,
                message: '이슈가 성공적으로 수정되었습니다.'
            });
        }
    );
});

// 이슈 삭제 (관리자용)
router.delete('/:id', authMiddleware, (req, res) => {
    const issueId = req.params.id;
    const db = getDB();
    
    db.run('UPDATE issues SET status = "deleted" WHERE id = ?', [issueId], function(err) {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '이슈 삭제 중 오류가 발생했습니다.' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 삭제되었습니다.'
        });
    });
});

// 인기 이슈 토글 (관리자용)
router.patch('/:id/toggle-popular', authMiddleware, (req, res) => {
    const issueId = req.params.id;
    const db = getDB();
    
    // 현재 상태 확인 후 토글
    db.get('SELECT is_popular FROM issues WHERE id = ?', [issueId], (err, issue) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '이슈 조회 중 오류가 발생했습니다.' 
            });
        }
        
        if (!issue) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        const newPopularStatus = issue.is_popular ? 0 : 1;
        
        db.run('UPDATE issues SET is_popular = ? WHERE id = ?', [newPopularStatus, issueId], function(err) {
            if (err) {
                return res.status(500).json({ 
                    success: false, 
                    message: '이슈 수정 중 오류가 발생했습니다.' 
                });
            }
            
            res.json({
                success: true,
                message: `이슈가 ${newPopularStatus ? '인기' : '일반'} 이슈로 변경되었습니다.`,
                isPopular: Boolean(newPopularStatus)
            });
        });
    });
});

module.exports = router;