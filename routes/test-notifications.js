const express = require('express');
const NotificationService = require('../services/notificationService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 개발/테스트 환경에서만 사용 가능
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * 테스트용 알림 생성 엔드포인트
 * POST /api/test-notifications/create
 */
router.post('/create', authMiddleware, async (req, res) => {
    if (!isDevelopment) {
        return res.status(403).json({
            success: false,
            message: '이 기능은 개발 환경에서만 사용 가능합니다.'
        });
    }
    
    try {
        const userId = req.user.id;
        const { type } = req.body;
        
        // 알림 타입별로 테스트 알림 생성
        switch (type) {
            case 'issue_request_approved':
                await NotificationService.notifyIssueRequestApproved(
                    userId, 
                    1, 
                    '테스트 이슈 - 비트코인 10만 달러 돌파할까?'
                );
                break;
                
            case 'issue_request_rejected':
                await NotificationService.notifyIssueRequestRejected(
                    userId, 
                    '테스트 거부 이슈', 
                    '부적절한 내용이 포함되어 있어 거부되었습니다.'
                );
                break;
                
            case 'betting_win':
                await NotificationService.notifyBettingWin(
                    userId, 
                    1, 
                    '테스트 승리 이슈', 
                    5000, 
                    8500
                );
                break;
                
            case 'betting_loss':
                await NotificationService.notifyBettingLoss(
                    userId, 
                    1, 
                    '테스트 패배 이슈', 
                    3000, 
                    '예상과 다른 결과가 나왔습니다.'
                );
                break;
                
            case 'issue_closed':
                await NotificationService.notifyIssueClosed(
                    userId, 
                    1, 
                    '테스트 마감 이슈', 
                    2500, 
                    'Yes'
                );
                break;
                
            case 'gam_reward':
                await NotificationService.notifyGamReward(
                    userId, 
                    1000, 
                    '일일 출석 보상'
                );
                break;
                
            case 'reward_distributed':
                await NotificationService.notifyRewardDistributed(
                    userId, 
                    1, 
                    '테스트 보상 이슈', 
                    5000, 
                    7500
                );
                break;
                
            case 'premium_feature':
                await NotificationService.notifyPremiumFeature(
                    userId, 
                    '프리미엄 베팅', 
                    '고급 베팅 기능이 활성화되었습니다. 더 높은 배당률을 즐겨보세요!'
                );
                break;
                
            case 'system_announcement':
                await NotificationService.notifySystemAnnouncement(
                    userId, 
                    '시스템 업데이트', 
                    '새로운 기능이 추가되었습니다. 지금 확인해보세요!'
                );
                break;
                
            case 'all':
                // 모든 유형의 테스트 알림 생성
                const notifications = [
                    {
                        userId,
                        type: 'issue_request_approved',
                        title: '이슈 신청이 승인되었습니다',
                        message: '신청하신 이슈 "테스트 이슈 1"가 승인되어 예측 시장에 등록되었습니다.',
                        relatedId: 1,
                        relatedType: 'issue'
                    },
                    {
                        userId,
                        type: 'betting_win',
                        title: '🎉 베팅에서 승리했습니다!',
                        message: '"테스트 이슈 2"에서 승리했습니다! 베팅 금액: 5,000 GAM, 수익: +3,500 GAM',
                        relatedId: 2,
                        relatedType: 'issue'
                    },
                    {
                        userId,
                        type: 'gam_reward',
                        title: '🪙 GAM 포인트가 지급되었습니다',
                        message: '1,000 GAM이 지급되었습니다. 사유: 일일 출석 보상',
                        relatedType: 'reward'
                    }
                ];
                
                await NotificationService.createBulkNotifications(notifications);
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    message: '지원하지 않는 알림 타입입니다.',
                    supportedTypes: [
                        'issue_request_approved',
                        'issue_request_rejected', 
                        'betting_win',
                        'betting_loss',
                        'issue_closed',
                        'gam_reward',
                        'reward_distributed',
                        'premium_feature',
                        'system_announcement',
                        'all'
                    ]
                });
        }
        
        res.json({
            success: true,
            message: `${type === 'all' ? '모든 유형의' : type} 테스트 알림이 생성되었습니다.`,
            type
        });
        
    } catch (error) {
        console.error('테스트 알림 생성 실패:', error);
        res.status(500).json({
            success: false,
            message: '테스트 알림 생성 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 테스트용 전체 사용자 공지 알림
 * POST /api/test-notifications/broadcast
 */
router.post('/broadcast', authMiddleware, async (req, res) => {
    if (!isDevelopment) {
        return res.status(403).json({
            success: false,
            message: '이 기능은 개발 환경에서만 사용 가능합니다.'
        });
    }
    
    try {
        const { title, message } = req.body;
        
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: '제목과 메시지를 모두 입력해주세요.'
            });
        }
        
        await NotificationService.broadcastToAllUsers(title, message);
        
        res.json({
            success: true,
            message: '전체 사용자에게 공지 알림이 전송되었습니다.',
            broadcast: { title, message }
        });
        
    } catch (error) {
        console.error('공지 알림 전송 실패:', error);
        res.status(500).json({
            success: false,
            message: '공지 알림 전송 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

/**
 * 테스트용 알림 시스템 상태 확인
 * GET /api/test-notifications/status
 */
router.get('/status', async (req, res) => {
    if (!isDevelopment) {
        return res.status(403).json({
            success: false,
            message: '이 기능은 개발 환경에서만 사용 가능합니다.'
        });
    }
    
    try {
        const { query } = require('../database/database');
        
        // 전체 알림 개수
        const totalResult = await query('SELECT COUNT(*) as total FROM notifications');
        const total = parseInt(totalResult.rows[0].total);
        
        // 읽지 않은 알림 개수
        const unreadResult = await query('SELECT COUNT(*) as unread FROM notifications WHERE is_read = false');
        const unread = parseInt(unreadResult.rows[0].unread);
        
        // 알림 타입별 통계
        const typeStatsResult = await query(`
            SELECT type, COUNT(*) as count 
            FROM notifications 
            GROUP BY type 
            ORDER BY count DESC
        `);
        const typeStats = typeStatsResult.rows;
        
        // 최근 알림 5개
        const recentResult = await query(`
            SELECT n.type, n.title, n.created_at, u.username
            FROM notifications n
            JOIN users u ON n.user_id = u.id
            ORDER BY n.created_at DESC
            LIMIT 5
        `);
        const recent = recentResult.rows;
        
        res.json({
            success: true,
            status: {
                total,
                unread,
                read: total - unread,
                typeStats,
                recent
            },
            message: '알림 시스템이 정상 작동 중입니다.'
        });
        
    } catch (error) {
        console.error('알림 상태 확인 실패:', error);
        res.status(500).json({
            success: false,
            message: '알림 상태 확인 중 오류가 발생했습니다.',
            error: error.message
        });
    }
});

module.exports = router;