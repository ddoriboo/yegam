const express = require('express');
const { query, run, get } = require('../database/database');
const { authMiddleware } = require('../middleware/auth');
const {
    logIssueModification,
    validateDeadlineChange,
    rateLimitIssueModifications
} = require('../middleware/simple-issue-audit');
const {
    endDateChangeRateLimit,
    validateEndDateChangePermission,
    logEndDateChange,
    requireAdminApprovalForCriticalChanges,
    blockAIAgents
} = require('../middleware/end-date-security');
const EndDateTracker = require('../utils/end-date-tracker');

const router = express.Router();

// 모든 이슈 조회
router.get('/', async (req, res) => {
    try {
        const status = req.query.status || 'active'; // 기본값은 active
        let whereClause = '';
        let params = [];
        
        if (status === 'all') {
            whereClause = 'WHERE i.status != $1';
            params = ['deleted']; // deleted 상태만 제외
        } else if (status === 'closed') {
            whereClause = 'WHERE i.status = $1';
            params = ['closed'];
        } else {
            whereClause = 'WHERE i.status = $1';
            params = ['active'];
        }
        
        const result = await query(`
            SELECT 
                i.*,
                COALESCE(c.comment_count, 0) as comment_count,
                COALESCE(b.participant_count, 0) as participant_count,
                COALESCE(b.total_volume, 0) as total_volume
            FROM issues i
            LEFT JOIN (
                SELECT issue_id, COUNT(*) as comment_count
                FROM comments
                GROUP BY issue_id
            ) c ON i.id = c.issue_id
            LEFT JOIN (
                SELECT issue_id, 
                       COUNT(DISTINCT user_id) as participant_count,
                       SUM(amount) as total_volume
                FROM bets
                GROUP BY issue_id
            ) b ON i.id = b.issue_id
            ${whereClause}
            ORDER BY i.created_at DESC
        `, params);
        const issues = result.rows;
        
        // 🔍 시간 데이터 상세 분석
        console.log('🔍 DB에서 가져온 시간 데이터 분석:');
        issues.slice(0, 3).forEach((issue, index) => {
            console.log(`${index + 1}. "${issue.title}"`);
            if (issue.end_date) {
                const rawEndDate = issue.end_date;
                const parsedDate = new Date(rawEndDate);
                
                console.log(`   📊 원본 DB 데이터: ${rawEndDate}`);
                console.log(`   📊 JavaScript 파싱: ${parsedDate.toISOString()}`);
                console.log(`   📊 KST 표시: ${parsedDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
                console.log(`   📊 브라우저 로컬: ${parsedDate.toLocaleString('ko-KR')}`);
                console.log(`   📊 타입: ${typeof rawEndDate}, 값: ${rawEndDate}`);
                console.log(`   📊 UTC 타임스탬프: ${parsedDate.getTime()}`);
                console.log('   ---');
            }
        });
        
        res.json({
            success: true,
            issues: issues.map(issue => {
                // 🔧 올바른 UTC → KST 변환
                // DB에서 받은 UTC 시간을 프론트엔드에서 사용할 수 있도록 처리
                let processedEndDate = issue.end_date;
                
                if (issue.end_date) {
                    // UTC 시간을 받아서 그대로 ISO string으로 전송
                    // 프론트엔드에서 로컬 시간대에 맞게 변환하도록 함
                    const utcDate = new Date(issue.end_date);
                    processedEndDate = utcDate.toISOString();
                }
                
                return {
                    ...issue,
                    isPopular: Boolean(issue.is_popular),
                    commentCount: parseInt(issue.comment_count) || 0,
                    participantCount: parseInt(issue.participant_count) || 0,
                    totalVolume: parseInt(issue.total_volume) || 0,
                    end_date: processedEndDate,
                    // 🔍 디버깅을 위한 시간 정보
                    end_date_debug: {
                        original_utc: issue.end_date,
                        processed: processedEndDate,
                        timestamp: issue.end_date ? new Date(issue.end_date).getTime() : null
                    }
                };
            })
        });
    } catch (error) {
        console.error('이슈 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '이슈를 불러오는 중 오류가 발생했습니다.' 
        });
    }
});

// 이슈별 베팅 통계 조회
router.get('/:id/betting-stats', async (req, res) => {
    try {
        const issueId = req.params.id;
        
        // 이슈 존재 확인
        const issue = await get('SELECT id, title, status FROM issues WHERE id = $1', [issueId]);
        if (!issue) {
            return res.status(404).json({ 
                success: false, 
                message: '존재하지 않는 이슈입니다.' 
            });
        }
        
        // 베팅 통계 계산
        const statsResult = await query(`
            SELECT 
                choice,
                SUM(amount) as total_amount,
                COUNT(*) as bet_count
            FROM bets 
            WHERE issue_id = $1 
            GROUP BY choice
        `, [issueId]);
        
        let yesAmount = 0;
        let noAmount = 0;
        let totalParticipants = 0;
        
        statsResult.rows.forEach(row => {
            if (row.choice === 'Yes') {
                yesAmount = parseInt(row.total_amount) || 0;
            } else if (row.choice === 'No') {
                noAmount = parseInt(row.total_amount) || 0;
            }
            totalParticipants += parseInt(row.bet_count) || 0;
        });
        
        const totalAmount = yesAmount + noAmount;
        const houseEdge = 0.02; // 수수료 2%로 통일
        const effectivePool = totalAmount * (1 - houseEdge);
        
        // 개선된 배당률 계산 시스템
        let yesOdds = 1.0;
        let noOdds = 1.0;
        
        if (totalAmount > 0) {
            // 극단적 상황 처리: 한 쪽에만 베팅이 있는 경우
            if (yesAmount === 0 && noAmount > 0) {
                // Yes 베팅이 없는 경우: Yes는 매우 높은 배당, No는 낮은 배당
                yesOdds = Math.min(50.0, effectivePool / Math.max(1, totalAmount * 0.01)); // 최대 50배
                noOdds = 1.01; // 최소 배당
            } else if (noAmount === 0 && yesAmount > 0) {
                // No 베팅이 없는 경우: No는 매우 높은 배당, Yes는 낮은 배당  
                noOdds = Math.min(50.0, effectivePool / Math.max(1, totalAmount * 0.01)); // 최대 50배
                yesOdds = 1.01; // 최소 배당
            } else if (yesAmount > 0 && noAmount > 0) {
                // 양쪽 모두 베팅이 있는 정상적인 경우
                yesOdds = Math.max(1.01, effectivePool / yesAmount);
                noOdds = Math.max(1.01, effectivePool / noAmount);
            } else {
                // 아무 베팅도 없는 초기 상태
                yesOdds = 2.0;
                noOdds = 2.0;
            }
            
            // 배당률 상한선 설정 (너무 높은 배당 방지)
            yesOdds = Math.min(yesOdds, 50.0);
            noOdds = Math.min(noOdds, 50.0);
        } else {
            // 베팅이 전혀 없는 초기 상태
            yesOdds = 2.0;
            noOdds = 2.0;
        }
        
        // 확률 계산 (배당률 역수)
        const yesImpliedProbability = yesAmount > 0 ? (yesAmount / totalAmount) * 100 : 50;
        const noImpliedProbability = noAmount > 0 ? (noAmount / totalAmount) * 100 : 50;
        
        res.json({
            success: true,
            stats: {
                issueId: parseInt(issueId),
                issueTitle: issue.title,
                issueStatus: issue.status,
                yesAmount,
                noAmount,
                totalAmount,
                totalParticipants,
                yesOdds: Math.round(yesOdds * 100) / 100, // 소수점 2자리
                noOdds: Math.round(noOdds * 100) / 100,
                yesImpliedProbability: Math.round(yesImpliedProbability * 10) / 10,
                noImpliedProbability: Math.round(noImpliedProbability * 10) / 10,
                houseEdge: houseEdge * 100
            }
        });
        
    } catch (error) {
        console.error('베팅 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '베팅 통계를 불러오는 중 오류가 발생했습니다.' 
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
router.post('/', 
    authMiddleware,
    rateLimitIssueModifications(),
    logIssueModification('CREATE_ISSUE'),
    async (req, res) => {
    try {
        const { title, category, description, imageUrl, endDate, yesPrice, isPopular } = req.body;
        
        if (!title || !category || !endDate) {
            return res.status(400).json({ 
                success: false, 
                message: '필수 필드를 모두 입력해주세요.' 
            });
        }
        
        // 🇰🇷 KST 기준으로 시간 저장 (변환 없음)
        // PostgreSQL 타임존이 Asia/Seoul로 설정되어 있음
        const insertQuery = `
            INSERT INTO issues (title, category, description, image_url, end_date, yes_price, is_popular, created_at, updated_at) 
            VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, NOW(), NOW())
            RETURNING id
        `;
        
        const result = await query(insertQuery, [
            title, 
            category, 
            description || null, 
            imageUrl || null, 
            endDate, // KST 기준 시간
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
router.put('/:id', 
    authMiddleware,
    require('../middleware/end-date-security').validateEndDateChange, // 🔒 강력한 end_date 보안 미들웨어 추가
    rateLimitIssueModifications(),
    validateDeadlineChange(),
    logIssueModification('UPDATE_ISSUE'),
    async (req, res) => {
    try {
        const issueId = req.params.id;
        const { title, category, description, imageUrl, endDate, yesPrice, isPopular } = req.body;
        
        // 🇰🇷 KST 기준으로 시간 업데이트 (변환 없음)
        const updateQuery = `
            UPDATE issues 
            SET title = $1, category = $2, description = $3, image_url = $4, 
                end_date = $5::timestamptz, yes_price = $6, is_popular = $7, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $8
        `;
        
        const result = await run(updateQuery, [
            title, 
            category, 
            description || null, 
            imageUrl || null, 
            endDate, // KST 기준 시간
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
router.delete('/:id', 
    authMiddleware,
    rateLimitIssueModifications(),
    logIssueModification('DELETE_ISSUE'),
    async (req, res) => {
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
router.patch('/:id/toggle-popular', 
    authMiddleware,
    rateLimitIssueModifications(),
    logIssueModification('TOGGLE_POPULAR'),
    async (req, res) => {
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