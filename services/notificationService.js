const { run } = require('../database/database');

/**
 * 알림 서비스
 * 다양한 상황에서 사용자에게 알림을 생성하는 서비스
 */
class NotificationService {
    
    /**
     * 기본 알림 생성 함수
     */
    static async createNotification({
        userId,
        type,
        title,
        message,
        relatedId = null,
        relatedType = null
    }) {
        try {
            await run(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, type, title, message, relatedId, relatedType]
            );
            
            console.log(`✅ 알림 생성 완료: ${userId} - ${type} - ${title}`);
            
        } catch (error) {
            console.error('❌ 알림 생성 실패:', error);
            throw error;
        }
    }
    
    /**
     * 이슈 신청 승인 알림
     */
    static async notifyIssueRequestApproved(userId, issueId, issueTitle) {
        return this.createNotification({
            userId,
            type: 'issue_request_approved',
            title: '이슈 신청이 승인되었습니다',
            message: `신청하신 이슈 "${issueTitle}"가 승인되어 예측 시장에 등록되었습니다. 지금 바로 베팅에 참여해보세요!`,
            relatedId: issueId,
            relatedType: 'issue'
        });
    }
    
    /**
     * 이슈 신청 거부 알림
     */
    static async notifyIssueRequestRejected(userId, issueTitle, reason = null) {
        const defaultReason = '관리자 검토 결과 부적절한 내용이 포함되어 있습니다.';
        const message = `신청하신 이슈 "${issueTitle}"가 거부되었습니다. 사유: ${reason || defaultReason}`;
        
        return this.createNotification({
            userId,
            type: 'issue_request_rejected',
            title: '이슈 신청이 거부되었습니다',
            message,
            relatedType: 'issue_request'
        });
    }
    
    /**
     * 베팅 결과 알림 (승리)
     */
    static async notifyBettingWin(userId, issueId, issueTitle, betAmount, rewardAmount) {
        const profit = rewardAmount - betAmount;
        
        return this.createNotification({
            userId,
            type: 'betting_win',
            title: '🎉 베팅에서 승리했습니다!',
            message: `"${issueTitle}" 이슈에서 승리했습니다! 베팅 금액: ${betAmount.toLocaleString()} GAM, 수익: +${profit.toLocaleString()} GAM`,
            relatedId: issueId,
            relatedType: 'issue'
        });
    }
    
    /**
     * 베팅 결과 알림 (패배)
     */
    static async notifyBettingLoss(userId, issueId, issueTitle, betAmount, decisionReason = null) {
        let message = `"${issueTitle}" 이슈에서 아쉽게 패배했습니다. 베팅 금액: ${betAmount.toLocaleString()} GAM`;
        
        if (decisionReason) {
            message += `\n\n결정 사유: ${decisionReason}`;
        }
        
        return this.createNotification({
            userId,
            type: 'betting_loss',
            title: '😔 베팅 결과 안내',
            message,
            relatedId: issueId,
            relatedType: 'issue'
        });
    }
    
    /**
     * 이슈 마감 알림 (결과 대기)
     */
    static async notifyIssueClosed(userId, issueId, issueTitle, betAmount, choice) {
        const choiceText = choice === 'Yes' ? '찬성' : '반대';
        
        return this.createNotification({
            userId,
            type: 'issue_closed',
            title: '이슈가 마감되었습니다',
            message: `"${issueTitle}" 이슈가 마감되었습니다. 회원님의 선택: ${choiceText} (${betAmount.toLocaleString()} GAM)\n결과 발표를 기다려 주세요.`,
            relatedId: issueId,
            relatedType: 'issue'
        });
    }
    
    /**
     * GAM 포인트 지급 알림
     */
    static async notifyGamReward(userId, amount, reason, relatedId = null, relatedType = null) {
        return this.createNotification({
            userId,
            type: 'gam_reward',
            title: '🪙 GAM 포인트가 지급되었습니다',
            message: `${amount.toLocaleString()} GAM이 지급되었습니다. 사유: ${reason}`,
            relatedId,
            relatedType
        });
    }
    
    /**
     * 보상 지급 알림 (베팅 승리 시)
     */
    static async notifyRewardDistributed(userId, issueId, issueTitle, originalBet, totalReward) {
        const profit = totalReward - originalBet;
        
        return this.createNotification({
            userId,
            type: 'reward_distributed',
            title: '💰 보상이 지급되었습니다',
            message: `"${issueTitle}" 베팅 승리 보상이 지급되었습니다!\n베팅액: ${originalBet.toLocaleString()} GAM\n총 보상: ${totalReward.toLocaleString()} GAM\n순이익: +${profit.toLocaleString()} GAM`,
            relatedId: issueId,
            relatedType: 'reward'
        });
    }
    
    /**
     * 프리미엄 기능 알림
     */
    static async notifyPremiumFeature(userId, featureName, description) {
        return this.createNotification({
            userId,
            type: 'premium_feature',
            title: `✨ ${featureName} 기능이 활성화되었습니다`,
            message: description,
            relatedType: 'premium'
        });
    }
    
    /**
     * 시스템 공지 알림
     */
    static async notifySystemAnnouncement(userId, title, message) {
        return this.createNotification({
            userId,
            type: 'system_announcement',
            title: `📢 ${title}`,
            message,
            relatedType: 'system'
        });
    }
    
    /**
     * 특정 사용자에게 여러 알림 일괄 생성
     */
    static async createBulkNotifications(notifications) {
        try {
            const promises = notifications.map(notification => 
                this.createNotification(notification)
            );
            
            await Promise.all(promises);
            console.log(`✅ ${notifications.length}개의 알림이 일괄 생성되었습니다`);
            
        } catch (error) {
            console.error('❌ 일괄 알림 생성 실패:', error);
            throw error;
        }
    }
    
    /**
     * 모든 사용자에게 공지 알림 보내기
     */
    static async broadcastToAllUsers(title, message) {
        try {
            const { query } = require('../database/database');
            const usersResult = await query('SELECT id FROM users');
            const users = usersResult.rows;
            
            const notifications = users.map(user => ({
                userId: user.id,
                type: 'system_broadcast',
                title: `📢 ${title}`,
                message,
                relatedType: 'system'
            }));
            
            await this.createBulkNotifications(notifications);
            console.log(`✅ ${users.length}명의 사용자에게 공지 알림을 전송했습니다`);
            
        } catch (error) {
            console.error('❌ 전체 사용자 공지 전송 실패:', error);
            throw error;
        }
    }
}

module.exports = NotificationService;