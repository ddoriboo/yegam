const express = require('express');
const { query, run, get, getDB } = require('../database/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// 이슈 신청 테이블 생성 (첫 실행 시)
async function createIssueRequestsTable() {
    try {
        await run(`
            CREATE TABLE IF NOT EXISTS issue_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category VARCHAR(50) NOT NULL,
                deadline TIMESTAMP NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                admin_comments TEXT,
                approved_by INTEGER,
                approved_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (approved_by) REFERENCES users (id)
            )
        `);
        console.log('✅ issue_requests 테이블 확인/생성 완료');
    } catch (error) {
        console.error('❌ issue_requests 테이블 생성 오류:', error);
        // 테이블 생성 실패해도 서버는 계속 실행되도록 함
    }
}

// 테이블 생성 실행 (지연 처리)
setTimeout(() => {
    createIssueRequestsTable();
}, 1000);

// 이슈 신청 생성
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, description, category, deadline } = req.body;
        const userId = req.user.id;
        
        // 입력 유효성 검사
        if (!title || !description || !category || !deadline) {
            return res.status(400).json({
                success: false,
                message: '모든 필드를 입력해주세요.'
            });
        }
        
        // 제목 길이 검사
        if (title.length > 200) {
            return res.status(400).json({
                success: false,
                message: '제목은 200자를 초과할 수 없습니다.'
            });
        }
        
        // 설명 길이 검사
        if (description.length > 1000) {
            return res.status(400).json({
                success: false,
                message: '설명은 1000자를 초과할 수 없습니다.'
            });
        }
        
        // 마감일 유효성 검사
        const deadlineDate = new Date(deadline);
        const now = new Date();
        if (deadlineDate <= now) {
            return res.status(400).json({
                success: false,
                message: '마감일은 현재 시간 이후여야 합니다.'
            });
        }
        
        // 유효한 카테고리인지 확인
        const validCategories = ['정치', '스포츠', '경제', '코인', '테크', '엔터', '날씨', '해외'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 카테고리입니다.'
            });
        }
        
        // 사용자의 대기 중인 신청이 너무 많은지 확인 (최대 3개)
        const pendingCount = await get(`
            SELECT COUNT(*) as count 
            FROM issue_requests 
            WHERE user_id = $1 AND status = 'pending'
        `, [userId]);
        
        if (pendingCount && pendingCount.count >= 3) {
            return res.status(400).json({
                success: false,
                message: '대기 중인 이슈 신청이 너무 많습니다. 최대 3개까지 가능합니다.'
            });
        }
        
        // 이슈 신청 생성
        const result = await run(`
            INSERT INTO issue_requests (
                user_id, title, description, category, deadline
            ) VALUES ($1, $2, $3, $4, $5)
        `, [userId, title, description, category, deadline]);
        
        res.json({
            success: true,
            message: '이슈 신청이 완료되었습니다.',
            requestId: result.lastID
        });
        
    } catch (error) {
        console.error('이슈 신청 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 중 오류가 발생했습니다.'
        });
    }
});

// 내 이슈 신청 목록 조회
router.get('/my-requests', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const requests = await query(`
            SELECT 
                ir.*,
                u.username as approved_by_username
            FROM issue_requests ir
            LEFT JOIN users u ON ir.approved_by = u.id
            WHERE ir.user_id = $1
            ORDER BY ir.created_at DESC
        `, [userId]);
        
        res.json({
            success: true,
            requests: requests.rows.map(request => ({
                ...request,
                timeAgo: getTimeAgo(new Date(request.created_at))
            }))
        });
        
    } catch (error) {
        console.error('내 이슈 신청 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 목록을 불러오는 중 오류가 발생했습니다.'
        });
    }
});

// 관리자: 모든 이슈 신청 조회
router.get('/admin/all', adminMiddleware, async (req, res) => {
    try {
        const { status } = req.query;
        
        let whereClause = '';
        let params = [];
        
        if (status && status !== 'all') {
            whereClause = 'WHERE ir.status = $1';
            params.push(status);
        }
        
        const requests = await query(`
            SELECT 
                ir.*,
                u.username,
                u.email,
                approver.username as approved_by_username
            FROM issue_requests ir
            JOIN users u ON ir.user_id = u.id
            LEFT JOIN users approver ON ir.approved_by = approver.id
            ${whereClause}
            ORDER BY ir.created_at DESC
        `, params);
        
        res.json({
            success: true,
            requests: requests.rows.map(request => ({
                ...request,
                timeAgo: getTimeAgo(new Date(request.created_at))
            }))
        });
        
    } catch (error) {
        console.error('이슈 신청 관리자 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 목록을 불러오는 중 오류가 발생했습니다.'
        });
    }
});

// 관리자: 이슈 신청 승인
router.put('/:id/approve', adminMiddleware, async (req, res) => {
    try {
        const requestId = req.params.id;
        const adminId = req.user?.id || 1; // 임시 관리자 ID
        const { adminComments } = req.body;
        
        // 신청 존재 확인
        const request = await get(`
            SELECT ir.*, u.username, u.id as user_id
            FROM issue_requests ir
            JOIN users u ON ir.user_id = u.id
            WHERE ir.id = $1 AND ir.status = 'pending'
        `, [requestId]);
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: '존재하지 않거나 이미 처리된 신청입니다.'
            });
        }
        
        // 승인 처리 (기존 데이터베이스 방식 사용)
        const db = getDB();
        
        // 1. 정식 이슈로 등록 (PostgreSQL boolean 타입 대응)
        db.run(`
            INSERT INTO issues (title, category, description, image_url, yes_price, end_date, is_popular)
            VALUES (?, ?, ?, ?, ?, ?, false)
        `, [request.title, request.category, request.description, '', 50, request.deadline], async function(err) {
            if (err) {
                console.error('이슈 생성 실패:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: '이슈 생성에 실패했습니다: ' + err.message 
                });
            }
            
            const issueId = this.lastID;
            console.log('✅ 이슈 생성 성공:', issueId);
            
            try {
                // 2. 신청 상태 업데이트
                await run(`
                    UPDATE issue_requests 
                    SET status = 'approved', 
                        approved_by = $1, 
                        approved_at = CURRENT_TIMESTAMP,
                        admin_comments = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [adminId, adminComments || '', requestId]);
                
                // 3. 신청자에게 1000 GAM 지급
                await run(`
                    UPDATE users 
                    SET coins = COALESCE(coins, 0) + 1000
                    WHERE id = $1
                `, [request.user_id]);
                
                console.log('✅ GAM 지급 완료:', request.user_id);
                
                // 4. GAM 거래 로그 기록 (선택적 - 테이블이 있는 경우만)
                try {
                    // 테이블 존재 여부 확인 후 로그 기록
                    const tableCheck = await query(`
                        SELECT EXISTS (
                            SELECT 1 FROM information_schema.tables 
                            WHERE table_name = 'gam_transactions'
                        )
                    `);
                    
                    if (tableCheck.rows[0]?.exists) {
                        await run(`
                            INSERT INTO gam_transactions (
                                user_id, amount, type, description, created_at
                            ) VALUES ($1, 1000, 'reward', '이슈 신청 승인 보상', CURRENT_TIMESTAMP)
                        `, [request.user_id]);
                        console.log('✅ GAM 거래 로그 기록 완료');
                    } else {
                        console.log('📝 GAM 거래 로그 테이블 없음 - 스킵');
                    }
                } catch (logError) {
                    // 로그 기록 실패해도 계속 진행
                    console.log('📝 GAM 거래 로그 기록 실패 (무시):', logError.message);
                }
                
                res.json({
                    success: true,
                    message: '이슈 신청이 승인되었습니다.',
                    issueId: issueId
                });
                
            } catch (updateError) {
                console.error('승인 후 업데이트 실패:', updateError);
                res.status(500).json({
                    success: false,
                    message: '이슈는 생성되었지만 상태 업데이트에 실패했습니다: ' + updateError.message
                });
            }
        });
        
    } catch (error) {
        console.error('이슈 신청 승인 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 승인 중 오류가 발생했습니다.'
        });
    }
});

// 관리자: 이슈 신청 거부
router.put('/:id/reject', adminMiddleware, async (req, res) => {
    try {
        const requestId = req.params.id;
        const adminId = req.user?.id || 1; // 임시 관리자 ID
        const { adminComments } = req.body;
        
        // 신청 존재 확인
        const request = await get(`
            SELECT * FROM issue_requests 
            WHERE id = $1 AND status = 'pending'
        `, [requestId]);
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: '존재하지 않거나 이미 처리된 신청입니다.'
            });
        }
        
        // 신청 상태 업데이트
        await run(`
            UPDATE issue_requests 
            SET status = 'rejected', 
                approved_by = $1, 
                approved_at = CURRENT_TIMESTAMP,
                admin_comments = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [adminId, adminComments || '승인 기준에 부합하지 않음', requestId]);
        
        res.json({
            success: true,
            message: '이슈 신청이 거부되었습니다.'
        });
        
    } catch (error) {
        console.error('이슈 신청 거부 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 거부 중 오류가 발생했습니다.'
        });
    }
});

// 시간 계산 헬퍼 함수
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
}

module.exports = router;