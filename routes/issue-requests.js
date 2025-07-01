const express = require('express');
const { query } = require('../database/postgres');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const NotificationService = require('../services/notificationService');

// 임시 관리자 미들웨어
const tempAdminMiddleware = (req, res, next) => {
    console.log('⚠️ 이슈신청 임시 관리자 모드 활성화');
    req.user = {
        id: 999,
        email: 'temp@admin.com',
        username: 'TempAdmin',
        isAdmin: true,
        adminId: 999
    };
    next();
};

const router = express.Router();

// 이슈 신청 테이블 생성 (첫 실행 시)
async function createIssueRequestsTable() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS issue_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category VARCHAR(50) NOT NULL,
                deadline TIMESTAMPTZ NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                admin_comments TEXT,
                approved_by INTEGER,
                approved_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (approved_by) REFERENCES users (id)
            )
        `);
        console.log('✅ issue_requests 테이블 확인/생성 완료');
        
        // 기존 테이블의 타임존 마이그레이션
        try {
            await query(`ALTER TABLE issue_requests ALTER COLUMN deadline TYPE TIMESTAMPTZ USING deadline AT TIME ZONE 'Asia/Seoul'`);
            await query(`ALTER TABLE issue_requests ALTER COLUMN approved_at TYPE TIMESTAMPTZ USING approved_at AT TIME ZONE 'Asia/Seoul'`);
            await query(`ALTER TABLE issue_requests ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'Asia/Seoul'`);
            await query(`ALTER TABLE issue_requests ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'Asia/Seoul'`);
            console.log('✅ issue_requests 테이블 타임존 마이그레이션 완료');
        } catch (error) {
            console.log('issue_requests 테이블 타임존 마이그레이션 스킵:', error.message);
        }
        
        // AI 이슈 생성 기능을 위한 컬럼 추가 마이그레이션
        try {
            await query(`ALTER TABLE issue_requests ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE`);
            await query(`ALTER TABLE issue_requests ADD COLUMN IF NOT EXISTS agent_id VARCHAR(50)`);
            console.log('✅ issue_requests 테이블 AI 기능 컬럼 마이그레이션 완료');
        } catch (error) {
            console.log('issue_requests 테이블 AI 기능 컬럼 마이그레이션 스킵:', error.message);
        }
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
        
        // 마감일 유효성 검사 (KST 타임존 고려)
        const deadlineDate = new Date(deadline);
        const now = new Date();
        
        console.log('🔍 이슈 신청 시간 정보 (KST 처리):', {
            received_deadline: deadline,
            deadline_type: typeof deadline,
            parsed_deadline: deadlineDate.toISOString(),
            parsed_deadline_kst: deadlineDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
            current_time: now.toISOString(),
            current_time_kst: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
            is_future: deadlineDate > now
        });
        
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
        const pendingResult = await query(`
            SELECT COUNT(*) as count 
            FROM issue_requests 
            WHERE user_id = $1 AND status = 'pending'
        `, [userId]);
        const pendingCount = pendingResult.rows[0];
        
        if (pendingCount && pendingCount.count >= 3) {
            return res.status(400).json({
                success: false,
                message: '대기 중인 이슈 신청이 너무 많습니다. 최대 3개까지 가능합니다.'
            });
        }
        
        // 이슈 신청 생성 (PostgreSQL TIMESTAMPTZ 사용으로 타임존 정보 보존)
        console.log('💾 이슈 신청 저장 중 (KST 타임존 보존):', {
            userId,
            title,
            category,
            deadline,
            deadline_iso: deadlineDate.toISOString(),
            deadline_kst: deadlineDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        });
        
        const result = await query(`
            INSERT INTO issue_requests (
                user_id, title, description, category, deadline
            ) VALUES ($1, $2, $3, $4, $5::timestamptz)
            RETURNING id
        `, [userId, title, description, category, deadline]);
        
        res.json({
            success: true,
            message: '이슈 신청이 완료되었습니다.',
            requestId: result.rows[0].id
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

// 관리자: 이슈 신청 통계 조회
router.get('/admin/stats', tempAdminMiddleware, async (req, res) => {
    try {
        const statsResult = await query(`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN is_ai_generated = true THEN 1 END) as ai_generated,
                COUNT(CASE WHEN is_ai_generated = false OR is_ai_generated IS NULL THEN 1 END) as user_generated
            FROM issue_requests
        `);
        
        const stats = statsResult.rows[0];
        
        res.json({
            success: true,
            stats: {
                pending: parseInt(stats.pending) || 0,
                approved: parseInt(stats.approved) || 0,
                rejected: parseInt(stats.rejected) || 0,
                aiGenerated: parseInt(stats.ai_generated) || 0,
                userGenerated: parseInt(stats.user_generated) || 0
            }
        });
        
    } catch (error) {
        console.error('이슈 신청 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '통계 조회 중 오류가 발생했습니다.'
        });
    }
});

// 관리자: 모든 이슈 신청 조회 (향상된 필터링 및 페이지네이션)
router.get('/admin/all', tempAdminMiddleware, async (req, res) => {
    try {
        const { 
            status = 'all', 
            type = 'all', 
            search = '', 
            page = 1, 
            limit = 20 
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;
        
        // 상태 필터
        if (status && status !== 'all') {
            whereConditions.push(`ir.status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }
        
        // 타입 필터 (AI 생성 vs 사용자 신청)
        if (type && type !== 'all') {
            if (type === 'ai') {
                whereConditions.push(`ir.is_ai_generated = true`);
            } else if (type === 'user') {
                whereConditions.push(`(ir.is_ai_generated = false OR ir.is_ai_generated IS NULL)`);
            }
        }
        
        // 검색
        if (search && search.trim()) {
            whereConditions.push(`(ir.title ILIKE $${paramIndex} OR ir.description ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
            params.push(`%${search.trim()}%`);
            paramIndex++;
        }
        
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        
        // 총 개수 조회
        const countResult = await query(`
            SELECT COUNT(*) as total
            FROM issue_requests ir
            JOIN users u ON ir.user_id = u.id
            ${whereClause}
        `, params);
        
        const total = parseInt(countResult.rows[0].total);
        
        // 이슈 신청 목록 조회
        const requestsResult = await query(`
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
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, [...params, limit, offset]);
        
        res.json({
            success: true,
            requests: requestsResult.rows.map(request => ({
                ...request,
                timeAgo: getTimeAgo(new Date(request.created_at))
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
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
router.put('/:id/approve', tempAdminMiddleware, async (req, res) => {
    try {
        const requestId = req.params.id;
        // 임시로 approved_by를 NULL로 설정 (FK 제약 조건 회피)
        const adminId = null;
        const { adminComments } = req.body;
        
        // 신청 존재 확인
        const requestResult = await query(`
            SELECT ir.*, u.username, u.id as user_id
            FROM issue_requests ir
            JOIN users u ON ir.user_id = u.id
            WHERE ir.id = $1 AND ir.status = 'pending'
        `, [requestId]);
        const request = requestResult.rows[0];
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: '존재하지 않거나 이미 처리된 신청입니다.'
            });
        }
        
        try {
            // 디버깅: 신청 정보 확인 (타임존 정보 포함)
            console.log('🔍 이슈 승인 중 - 신청 정보 (KST 타임존 보존):', {
                title: request.title,
                category: request.category,
                deadline: request.deadline,
                deadline_type: typeof request.deadline,
                deadline_string: new Date(request.deadline).toISOString(),
                deadline_kst: new Date(request.deadline).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
            });
            
            // 1. 정식 이슈로 등록 (원래 신청 마감시간 사용, TIMESTAMPTZ로 타임존 보존)
            const issueResult = await query(`
                INSERT INTO issues (title, category, description, image_url, yes_price, end_date, is_popular, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6::timestamptz, false, NOW(), NOW())
                RETURNING id, end_date
            `, [request.title, request.category, request.description || '', '', 50, request.deadline]);
            
            const issueId = issueResult.rows[0].id;
            const actualEndDate = issueResult.rows[0].end_date;
            console.log('✅ 이슈 생성 성공:', {
                issueId: issueId,
                requested_deadline: request.deadline,
                actual_end_date: actualEndDate
            });
            
            // 2. 신청 상태 업데이트 (approved_by는 NULL로 설정)
            await query(`
                UPDATE issue_requests 
                SET status = 'approved', 
                    approved_by = NULL, 
                    approved_at = NOW(),
                    admin_comments = $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [adminComments || '임시 관리자에 의해 승인됨', requestId]);
            
            // 3. 신청자에게 1000 GAM 지급 (gam_balance로 통일)
            await query(`
                UPDATE users 
                SET gam_balance = COALESCE(gam_balance, 0) + 1000
                WHERE id = $1
            `, [request.user_id]);
            
            console.log('✅ GAM 지급 완료:', request.user_id);
            
            // 4. 승인 알림 생성
            try {
                await NotificationService.notifyIssueRequestApproved(
                    request.user_id, 
                    issueId, 
                    request.title
                );
                console.log('✅ 승인 알림 생성 완료:', request.user_id);
            } catch (notificationError) {
                console.error('승인 알림 생성 실패:', notificationError);
                // 알림 실패는 전체 프로세스를 중단하지 않음
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
        
    } catch (error) {
        console.error('이슈 신청 승인 오류:', error);
        res.status(500).json({
            success: false,
            message: '이슈 신청 승인 중 오류가 발생했습니다.'
        });
    }
});

// 관리자: 이슈 신청 거부
router.put('/:id/reject', tempAdminMiddleware, async (req, res) => {
    try {
        const requestId = req.params.id;
        // 임시로 approved_by를 NULL로 설정 (FK 제약 조건 회피)
        const adminId = null;
        const { adminComments } = req.body;
        
        // 신청 존재 확인
        const requestResult = await query(`
            SELECT * FROM issue_requests 
            WHERE id = $1 AND status = 'pending'
        `, [requestId]);
        const request = requestResult.rows[0];
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: '존재하지 않거나 이미 처리된 신청입니다.'
            });
        }
        
        // 신청 상태 업데이트 (approved_by는 NULL로 설정)
        await query(`
            UPDATE issue_requests 
            SET status = 'rejected', 
                approved_by = NULL, 
                approved_at = NOW(),
                admin_comments = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [adminComments || '임시 관리자에 의해 거부됨', requestId]);
        
        // 거부 알림 생성
        try {
            await NotificationService.notifyIssueRequestRejected(
                request.user_id, 
                request.title, 
                adminComments || '관리자 검토 결과 부적절한 내용으로 판단되었습니다.'
            );
            console.log('✅ 거부 알림 생성 완료:', request.user_id);
        } catch (notificationError) {
            console.error('거부 알림 생성 실패:', notificationError);
            // 알림 실패는 전체 프로세스를 중단하지 않음
        }
        
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

// AI 이슈 자동 생성 (AI 에이전트 전용)
router.post('/ai-generate/:agentId', async (req, res) => {
    try {
        const { agentId } = req.params;
        
        // 에이전트별 이슈 생성 로직
        const issueData = generateIssueForAgent(agentId);
        
        if (!issueData) {
            return res.status(400).json({
                success: false,
                message: '지원되지 않는 에이전트입니다.'
            });
        }
        
        // AI 전용 사용자 ID (나중에 실제 AI 계정으로 변경 가능)
        const aiUserId = 1; // 기본값, 실제로는 AI 전용 계정 사용
        
        // 마감일 생성 (에이전트별 로직)
        const deadline = generateDeadlineForAgent(agentId);
        
        console.log('🤖 AI 이슈 생성 중:', {
            agentId,
            title: issueData.title,
            category: issueData.category,
            deadline: deadline.toISOString()
        });
        
        // 이슈 신청 생성 (AI 생성 플래그 포함)
        const result = await query(`
            INSERT INTO issue_requests (
                user_id, title, description, category, deadline, 
                is_ai_generated, agent_id, status
            ) VALUES ($1, $2, $3, $4, $5::timestamptz, true, $6, 'pending')
            RETURNING id
        `, [aiUserId, issueData.title, issueData.description, issueData.category, deadline.toISOString(), agentId]);
        
        res.json({
            success: true,
            message: 'AI 이슈가 생성되어 관리자 승인 대기 중입니다.',
            requestId: result.rows[0].id,
            issueData: {
                ...issueData,
                deadline: deadline.toISOString(),
                agentId
            }
        });
        
    } catch (error) {
        console.error('AI 이슈 생성 오류:', error);
        res.status(500).json({
            success: false,
            message: 'AI 이슈 생성 중 오류가 발생했습니다.'
        });
    }
});

// 에이전트별 이슈 생성 로직
function generateIssueForAgent(agentId) {
    const agentConfigs = {
        'data-kim': {
            category: '경제',
            themes: [
                { theme: '삼성전자', action: '10만원 돌파', timeframe: '다음 주 금요일' },
                { theme: '원달러 환율', action: '1,350원 돌파', timeframe: '이번 달 말' },
                { theme: '코스피', action: '2,700 돌파', timeframe: '다음 달' },
                { theme: 'SK하이닉스', action: '15만원 돌파', timeframe: '2주 후' },
                { theme: '한국은행 기준금리', action: '3.5% 인상', timeframe: '다음 달' }
            ]
        },
        'chart-king': {
            category: '코인',
            themes: [
                { theme: '비트코인', action: '$100,000 돌파', timeframe: '이번 달 말' },
                { theme: '이더리움', action: '$4,000 돌파', timeframe: '다음 주' },
                { theme: '리플(XRP)', action: '$2 돌파', timeframe: '2주 후' },
                { theme: '도지코인', action: '$1 돌파', timeframe: '이번 달 말' },
                { theme: '암호화폐 시총', action: '4조 달러 돌파', timeframe: '다음 달' }
            ]
        },
        'tech-guru': {
            category: '테크',
            themes: [
                { theme: 'Apple', action: '주가 $250 돌파', timeframe: '다음 달' },
                { theme: 'OpenAI GPT-5', action: '출시 발표', timeframe: '올해 말' },
                { theme: 'Tesla', action: '완전자율주행 승인', timeframe: '내년 초' },
                { theme: 'Meta', action: 'VR 헤드셋 100만대 판매', timeframe: '올해 말' },
                { theme: 'NVIDIA', action: '주가 $200 돌파', timeframe: '다음 달' }
            ]
        },
        'medical-doctor': {
            category: '일반',
            themes: [
                { theme: '독감 백신', action: '접종률 70% 달성', timeframe: '겨울 시즌' },
                { theme: '신약 개발', action: 'mRNA 치료제 승인', timeframe: '내년' },
                { theme: '의료 AI', action: '진단 정확도 95% 달성', timeframe: '내년 초' },
                { theme: '헬스케어', action: '원격진료 확대', timeframe: '다음 달' },
                { theme: '생명과학', action: '새로운 치료법 발견', timeframe: '올해 말' }
            ]
        },
        'hipster-choi': {
            category: '엔터',
            themes: [
                { theme: 'K-POP', action: '빌보드 1위 달성', timeframe: '다음 달' },
                { theme: '한국 영화', action: '아카데미 수상', timeframe: '내년' },
                { theme: 'Netflix', action: '한국 드라마 글로벌 1위', timeframe: '이번 달 말' },
                { theme: '게임 산업', action: '새로운 메가히트 출시', timeframe: '올해 말' },
                { theme: '메타버스', action: '가상 콘서트 100만명 동시접속', timeframe: '다음 달' }
            ]
        },
        'social-lover': {
            category: '일반',
            themes: [
                { theme: 'SNS 트렌드', action: '새로운 플랫폼 등장', timeframe: '내년' },
                { theme: '소셜 미디어', action: '규제 강화', timeframe: '다음 달' },
                { theme: '인플루언서', action: '광고 수익 급증', timeframe: '올해 말' },
                { theme: '라이브 커머스', action: '시장 규모 10조원 돌파', timeframe: '내년' },
                { theme: '커뮤니티', action: '새로운 소통 방식 등장', timeframe: '다음 달' }
            ]
        }
    };
    
    const config = agentConfigs[agentId];
    if (!config) return null;
    
    // 랜덤하게 테마 선택
    const selectedTheme = config.themes[Math.floor(Math.random() * config.themes.length)];
    
    const title = `${selectedTheme.theme}이(가) ${selectedTheme.timeframe}까지 ${selectedTheme.action}할까?`;
    
    const description = generateDescription(agentId, selectedTheme);
    
    return {
        title,
        description,
        category: config.category
    };
}

// 에이전트별 상세 설명 생성
function generateDescription(agentId, theme) {
    const descriptions = {
        'data-kim': `📊 경제 전문가 김데이터의 분석:

${theme.theme}의 최근 동향을 분석해보면, 다양한 시장 요인들이 ${theme.action}에 영향을 줄 것으로 예상됩니다.

주요 분석 포인트:
• 현재 시장 상황과 거래량 분석
• 글로벌 경제 동향 및 정책 변화
• 투자자 심리와 기관 매수/매도 동향
• 기술적 분석 및 차트 패턴

전문가적 관점에서 ${theme.timeframe}까지의 시장 전망을 종합해보면, 충분히 가능성 있는 시나리오로 판단됩니다.`,

        'chart-king': `📈 암호화폐 차트 분석가의 전망:

${theme.theme}의 차트 패턴과 온체인 데이터를 종합 분석한 결과, ${theme.action}의 가능성을 다음과 같이 평가합니다.

핵심 분석 요소:
• 현재 지지/저항선 분석
• 거래량 및 시장 참여자 동향
• 기관 투자 및 ETF 승인 영향
• 매크로 경제 환경과 디지털 자산 정책

차트 기술적 관점에서 ${theme.timeframe}는 중요한 변곡점이 될 것으로 예상되며, 여러 지표들이 상승 모멘텀을 시사하고 있습니다.`,

        'tech-guru': `💻 테크 구루의 기술 전망:

${theme.theme}의 최신 기술 동향과 산업 생태계 변화를 분석하면, ${theme.action}에 대한 가능성을 다음과 같이 평가할 수 있습니다.

주요 기술 트렌드:
• 혁신 기술의 개발 진행 상황
• 시장 경쟁력 및 업계 포지셔닝
• 규제 환경 및 정책 지원
• 글로벌 시장 확산 가능성

기술적 혁신과 시장 수용성을 종합하면, ${theme.timeframe}까지 충분한 변화가 일어날 것으로 전망됩니다.`,

        'medical-doctor': `🏥 의료 전문가의 헬스케어 전망:

${theme.theme} 분야의 최근 의학 연구 동향과 헬스케어 산업 변화를 분석하면, ${theme.action}에 대한 전망은 다음과 같습니다.

의학적 근거 및 분석:
• 최신 연구 결과 및 임상 데이터
• 의료 기술의 발전 속도
• 규제 기관의 승인 절차
• 의료진 및 환자의 수용도

의료 혁신의 속도와 사회적 필요성을 고려할 때, ${theme.timeframe}는 의미있는 변화가 나타날 수 있는 시점으로 분석됩니다.`,

        'hipster-choi': `🎭 힙스터 최의 엔터테인먼트 인사이트:

${theme.theme}의 최신 트렌드와 문화적 영향력을 분석해보면, ${theme.action}에 대한 가능성을 다음과 같이 평가합니다.

문화 트렌드 분석:
• 현재 대중문화의 흐름과 선호도
• 글로벌 시장에서의 한류 영향력
• 플랫폼별 콘텐츠 소비 패턴
• 새로운 기술과 엔터테인먼트의 융합

문화적 파급력과 시장 반응을 종합하면, ${theme.timeframe}까지 놀라운 성과가 가능할 것으로 전망됩니다.`,

        'social-lover': `📱 소셜 트렌드 분석가의 전망:

${theme.theme}의 소셜 미디어 동향과 사회적 변화를 분석하면, ${theme.action}에 대한 가능성을 다음과 같이 평가합니다.

소셜 트렌드 요소:
• 사용자 행동 패턴의 변화
• 새로운 소통 방식의 확산
• 플랫폼별 생태계 진화
• 세대별 디지털 문화 차이

소셜 미디어의 급속한 변화와 사용자 니즈를 고려할 때, ${theme.timeframe}는 중요한 변화의 시점이 될 것으로 예상됩니다.`
    };
    
    return descriptions[agentId] || `AI 에이전트 ${agentId}의 전문적 분석을 통해 ${theme.theme}의 ${theme.action} 가능성을 예측해봅니다.`;
}

// 에이전트별 마감일 생성
function generateDeadlineForAgent(agentId) {
    const now = new Date();
    const deadlineConfigs = {
        'data-kim': () => {
            // 경제: 주로 주말이나 월말 기준
            const daysToAdd = Math.random() < 0.5 ? 7 : 14; // 1주일 또는 2주일
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        },
        'chart-king': () => {
            // 코인: 빠른 변동성을 반영해 짧은 기간
            const daysToAdd = Math.floor(Math.random() * 14) + 7; // 1-3주
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        },
        'tech-guru': () => {
            // 테크: 개발 주기를 고려해 중장기
            const daysToAdd = Math.floor(Math.random() * 30) + 30; // 1-2개월
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        },
        'medical-doctor': () => {
            // 의료: 연구/승인 과정을 고려해 장기
            const daysToAdd = Math.floor(Math.random() * 60) + 30; // 1-3개월
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        },
        'hipster-choi': () => {
            // 엔터: 시상식이나 발표 일정을 고려
            const daysToAdd = Math.floor(Math.random() * 21) + 14; // 2-5주
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        },
        'social-lover': () => {
            // 소셜: 빠른 트렌드 변화를 반영
            const daysToAdd = Math.floor(Math.random() * 14) + 7; // 1-3주
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        }
    };
    
    const generator = deadlineConfigs[agentId];
    return generator ? generator() : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 기본 2주
}

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