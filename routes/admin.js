const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, getCurrentTimeSQL, query, get, run } = require('../database/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { secureAdminMiddleware, requireAdminRole, requirePermission } = require('../middleware/admin-auth-secure');
const NotificationService = require('../services/notificationService');
const {
    logIssueModification,
    validateDeadlineChange,
    rateLimitIssueModifications
} = require('../middleware/simple-issue-audit');
const {
    logDeadlineChange,
    logIssueCreation,
    logStatusChange,
    detectRapidDeadlineChanges
} = require('../utils/issue-logger');

// ⚠️ 위험한 tempAdminMiddleware 제거됨 - secureAdminMiddleware로 대체됨
const issueScheduler = require('../services/scheduler');

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
router.post('/upload', secureAdminMiddleware, requirePermission('upload_files'), upload.single('image'), (req, res) => {
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
router.get('/issues', secureAdminMiddleware, requirePermission('view_issues'), async (req, res) => {
    try {
        const result = await query('SELECT * FROM issues ORDER BY created_at DESC');
        const issues = result.rows;
        
        res.json({
            success: true,
            issues: issues.map(issue => ({
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }))
        });
    } catch (error) {
        console.error('이슈 조회 실패:', error);
        res.status(500).json({ success: false, message: '이슈 조회에 실패했습니다.' });
    }
});

// 이슈 생성
router.post('/issues', 
    secureAdminMiddleware, 
    requirePermission('create_issue'),
    rateLimitIssueModifications(),
    logIssueModification('ADMIN_CREATE_ISSUE'),
    async (req, res) => {
    try {
        const { title, category, description, image_url, yes_price = 50, end_date, is_popular = false } = req.body;
        
        if (!title || !category || !end_date) {
            return res.status(400).json({ 
                success: false, 
                message: '제목, 카테고리, 마감일은 필수입니다.' 
            });
        }
        
        // end_date가 이미 UTC ISO string으로 전달되므로 직접 사용
        const result = await query(`
            INSERT INTO issues (title, category, description, image_url, yes_price, end_date, is_popular, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, NOW(), NOW())
            RETURNING *
        `, [title, category, description, image_url, yes_price, end_date, is_popular]);
        
        const issue = result.rows[0];
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 생성되었습니다.',
            issue: {
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }
        });
    } catch (error) {
        console.error('이슈 생성 실패:', error);
        res.status(500).json({ success: false, message: '이슈 생성에 실패했습니다.' });
    }
});

// 이슈 수정
router.put('/issues/:id', 
    secureAdminMiddleware,
    rateLimitIssueModifications(),
    validateDeadlineChange(),
    logIssueModification('ADMIN_UPDATE_ISSUE'),
    async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, description, image_url, yes_price, end_date, is_popular } = req.body;
        
        if (!title || !category || !end_date) {
            return res.status(400).json({ 
                success: false, 
                message: '제목, 카테고리, 마감일은 필수입니다.' 
            });
        }
        
        // end_date가 이미 UTC ISO string으로 전달되므로 직접 사용
        const result = await query(`
            UPDATE issues 
            SET title = $1, category = $2, description = $3, image_url = $4, 
                yes_price = $5, end_date = $6::timestamptz, is_popular = $7, 
                updated_at = NOW()
            WHERE id = $8
            RETURNING *
        `, [title, category, description, image_url, yes_price, end_date, is_popular ? true : false, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: '이슈를 찾을 수 없습니다.' });
        }
        
        const issue = result.rows[0];
        
        // 이슈 수정 로깅
        logIssueCreation(issue.id, issue.title, issue.end_date, req.user?.id, 'admin', req.ip, 'admin_update');
        
        // 빠른 변경 패턴 감지
        detectRapidDeadlineChanges(issue.id);
        
        res.json({
            success: true,
            message: '이슈가 성공적으로 수정되었습니다.',
            issue: {
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }
        });
        
    } catch (error) {
        console.error('이슈 수정 실패:', error);
        res.status(500).json({ success: false, message: '이슈 수정에 실패했습니다.' });
    }
});

// 이슈 삭제
router.delete('/issues/:id', secureAdminMiddleware, (req, res) => {
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
router.patch('/issues/:id/toggle-popular', secureAdminMiddleware, (req, res) => {
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
router.get('/issues/closed', secureAdminMiddleware, async (req, res) => {
    const { filter = 'closed' } = req.query;
    console.log(`🔍 관리자 이슈 조회 요청 - 필터: ${filter}`);
    
    try {
        const { query: dbQuery } = require('../database/database');
        let queryString = '';
        let params = [];
        
        switch (filter) {
            case 'closed':
                // 마감된 이슈이지만 결과가 아직 결정되지 않은 이슈들
                queryString = `SELECT id, title, category, end_date, status, result, yes_price, total_volume 
                             FROM issues 
                             WHERE (status = 'closed' OR end_date < ${getCurrentTimeSQL()}) AND result IS NULL 
                             ORDER BY end_date ASC`;
                break;
            case 'pending':
                queryString = `SELECT id, title, category, end_date, status, result, yes_price, total_volume 
                             FROM issues 
                             WHERE status = $1 
                             ORDER BY end_date ASC`;
                params = ['pending'];
                break;
            case 'resolved':
                queryString = `SELECT id, title, category, end_date, status, result, yes_price, total_volume 
                             FROM issues 
                             WHERE result IS NOT NULL 
                             ORDER BY decided_at DESC`;
                break;
            case 'all':
                // 디버깅용: 모든 이슈 표시
                queryString = `SELECT id, title, category, end_date, status, result, yes_price, total_volume 
                             FROM issues 
                             ORDER BY end_date ASC`;
                break;
        }
        
        console.log(`📝 실행할 쿼리: ${queryString}`);
        console.log(`📊 파라미터: ${JSON.stringify(params)}`);
        
        const result = await dbQuery(queryString, params);
        const issues = result.rows || [];
        console.log(`✅ 이슈 조회 성공: ${issues.length}개 발견`);
        
        res.json({ success: true, issues });
        
    } catch (err) {
        console.error('❌ 결과 관리용 이슈 조회 실패:', err);
        res.status(500).json({ 
            success: false, 
            message: `데이터베이스 쿼리 오류: ${err.message}` 
        });
    }
});

// 이슈 결과 설정 및 보상 지급
router.post('/issues/:id/result', secureAdminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { result, reason } = req.body;
    const adminId = req.user?.id || 1; // 임시로 관리자 ID 1 사용
    
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
                SET result = ?, decided_by = ?, decided_at = ${getCurrentTimeSQL()}, 
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
            const losingBets = bets.filter(bet => bet.choice !== result);
            const totalPool = bets.reduce((sum, bet) => sum + bet.amount, 0);
            const totalWinningAmount = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
            
            // 승리자가 있는 경우 보상 지급
            if (totalWinningAmount > 0) {
                const houseEdge = 0.05; // 5% 수수료
                const rewardPool = totalPool * (1 - houseEdge);
                
                for (const bet of winningBets) {
                    const userReward = Math.floor((bet.amount / totalWinningAmount) * rewardPool);
                    
                    // 사용자 잔액 업데이트
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE users SET gam_balance = gam_balance + ? WHERE id = ?',
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
                    
                    // 승리 알림 생성
                    try {
                        await NotificationService.notifyBettingWin(
                            bet.user_id, 
                            id, 
                            issue.title, 
                            bet.amount, 
                            userReward
                        );
                        console.log(`✅ 승리 알림 생성 완료: 사용자 ${bet.user_id}`);
                    } catch (notificationError) {
                        console.error(`승리 알림 생성 실패: 사용자 ${bet.user_id}:`, notificationError);
                    }
                }
            }
            
            // 패배한 베터들에게 패배 알림 생성 (승리자 유무와 관계없이)
            for (const bet of losingBets) {
                try {
                    await NotificationService.notifyBettingLoss(
                        bet.user_id, 
                        id, 
                        issue.title, 
                        bet.amount, 
                        reason || '예측이 빗나갔습니다.'
                    );
                    console.log(`✅ 패배 알림 생성 완료: 사용자 ${bet.user_id}`);
                } catch (notificationError) {
                    console.error(`패배 알림 생성 실패: 사용자 ${bet.user_id}:`, notificationError);
                }
            }
        } else if (result === 'Draw' || result === 'Cancelled') {
            // 무승부 또는 취소시 모든 베팅 금액 반환
            for (const bet of bets) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET gam_balance = gam_balance + ? WHERE id = ?',
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
                
                // 무승부/취소 알림 생성
                try {
                    const resultText = result === 'Draw' ? '무승부' : '취소';
                    const message = result === 'Draw' 
                        ? `"${issue.title}" 이슈가 무승부로 종료되어 베팅 금액 ${bet.amount.toLocaleString()} GAM이 전액 환불되었습니다.`
                        : `"${issue.title}" 이슈가 취소되어 베팅 금액 ${bet.amount.toLocaleString()} GAM이 전액 환불되었습니다.`;
                    
                    await NotificationService.createNotification({
                        userId: bet.user_id,
                        type: result === 'Draw' ? 'betting_draw' : 'betting_cancelled',
                        title: `💰 베팅 금액이 환불되었습니다`,
                        message,
                        relatedId: id,
                        relatedType: 'issue'
                    });
                    console.log(`✅ ${resultText} 알림 생성 완료: 사용자 ${bet.user_id}`);
                } catch (notificationError) {
                    console.error(`${resultText} 알림 생성 실패: 사용자 ${bet.user_id}:`, notificationError);
                }
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
router.post('/issues/:id/close', secureAdminMiddleware, (req, res) => {
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

// 관리자용 단일 이슈 조회 (상태 무관)
router.get('/issues/:id', secureAdminMiddleware, async (req, res) => {
    try {
        const issueId = req.params.id;
        console.log(`🔍 관리자 이슈 조회 요청 - ID: ${issueId}`);
        
        // PostgreSQL 직접 사용
        const { get } = require('../database/database');
        const issue = await get('SELECT * FROM issues WHERE id = $1', [issueId]);
        
        console.log(`📊 이슈 조회 결과:`, issue ? '찾음' : '없음');
        
        if (!issue) {
            console.log(`❌ 이슈 ID ${issueId}를 찾을 수 없음`);
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        console.log(`✅ 이슈 조회 성공: ${issue.title}`);
        res.json({
            success: true,
            issue: {
                ...issue,
                isPopular: Boolean(issue.is_popular)
            }
        });
        
    } catch (error) {
        console.error('❌ 관리자 이슈 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 조회 중 오류가 발생했습니다.' 
        });
    }
});

// 스케줄러 상태 조회
router.get('/scheduler/status', secureAdminMiddleware, (req, res) => {
    console.log('🔍 스케줄러 상태 조회 요청');
    
    try {
        // 스케줄러 모듈 유효성 검사
        if (!issueScheduler) {
            console.error('❌ issueScheduler 모듈이 로드되지 않았습니다');
            return res.status(500).json({ 
                success: false, 
                message: '스케줄러 모듈 로드 오류가 발생했습니다.' 
            });
        }
        
        console.log('✅ issueScheduler 모듈 확인됨');
        
        // getStatus 메서드 유효성 검사
        if (typeof issueScheduler.getStatus !== 'function') {
            console.error('❌ issueScheduler.getStatus가 함수가 아닙니다');
            return res.status(500).json({ 
                success: false, 
                message: '스케줄러 상태 조회 메서드가 유효하지 않습니다.' 
            });
        }
        
        console.log('✅ getStatus 메서드 확인됨');
        
        const status = issueScheduler.getStatus();
        console.log('📊 스케줄러 상태:', status);
        
        res.json({
            success: true,
            scheduler: {
                isRunning: status.isRunning,
                nextRun: status.nextRun ? status.nextRun.toISOString() : null,
                currentTime: new Date().toISOString()
            }
        });
        
        console.log('✅ 스케줄러 상태 조회 성공');
        
    } catch (error) {
        console.error('❌ 스케줄러 상태 조회 실패:', error);
        console.error('❌ 에러 스택:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: `스케줄러 상태 조회 오류: ${error.message}` 
        });
    }
});

// 스케줄러 수동 실행
router.post('/scheduler/run', secureAdminMiddleware, async (req, res) => {
    console.log('🔍 스케줄러 수동 실행 요청');
    
    try {
        // 스케줄러 모듈 유효성 검사
        if (!issueScheduler) {
            console.error('❌ issueScheduler 모듈이 로드되지 않았습니다');
            return res.status(500).json({ 
                success: false, 
                message: '스케줄러 모듈 로드 오류가 발생했습니다.' 
            });
        }
        
        // runManualCheck 메서드 유효성 검사
        if (typeof issueScheduler.runManualCheck !== 'function') {
            console.error('❌ issueScheduler.runManualCheck가 함수가 아닙니다');
            return res.status(500).json({ 
                success: false, 
                message: '스케줄러 수동 실행 메서드가 유효하지 않습니다.' 
            });
        }
        
        console.log('✅ 스케줄러 수동 실행 시작');
        await issueScheduler.runManualCheck();
        console.log('✅ 스케줄러 수동 실행 완료');
        
        res.json({
            success: true,
            message: '이슈 만료 검사가 수동으로 실행되었습니다.'
        });
    } catch (error) {
        console.error('❌ 스케줄러 수동 실행 실패:', error);
        console.error('❌ 에러 스택:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: `스케줄러 수동 실행 오류: ${error.message}` 
        });
    }
});

// 타임스탬프 수정 API (개발용)
router.post('/fix-timestamps', secureAdminMiddleware, async (req, res) => {
    try {
        console.log('기존 이슈들의 타임스탬프 수정 시작...');
        
        // "test" 이슈를 가장 최신으로 설정 (현재 시간)
        const testResult = await query(`
            UPDATE issues 
            SET created_at = NOW() AT TIME ZONE 'Asia/Seoul', updated_at = NOW() AT TIME ZONE 'Asia/Seoul'
            WHERE LOWER(title) LIKE '%test%'
            RETURNING id, title, created_at
        `);
        
        // "비트코인 up vs. down" 이슈를 두 번째로 최신으로 설정 (1분 전)
        const bitcoinResult = await query(`
            UPDATE issues 
            SET created_at = (NOW() AT TIME ZONE 'Asia/Seoul') - INTERVAL '1 minute', updated_at = NOW() AT TIME ZONE 'Asia/Seoul'
            WHERE LOWER(title) LIKE '%비트코인%' OR LOWER(title) LIKE '%bitcoin%'
            RETURNING id, title, created_at
        `);
        
        // 모든 이슈의 created_at 확인
        const allIssues = await query(`
            SELECT id, title, created_at 
            FROM issues 
            WHERE status = 'active'
            ORDER BY created_at DESC
            LIMIT 20
        `);
        
        res.json({
            success: true,
            message: '타임스탬프 수정 완료',
            results: {
                testUpdated: testResult.rows,
                bitcoinUpdated: bitcoinResult.rows,
                allIssues: allIssues.rows.map(issue => ({
                    id: issue.id,
                    title: issue.title,
                    created_at: issue.created_at
                }))
            }
        });
        
    } catch (error) {
        console.error('타임스탬프 수정 중 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '타임스탬프 수정 중 오류가 발생했습니다.',
            error: error.message 
        });
    }
});

// 특정 이슈를 최신으로 설정하는 API
router.post('/make-issue-latest', secureAdminMiddleware, async (req, res) => {
    try {
        const { issueId, title } = req.body;
        
        let result;
        if (issueId) {
            // ID로 업데이트
            result = await query(`
                UPDATE issues 
                SET created_at = NOW() AT TIME ZONE 'Asia/Seoul', updated_at = NOW() AT TIME ZONE 'Asia/Seoul'
                WHERE id = $1
                RETURNING id, title, created_at
            `, [issueId]);
        } else if (title) {
            // 제목으로 업데이트
            result = await query(`
                UPDATE issues 
                SET created_at = NOW() AT TIME ZONE 'Asia/Seoul', updated_at = NOW() AT TIME ZONE 'Asia/Seoul'
                WHERE LOWER(title) LIKE $1
                RETURNING id, title, created_at
            `, [`%${title.toLowerCase()}%`]);
        } else {
            return res.status(400).json({
                success: false,
                message: 'issueId 또는 title 파라미터가 필요합니다.'
            });
        }
        
        res.json({
            success: true,
            message: '이슈가 최신으로 업데이트되었습니다.',
            updated: result.rows
        });
        
    } catch (error) {
        console.error('이슈 업데이트 중 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈 업데이트 중 오류가 발생했습니다.',
            error: error.message 
        });
    }
});

// 인기이슈 순서 업데이트 API
router.post('/popular-issues/reorder', secureAdminMiddleware, requirePermission('create_issue'), async (req, res) => {
    try {
        const { orderedIssueIds } = req.body; // [3, 1, 5, 2] 형태의 배열
        
        if (!Array.isArray(orderedIssueIds) || orderedIssueIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '유효한 이슈 ID 배열이 필요합니다.'
            });
        }
        
        console.log('🔄 인기이슈 순서 업데이트 요청:', orderedIssueIds);
        
        // 트랜잭션으로 순서 업데이트
        const updatePromises = orderedIssueIds.map((issueId, index) => {
            const order = index + 1; // 1부터 시작
            return query(`
                UPDATE issues 
                SET popular_order = $1, updated_at = NOW() AT TIME ZONE 'Asia/Seoul'
                WHERE id = $2 AND is_popular = true
                RETURNING id, title, popular_order
            `, [order, issueId]);
        });
        
        const results = await Promise.all(updatePromises);
        const updatedIssues = results.map(result => result.rows[0]).filter(Boolean);
        
        console.log('✅ 순서 업데이트 완료:', updatedIssues);
        
        res.json({
            success: true,
            message: '인기이슈 순서가 업데이트되었습니다.',
            updatedIssues
        });
        
    } catch (error) {
        console.error('인기이슈 순서 업데이트 중 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '인기이슈 순서 업데이트 중 오류가 발생했습니다.',
            error: error.message 
        });
    }
});

// 인기이슈 목록 조회 (순서대로)
router.get('/popular-issues', secureAdminMiddleware, requirePermission('view_issues'), async (req, res) => {
    try {
        const result = await query(`
            SELECT id, title, category, end_date, is_popular, popular_order, created_at
            FROM issues 
            WHERE status = 'active' AND is_popular = true
            ORDER BY popular_order ASC NULLS LAST, created_at DESC
        `);
        
        const popularIssues = result.rows;
        
        console.log('📋 인기이슈 목록 조회:', popularIssues.length, '개');
        
        res.json({
            success: true,
            issues: popularIssues
        });
        
    } catch (error) {
        console.error('인기이슈 조회 중 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '인기이슈를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// === 분석방 관리 API ===

// 분석방 게시글 목록 조회 (관리자용)
router.get('/discussions/posts', secureAdminMiddleware, requirePermission('view_discussions'), async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            category_id,
            search,
            sort = 'latest',
            filter = 'all'
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
            whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.content ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        
        // 필터
        switch (filter) {
            case 'notice':
                whereClause += ' AND p.is_notice = true';
                break;
            case 'pinned':
                whereClause += ' AND p.is_pinned = true';
                break;
            case 'reported':
                whereClause += ' AND p.like_count < -5';
                break;
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
            LEFT JOIN users u ON p.author_id = u.id
            WHERE ${whereClause}
        `;
        
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        // 게시글 목록 조회
        const postsQuery = `
            SELECT 
                p.id,
                p.title,
                p.content,
                p.category_id,
                p.author_id,
                p.is_notice,
                p.is_pinned,
                p.view_count,
                p.like_count,
                p.comment_count,
                p.created_at,
                p.updated_at,
                u.username as author_name,
                u.gam_balance,
                c.name as category_name,
                c.color as category_color,
                c.icon as category_icon,
                SUBSTRING(p.content, 1, 100) as content_preview
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
        console.error('[관리자] 분석방 게시글 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 목록 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 게시글 일괄 삭제 (관리자용) - 단일 삭제보다 먼저 정의해야 함
router.delete('/discussions/posts/bulk', secureAdminMiddleware, requirePermission('delete_discussions'), async (req, res) => {
    try {
        const { postIds, reason } = req.body;
        
        if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '삭제할 게시글 ID 목록이 필요합니다.'
            });
        }
        
        // 최대 50개까지만 허용 (안전성)
        if (postIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: '한 번에 최대 50개의 게시글만 삭제할 수 있습니다.'
            });
        }
        
        // 삭제할 게시글들 조회
        const placeholders = postIds.map((_, i) => `$${i + 1}`).join(',');
        const postsResult = await query(
            `SELECT id, title, author_id FROM discussion_posts WHERE id IN (${placeholders})`,
            postIds
        );
        
        if (postsResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '삭제할 게시글을 찾을 수 없습니다.'
            });
        }
        
        const posts = postsResult.rows;
        const foundIds = posts.map(p => p.id);
        
        // 게시글들 일괄 삭제
        await query(`DELETE FROM discussion_posts WHERE id IN (${placeholders})`, postIds);
        
        // 관리자 활동 로그 기록
        try {
            await query(`
                INSERT INTO admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                req.admin.id,
                'BULK_DELETE_DISCUSSION_POSTS',
                'discussion_post',
                null,
                JSON.stringify({
                    deleted_posts: posts.map(p => ({ id: p.id, title: p.title, author_id: p.author_id })),
                    total_count: posts.length,
                    reason: reason || '사유 없음'
                }),
                req.ip
            ]);
        } catch (logError) {
            console.error('관리자 활동 로그 기록 실패:', logError);
        }
        
        res.json({
            success: true,
            message: `${posts.length}개의 게시글이 성공적으로 삭제되었습니다.`,
            deletedCount: posts.length,
            notFoundIds: postIds.filter(id => !foundIds.includes(id))
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 게시글 일괄 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 일괄 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 게시글 삭제 (관리자용)
router.delete('/discussions/posts/:id', secureAdminMiddleware, requirePermission('delete_discussions'), async (req, res) => {
    try {
        const postId = req.params.id;
        const { reason } = req.body;
        
        // 게시글 존재 확인
        const postResult = await query(
            'SELECT id, title, author_id FROM discussion_posts WHERE id = $1',
            [postId]
        );
        
        if (postResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '게시글을 찾을 수 없습니다.'
            });
        }
        
        const post = postResult.rows[0];
        
        // 게시글 삭제 (CASCADE로 인해 관련 댓글과 좋아요도 함께 삭제됨)
        await query('DELETE FROM discussion_posts WHERE id = $1', [postId]);
        
        // 관리자 활동 로그 기록
        try {
            await query(`
                INSERT INTO admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                req.admin.id,
                'DELETE_DISCUSSION_POST',
                'discussion_post',
                postId,
                JSON.stringify({
                    title: post.title,
                    author_id: post.author_id,
                    reason: reason || '사유 없음'
                }),
                req.ip
            ]);
        } catch (logError) {
            console.error('관리자 활동 로그 기록 실패:', logError);
        }
        
        res.json({
            success: true,
            message: '게시글이 성공적으로 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 게시글 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 댓글 목록 조회 (관리자용)
router.get('/discussions/comments', secureAdminMiddleware, requirePermission('view_discussions'), async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            post_id,
            search,
            filter = 'all'
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        let whereClause = '1=1';
        let params = [];
        let paramIndex = 1;
        
        // 게시글 필터
        if (post_id) {
            whereClause += ` AND c.post_id = $${paramIndex}`;
            params.push(post_id);
            paramIndex++;
        }
        
        // 검색
        if (search && search.trim()) {
            whereClause += ` AND (c.content ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        
        // 필터
        switch (filter) {
            case 'reported':
                whereClause += ' AND c.like_count < -5';
                break;
            case 'top_level':
                whereClause += ' AND c.parent_id IS NULL';
                break;
            case 'replies':
                whereClause += ' AND c.parent_id IS NOT NULL';
                break;
        }
        
        // 총 댓글 수 조회
        const countQuery = `
            SELECT COUNT(*) as total
            FROM discussion_comments c
            LEFT JOIN users u ON c.author_id = u.id
            WHERE ${whereClause}
        `;
        
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        // 댓글 목록 조회
        const commentsQuery = `
            SELECT 
                c.id,
                c.content,
                c.post_id,
                c.author_id,
                c.parent_id,
                c.like_count,
                c.created_at,
                c.updated_at,
                u.username as author_name,
                u.gam_balance,
                p.title as post_title,
                CASE WHEN c.parent_id IS NOT NULL THEN
                    (SELECT username FROM users WHERE id = (SELECT author_id FROM discussion_comments WHERE id = c.parent_id))
                ELSE NULL END as parent_author_name
            FROM discussion_comments c
            LEFT JOIN users u ON c.author_id = u.id
            LEFT JOIN discussion_posts p ON c.post_id = p.id
            WHERE ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        params.push(limit, offset);
        const commentsResult = await query(commentsQuery, params);
        
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
        console.error('[관리자] 분석방 댓글 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 목록 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 댓글 삭제 (관리자용)
router.delete('/discussions/comments/:id', secureAdminMiddleware, requirePermission('delete_discussions'), async (req, res) => {
    try {
        const commentId = req.params.id;
        const { reason } = req.body;
        
        // 댓글 존재 확인
        const commentResult = await query(
            'SELECT id, content, author_id, post_id FROM discussion_comments WHERE id = $1',
            [commentId]
        );
        
        if (commentResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '댓글을 찾을 수 없습니다.'
            });
        }
        
        const comment = commentResult.rows[0];
        
        // 댓글 삭제 (CASCADE로 인해 관련 대댓글과 좋아요도 함께 삭제됨)
        await query('DELETE FROM discussion_comments WHERE id = $1', [commentId]);
        
        // 관리자 활동 로그 기록
        try {
            await query(`
                INSERT INTO admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                req.admin.id,
                'DELETE_DISCUSSION_COMMENT',
                'discussion_comment',
                commentId,
                JSON.stringify({
                    content: comment.content.substring(0, 100),
                    author_id: comment.author_id,
                    post_id: comment.post_id,
                    reason: reason || '사유 없음'
                }),
                req.ip
            ]);
        } catch (logError) {
            console.error('관리자 활동 로그 기록 실패:', logError);
        }
        
        res.json({
            success: true,
            message: '댓글이 성공적으로 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 댓글 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 댓글 일괄 삭제 (관리자용)
router.delete('/discussions/comments/bulk', secureAdminMiddleware, requirePermission('delete_discussions'), async (req, res) => {
    try {
        const { commentIds, reason } = req.body;
        
        if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '삭제할 댓글 ID 목록이 필요합니다.'
            });
        }
        
        // 최대 100개까지만 허용 (안전성)
        if (commentIds.length > 100) {
            return res.status(400).json({
                success: false,
                message: '한 번에 최대 100개의 댓글만 삭제할 수 있습니다.'
            });
        }
        
        // 삭제할 댓글들 조회
        const placeholders = commentIds.map((_, i) => `$${i + 1}`).join(',');
        const commentsResult = await query(
            `SELECT id, content, author_id, post_id FROM discussion_comments WHERE id IN (${placeholders})`,
            commentIds
        );
        
        if (commentsResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '삭제할 댓글을 찾을 수 없습니다.'
            });
        }
        
        const comments = commentsResult.rows;
        const foundIds = comments.map(c => c.id);
        
        // 댓글들 일괄 삭제
        await query(`DELETE FROM discussion_comments WHERE id IN (${placeholders})`, commentIds);
        
        // 관리자 활동 로그 기록
        try {
            await query(`
                INSERT INTO admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                req.admin.id,
                'BULK_DELETE_DISCUSSION_COMMENTS',
                'discussion_comment',
                null,
                JSON.stringify({
                    deleted_comments: comments.map(c => ({ 
                        id: c.id, 
                        content: c.content.substring(0, 100), 
                        author_id: c.author_id, 
                        post_id: c.post_id 
                    })),
                    total_count: comments.length,
                    reason: reason || '사유 없음'
                }),
                req.ip
            ]);
        } catch (logError) {
            console.error('관리자 활동 로그 기록 실패:', logError);
        }
        
        res.json({
            success: true,
            message: `${comments.length}개의 댓글이 성공적으로 삭제되었습니다.`,
            deletedCount: comments.length,
            notFoundIds: commentIds.filter(id => !foundIds.includes(id))
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 댓글 일괄 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '댓글 일괄 삭제 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 게시글 공지/고정 토글 (관리자용)
router.post('/discussions/posts/:id/toggle-notice', secureAdminMiddleware, requirePermission('manage_discussions'), async (req, res) => {
    try {
        const postId = req.params.id;
        const { is_notice, is_pinned } = req.body;
        
        await query(`
            UPDATE discussion_posts 
            SET is_notice = $1, is_pinned = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [is_notice || false, is_pinned || false, postId]);
        
        res.json({
            success: true,
            message: '게시글 설정이 업데이트되었습니다.'
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 게시글 설정 변경 오류:', error);
        res.status(500).json({
            success: false,
            message: '게시글 설정 변경 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

// 분석방 통계 조회 (관리자용)
router.get('/discussions/stats', secureAdminMiddleware, requirePermission('view_discussions'), async (req, res) => {
    try {
        const stats = await Promise.all([
            query('SELECT COUNT(*) as total FROM discussion_posts'),
            query('SELECT COUNT(*) as total FROM discussion_comments'),
            query('SELECT COUNT(*) as total FROM discussion_posts WHERE created_at >= CURRENT_DATE'),
            query('SELECT COUNT(*) as total FROM discussion_comments WHERE created_at >= CURRENT_DATE'),
            query('SELECT COUNT(*) as total FROM discussion_posts WHERE is_notice = true'),
            query('SELECT COUNT(*) as total FROM discussion_posts WHERE is_pinned = true'),
            query(`
                SELECT c.name, COUNT(p.id) as post_count
                FROM discussion_categories c
                LEFT JOIN discussion_posts p ON c.id = p.category_id
                WHERE c.is_active = true
                GROUP BY c.id, c.name
                ORDER BY c.display_order
            `),
            query(`
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM discussion_posts 
                WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `)
        ]);
        
        res.json({
            success: true,
            stats: {
                totalPosts: parseInt(stats[0].rows[0].total),
                totalComments: parseInt(stats[1].rows[0].total),
                todayPosts: parseInt(stats[2].rows[0].total),
                todayComments: parseInt(stats[3].rows[0].total),
                noticePosts: parseInt(stats[4].rows[0].total),
                pinnedPosts: parseInt(stats[5].rows[0].total),
                categoryStats: stats[6].rows,
                weeklyActivity: stats[7].rows
            }
        });
        
    } catch (error) {
        console.error('[관리자] 분석방 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '통계 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;