const express = require('express');
const { fetchAll, fetchOne, createIssue, updateIssue, executeQuery } = require('../utils/database');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { validateIssueData } = require('../utils/validation');
const { asyncHandler, createError } = require('../middleware/errorHandler');

const router = express.Router();

// 모든 이슈 조회 (정렬 및 필터링 지원)
router.get('/', asyncHandler(async (req, res) => {
    const { category, sort, popular } = req.query;
    
    let query = `
        SELECT i.*, 
               COALESCE(i.yes_volume, 0) as yes_volume,
               COALESCE(i.no_volume, 0) as no_volume,
               COALESCE(i.total_volume, 0) as total_volume,
               ROUND(COALESCE(i.yes_volume, 0) * 100.0 / NULLIF(COALESCE(i.total_volume, 0), 0), 1) as yes_percentage,
               COALESCE(bet_stats.participant_count, 0) as participant_count,
               COALESCE(bet_stats.total_bets, 0) as total_bets,
               COALESCE(comment_stats.comment_count, 0) as comment_count
        FROM issues i 
        LEFT JOIN (
            SELECT issue_id, 
                   COUNT(DISTINCT user_id) as participant_count,
                   COUNT(*) as total_bets
            FROM bets 
            GROUP BY issue_id
        ) bet_stats ON i.id = bet_stats.issue_id
        LEFT JOIN (
            SELECT issue_id, COUNT(*) as comment_count
            FROM comments 
            GROUP BY issue_id
        ) comment_stats ON i.id = comment_stats.issue_id
        WHERE i.status = "active"
    `;
    
    const params = [];
    
    // 카테고리 필터링
    if (category && category !== 'all') {
        query += ' AND i.category = ?';
        params.push(category);
    }
    
    // 인기 이슈 필터링
    if (popular === 'true') {
        query += ' AND i.is_popular = 1';
    }
    
    // 정렬
    switch (sort) {
        case 'latest':
            query += ' ORDER BY i.created_at DESC';
            break;
        case 'deadline':
            query += ' ORDER BY i.end_date ASC';
            break;
        case 'popular':
            query += ' ORDER BY i.total_volume DESC, i.created_at DESC';
            break;
        case 'ending_soon':
            query += ' ORDER BY i.end_date ASC';
            break;
        default:
            query += ' ORDER BY i.is_popular DESC, i.created_at DESC';
    }
    
    const issues = await fetchAll(query, params);
    
    // 각 이슈에 대해 확률 계산 및 추가 정보 포함
    const processedIssues = issues.map(issue => {
        const totalVolume = issue.total_volume || 0;
        const yesVolume = issue.yes_volume || 0;
        const noVolume = issue.no_volume || 0;
        
        let yesPercentage = 50; // 기본값
        if (totalVolume > 0) {
            yesPercentage = Math.round((yesVolume / totalVolume) * 100);
        }
        
        // 마감까지 남은 시간 계산
        const endDate = new Date(issue.end_date);
        const now = new Date();
        const timeLeft = endDate - now;
        const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
        
        return {
            ...issue,
            isPopular: Boolean(issue.is_popular),
            yesPercentage: yesPercentage,
            noPercentage: 100 - yesPercentage,
            totalVolume: totalVolume,
            yesVolume: yesVolume,
            noVolume: noVolume,
            daysLeft: daysLeft > 0 ? daysLeft : 0,
            isExpired: timeLeft <= 0,
            participantCount: issue.participant_count || 0,
            totalBets: issue.total_bets || 0,
            commentCount: issue.comment_count || 0
        };
    });
    
    res.json({
        success: true,
        issues: processedIssues
    });
}));

// 특정 이슈 조회
router.get('/:id', asyncHandler(async (req, res) => {
    const issueId = req.params.id;
    
    const issue = await fetchOne('SELECT * FROM issues WHERE id = ? AND status = "active"', [issueId]);
    
    if (!issue) {
        throw createError(404, '존재하지 않는 이슈입니다.');
    }
    
    res.json({
        success: true,
        issue: {
            ...issue,
            isPopular: Boolean(issue.is_popular)
        }
    });
}));

// 새 이슈 생성 (관리자용)
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
    const { title, category, endDate, yesPrice, isPopular } = req.body;
    
    validateIssueData({ title, category, endDate });
    
    const result = await createIssue({
        title,
        category,
        endDate,
        yesPrice: yesPrice || 50,
        isPopular: Boolean(isPopular)
    });
    
    res.json({
        success: true,
        message: '이슈가 성공적으로 생성되었습니다.',
        issueId: result.id
    });
}));

// 이슈 수정 (관리자용)
router.put('/:id', authMiddleware, asyncHandler(async (req, res) => {
    const issueId = req.params.id;
    const { title, category, endDate, yesPrice, isPopular } = req.body;
    
    validateIssueData({ title, category, endDate });
    
    const result = await updateIssue(issueId, {
        title,
        category,
        end_date: endDate,
        yes_price: yesPrice,
        is_popular: isPopular ? 1 : 0
    });
    
    if (result.changes === 0) {
        throw createError(404, '존재하지 않는 이슈입니다.');
    }
    
    res.json({
        success: true,
        message: '이슈가 성공적으로 수정되었습니다.'
    });
}));

// 이슈 삭제 (관리자용)
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
    const issueId = req.params.id;
    
    const result = await executeQuery('UPDATE issues SET status = "deleted" WHERE id = ?', [issueId]);
    
    if (result.changes === 0) {
        throw createError(404, '존재하지 않는 이슈입니다.');
    }
    
    res.json({
        success: true,
        message: '이슈가 성공적으로 삭제되었습니다.'
    });
}));

// 인기 이슈 토글 (관리자용)
router.patch('/:id/toggle-popular', authMiddleware, asyncHandler(async (req, res) => {
    const issueId = req.params.id;
    
    // 현재 상태 확인 후 토글
    const issue = await fetchOne('SELECT is_popular FROM issues WHERE id = ?', [issueId]);
    
    if (!issue) {
        throw createError(404, '존재하지 않는 이슈입니다.');
    }
    
    const newPopularStatus = issue.is_popular ? 0 : 1;
    
    await executeQuery('UPDATE issues SET is_popular = ? WHERE id = ?', [newPopularStatus, issueId]);
    
    res.json({
        success: true,
        message: `이슈가 ${newPopularStatus ? '인기' : '일반'} 이슈로 변경되었습니다.`,
        isPopular: Boolean(newPopularStatus)
    });
}));

module.exports = router;