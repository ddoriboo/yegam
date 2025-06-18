const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../database/init');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정 (이미지 업로드)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'issue-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
        }
    }
});

// 이미지 업로드 API
router.post('/upload', adminMiddleware, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '파일이 업로드되지 않았습니다.' });
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({
            success: true,
            imageUrl: imageUrl,
            message: '이미지가 성공적으로 업로드되었습니다.'
        });
    } catch (error) {
        console.error('이미지 업로드 실패:', error);
        res.status(500).json({ success: false, message: '이미지 업로드에 실패했습니다.' });
    }
});

// 모든 이슈 조회 (관리자용)
router.get('/issues', adminMiddleware, (req, res) => {
    const db = getDB();
    
    db.all('SELECT * FROM issues ORDER BY created_at DESC', (err, issues) => {
        if (err) {
            console.error('이슈 조회 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 조회에 실패했습니다.' });
        }
        
        res.json({ success: true, issues });
    });
});

// 이슈 생성
router.post('/issues', adminMiddleware, (req, res) => {
    const { title, category, description, image_url, yes_price = 50, end_date } = req.body;
    
    if (!title || !category || !end_date) {
        return res.status(400).json({ 
            success: false, 
            message: '제목, 카테고리, 마감일은 필수입니다.' 
        });
    }
    
    const db = getDB();
    
    db.run(`
        INSERT INTO issues (title, category, description, image_url, yes_price, end_date, is_popular)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    `, [title, category, description, image_url, yes_price, end_date], function(err) {
        if (err) {
            console.error('이슈 생성 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 생성에 실패했습니다.' });
        }
        
        const issueId = this.lastID;
        
        // 생성된 이슈 정보 반환
        db.get('SELECT * FROM issues WHERE id = ?', [issueId], (err, issue) => {
            if (err) {
                console.error('생성된 이슈 조회 실패:', err);
                return res.json({ success: true, message: '이슈가 생성되었습니다.', issueId });
            }
            
            res.json({
                success: true,
                message: '이슈가 성공적으로 생성되었습니다.',
                issue: issue
            });
        });
    });
});

// 이슈 수정
router.put('/issues/:id', adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, category, description, image_url, yes_price, end_date, is_popular } = req.body;
    
    if (!title || !category || !end_date) {
        return res.status(400).json({ 
            success: false, 
            message: '제목, 카테고리, 마감일은 필수입니다.' 
        });
    }
    
    const db = getDB();
    
    db.run(`
        UPDATE issues 
        SET title = ?, category = ?, description = ?, image_url = ?, 
            yes_price = ?, end_date = ?, is_popular = ?
        WHERE id = ?
    `, [title, category, description, image_url, yes_price, end_date, is_popular ? 1 : 0, id], function(err) {
        if (err) {
            console.error('이슈 수정 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 수정에 실패했습니다.' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
        }
        
        // 수정된 이슈 정보 반환
        db.get('SELECT * FROM issues WHERE id = ?', [id], (err, issue) => {
            if (err) {
                console.error('수정된 이슈 조회 실패:', err);
                return res.json({ success: true, message: '이슈가 수정되었습니다.' });
            }
            
            res.json({
                success: true,
                message: '이슈가 성공적으로 수정되었습니다.',
                issue: issue
            });
        });
    });
});

// 이슈 삭제
router.delete('/issues/:id', adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    
    // 이슈에 연관된 데이터 확인
    db.get('SELECT COUNT(*) as bet_count FROM bets WHERE issue_id = ?', [id], (err, result) => {
        if (err) {
            console.error('이슈 베팅 확인 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 삭제 확인에 실패했습니다.' });
        }
        
        if (result.bet_count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: '베팅이 있는 이슈는 삭제할 수 없습니다.' 
            });
        }
        
        // 이슈 삭제 (관련 댓글도 함께 삭제)
        db.run('DELETE FROM comments WHERE issue_id = ?', [id], (err) => {
            if (err) {
                console.error('이슈 댓글 삭제 실패:', err);
            }
            
            db.run('DELETE FROM issues WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('이슈 삭제 실패:', err);
                    return res.status(500).json({ success: false, message: '이슈 삭제에 실패했습니다.' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
                }
                
                res.json({
                    success: true,
                    message: '이슈가 성공적으로 삭제되었습니다.'
                });
            });
        });
    });
});

// 이슈 상태 토글 (인기 이슈 설정)
router.patch('/issues/:id/toggle-popular', adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    
    db.get('SELECT is_popular FROM issues WHERE id = ?', [id], (err, issue) => {
        if (err) {
            console.error('이슈 조회 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 조회에 실패했습니다.' });
        }
        
        if (!issue) {
            return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
        }
        
        const newPopularStatus = issue.is_popular ? 0 : 1;
        
        db.run('UPDATE issues SET is_popular = ? WHERE id = ?', [newPopularStatus, id], function(err) {
            if (err) {
                console.error('이슈 상태 업데이트 실패:', err);
                return res.status(500).json({ success: false, message: '이슈 상태 업데이트에 실패했습니다.' });
            }
            
            res.json({
                success: true,
                message: `이슈가 ${newPopularStatus ? '인기' : '일반'} 이슈로 설정되었습니다.`,
                is_popular: newPopularStatus
            });
        });
    });
});

module.exports = router;