const cron = require('node-cron');
const { getDB, getCurrentTimeSQL } = require('../database/database');
const NotificationService = require('./notificationService');

class IssueScheduler {
    constructor() {
        this.isRunning = false;
    }

    getDatabase() {
        return getDB();
    }

    // 자동 이슈 마감 처리
    async closeExpiredIssues() {
        try {
            console.log('🔄 자동 이슈 마감 검사 시작...');
            
            const { query: dbQuery, run: dbRun } = require('../database/database');
            
            // 마감 시간이 지났지만 아직 마감되지 않은 이슈들 조회
            const queryString = `
                SELECT id, title, end_date 
                FROM issues 
                WHERE end_date < ${getCurrentTimeSQL()} 
                AND status = 'active'
                AND result IS NULL
            `;
            
            const result = await dbQuery(queryString);
            const expiredIssues = result.rows || [];

            if (expiredIssues.length === 0) {
                console.log('✅ 마감할 이슈가 없습니다.');
                return;
            }

            console.log(`📋 ${expiredIssues.length}개의 만료된 이슈를 마감 처리합니다.`);

            // 각 이슈를 마감 상태로 변경하고 알림 전송
            for (const issue of expiredIssues) {
                try {
                    await dbRun('UPDATE issues SET status = $1 WHERE id = $2', ['closed', issue.id]);
                    console.log(`✅ 이슈 "${issue.title}" (ID: ${issue.id}) 자동 마감 완료`);
                    
                    // 해당 이슈에 베팅한 사용자들에게 알림 전송
                    await this.notifyBettorsAboutIssueClosure(issue.id, issue.title);
                    
                } catch (err) {
                    console.error(`❌ 이슈 ${issue.id} 마감 실패:`, err);
                }
            }

            console.log('🎉 자동 이슈 마감 처리 완료');

        } catch (error) {
            console.error('❌ 자동 이슈 마감 처리 중 오류:', error);
        }
    }

    // 이슈 마감 시 베팅한 사용자들에게 알림 전송
    async notifyBettorsAboutIssueClosure(issueId, issueTitle) {
        try {
            const { query: dbQuery } = require('../database/database');
            
            // 해당 이슈에 베팅한 사용자들 조회
            const bettorsResult = await dbQuery(`
                SELECT DISTINCT 
                    b.user_id, 
                    b.choice, 
                    b.amount
                FROM bets b
                WHERE b.issue_id = $1
            `, [issueId]);
            
            const bettors = bettorsResult.rows || [];
            
            if (bettors.length === 0) {
                console.log(`이슈 ${issueId}에 베팅한 사용자가 없습니다.`);
                return;
            }
            
            // 각 베터에게 알림 전송
            for (const bettor of bettors) {
                try {
                    await NotificationService.notifyIssueClosed(
                        bettor.user_id,
                        issueId,
                        issueTitle,
                        bettor.amount,
                        bettor.choice
                    );
                } catch (notificationError) {
                    console.error(`베터 ${bettor.user_id}에게 알림 전송 실패:`, notificationError);
                }
            }
            
            console.log(`✅ 이슈 "${issueTitle}"에 대해 ${bettors.length}명의 베터에게 마감 알림을 전송했습니다.`);
            
        } catch (error) {
            console.error(`❌ 이슈 ${issueId} 마감 알림 전송 실패:`, error);
        }
    }

    // 스케줄러 시작
    start() {
        if (this.isRunning) {
            console.log('⚠️  스케줄러가 이미 실행 중입니다.');
            return;
        }

        // 매 분마다 실행 (운영환경에서는 5분 또는 10분으로 변경 권장)
        this.cronJob = cron.schedule('* * * * *', async () => {
            await this.closeExpiredIssues();
        }, {
            scheduled: false,
            timezone: 'Asia/Seoul'
        });

        this.cronJob.start();
        this.isRunning = true;
        
        console.log('🚀 이슈 자동 마감 스케줄러가 시작되었습니다. (매 분마다 실행)');
        console.log('🕐 현재 시간:', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
    }

    // 스케줄러 중지
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.isRunning = false;
            console.log('⏹️  이슈 자동 마감 스케줄러가 중지되었습니다.');
        }
    }

    // 스케줄러 상태 확인
    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun: this.cronJob ? new Date(Date.now() + 60000) : null // 매 분 실행이므로 1분 후로 표시
        };
    }

    // 수동으로 만료된 이슈 검사 실행
    async runManualCheck() {
        console.log('🔧 수동 이슈 마감 검사 실행...');
        await this.closeExpiredIssues();
    }
}

// 싱글톤 인스턴스 생성
const issueScheduler = new IssueScheduler();

module.exports = issueScheduler;