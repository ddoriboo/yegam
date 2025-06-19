const cron = require('node-cron');
const { getDB } = require('../database/database');

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
            
            const db = this.getDatabase();
            if (!db) {
                console.error('❌ 데이터베이스 연결을 가져올 수 없습니다.');
                return;
            }
            
            // 마감 시간이 지났지만 아직 마감되지 않은 이슈들 조회
            const expiredIssues = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT id, title, end_date 
                    FROM issues 
                    WHERE end_date < datetime('now') 
                    AND status = 'active'
                    AND result IS NULL
                `, (err, issues) => {
                    if (err) reject(err);
                    else resolve(issues);
                });
            });

            if (expiredIssues.length === 0) {
                console.log('✅ 마감할 이슈가 없습니다.');
                return;
            }

            console.log(`📋 ${expiredIssues.length}개의 만료된 이슈를 마감 처리합니다.`);

            // 각 이슈를 마감 상태로 변경
            for (const issue of expiredIssues) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE issues SET status = "closed" WHERE id = ?',
                        [issue.id],
                        function(err) {
                            if (err) {
                                console.error(`❌ 이슈 ${issue.id} 마감 실패:`, err);
                                reject(err);
                            } else {
                                console.log(`✅ 이슈 "${issue.title}" (ID: ${issue.id}) 자동 마감 완료`);
                                resolve();
                            }
                        }
                    );
                });
            }

            console.log('🎉 자동 이슈 마감 처리 완료');

        } catch (error) {
            console.error('❌ 자동 이슈 마감 처리 중 오류:', error);
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
            nextRun: this.cronJob ? this.cronJob.nextRun() : null
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