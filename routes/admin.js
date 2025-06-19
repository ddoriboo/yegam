const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../database/database');
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

// 결과 관리용 이슈 조회 (마감된 이슈만)
router.get('/issues/closed', adminMiddleware, (req, res) => {
    const { filter = 'closed' } = req.query;
    const db = getDB();
    
    let query = '';
    let params = [];
    
    switch (filter) {
        case 'closed':
            query = `SELECT *, 
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id) as bet_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_count,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_volume,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_volume
                     FROM issues 
                     WHERE (status = 'closed' OR end_date < datetime('now')) AND result IS NULL 
                     ORDER BY end_date ASC`;
            break;
        case 'pending':
            query = `SELECT *, 
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id) as bet_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_count,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_volume,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_volume
                     FROM issues 
                     WHERE status = 'pending' 
                     ORDER BY end_date ASC`;
            break;
        case 'resolved':
            query = `SELECT *, 
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id) as bet_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_count,
                        (SELECT COUNT(*) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_count,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'Yes') as yes_volume,
                        (SELECT SUM(amount) FROM bets WHERE issue_id = issues.id AND choice = 'No') as no_volume,
                        (SELECT username FROM users WHERE id = issues.decided_by) as decided_by_name
                     FROM issues 
                     WHERE result IS NOT NULL 
                     ORDER BY decided_at DESC`;
            break;
    }
    
    db.all(query, params, (err, issues) => {
        if (err) {
            console.error('결과 관리용 이슈 조회 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 조회에 실패했습니다.' });
        }
        
        res.json({ success: true, issues });
    });
});

// 이슈 결과 설정 및 보상 지급
router.post('/issues/:id/result', adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { result, reason } = req.body;
    const adminId = req.user.id;
    
    if (!result || !reason) {
        return res.status(400).json({ 
            success: false, 
            message: '결과와 사유는 필수입니다.' 
        });
    }
    
    if (!['Yes', 'No', 'Draw', 'Cancelled'].includes(result)) {
        return res.status(400).json({ 
            success: false, 
            message: '유효하지 않은 결과입니다.' 
        });
    }
    
    const db = getDB();
    
    try {
        // 트랜잭션 시작
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // 이슈 정보 조회
        const issue = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM issues WHERE id = ?', [id], (err, issue) => {
                if (err) reject(err);
                else resolve(issue);
            });
        });
        
        if (!issue) {
            await new Promise((resolve) => db.run('ROLLBACK', resolve));
            return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
        }
        
        if (issue.result !== null) {
            await new Promise((resolve) => db.run('ROLLBACK', resolve));
            return res.status(400).json({ success: false, message: '이미 결과가 확정된 이슈입니다.' });
        }
        
        // 이슈 결과 업데이트
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE issues 
                SET result = ?, decided_by = ?, decided_at = datetime('now'), 
                    decision_reason = ?, status = 'resolved'
                WHERE id = ?
            `, [result, adminId, reason, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // 베팅 정보 조회
        const bets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM bets WHERE issue_id = ?', [id], (err, bets) => {
                if (err) reject(err);
                else resolve(bets);
            });
        });
        
        // 보상 계산 및 지급
        if (result === 'Yes' || result === 'No') {
            const winningBets = bets.filter(bet => bet.choice === result);
            const totalPool = bets.reduce((sum, bet) => sum + bet.amount, 0);
            const totalWinningAmount = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
            
            if (totalWinningAmount > 0) {
                const houseEdge = 0.05; // 5% 수수료
                const rewardPool = totalPool * (1 - houseEdge);
                
                for (const bet of winningBets) {
                    const userReward = Math.floor((bet.amount / totalWinningAmount) * rewardPool);
                    
                    // 사용자 잔액 업데이트
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE users SET coins = coins + ? WHERE id = ?',
                            [userReward, bet.user_id],
                            function(err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    
                    // 보상 기록 저장
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO rewards (user_id, issue_id, bet_id, reward_amount) VALUES (?, ?, ?, ?)',
                            [bet.user_id, id, bet.id, userReward],
                            function(err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }
            }
        } else if (result === 'Draw' || result === 'Cancelled') {
            // 무승부 또는 취소시 모든 베팅 금액 반환
            for (const bet of bets) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET coins = coins + ? WHERE id = ?',
                        [bet.amount, bet.user_id],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                
                // 환불 기록 저장
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO rewards (user_id, issue_id, bet_id, reward_amount) VALUES (?, ?, ?, ?)',
                        [bet.user_id, id, bet.id, bet.amount],
                        function(err) {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }
        
        // 트랜잭션 커밋
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({
            success: true,
            message: `이슈 결과가 '${result}'로 확정되었습니다. 보상이 지급되었습니다.`,
            result: {
                issueId: id,
                result: result,
                reason: reason,
                decidedBy: adminId,
                rewardedUsers: bets.length
            }
        });
        
    } catch (error) {
        // 에러 발생시 롤백
        await new Promise((resolve) => db.run('ROLLBACK', resolve));
        console.error('이슈 결과 처리 실패:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 결과 처리 중 오류가 발생했습니다.' 
        });
    }
});

// 이슈 수동 마감
router.post('/issues/:id/close', adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    
    db.run('UPDATE issues SET status = "closed" WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('이슈 마감 실패:', err);
            return res.status(500).json({ success: false, message: '이슈 마감에 실패했습니다.' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
        }
        
        res.json({
            success: true,
            message: '이슈가 수동으로 마감되었습니다.'
        });
    });
});

module.exports = router;