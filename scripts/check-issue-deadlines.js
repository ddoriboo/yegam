const { initPostgreSQL, query } = require('../database/postgres');
require('dotenv').config();

async function checkIssueDeadlines() {
  // PostgreSQL 초기화
  await initPostgreSQL();
  try {
    console.log('=== 현재 활성 이슈들의 마감시간 확인 ===\n');
    
    // 1. 모든 활성 이슈 확인
    const activeIssues = await query(`
      SELECT id, title, end_date, category, is_resolved, created_at, 
             end_date AT TIME ZONE 'Asia/Seoul' as end_date_kst,
             created_at AT TIME ZONE 'Asia/Seoul' as created_at_kst
      FROM issues 
      WHERE is_resolved = false 
      ORDER BY end_date ASC
    `);
    
    console.log(`활성 이슈 수: ${activeIssues.rows.length}개\n`);
    
    // 2. FIFA 클럽월드컵 관련 이슈 검색
    console.log('=== FIFA 클럽월드컵 관련 이슈 ===');
    const fifaIssues = activeIssues.rows.filter(issue => 
      issue.title.includes('FIFA') || issue.title.includes('클럽월드컵')
    );
    
    if (fifaIssues.length > 0) {
      fifaIssues.forEach(issue => {
        console.log(`ID: ${issue.id}`);
        console.log(`제목: ${issue.title}`);
        console.log(`카테고리: ${issue.category}`);
        console.log(`생성일: ${issue.created_at_kst}`);
        console.log(`마감시간(UTC): ${issue.end_date}`);
        console.log(`마감시간(KST): ${issue.end_date_kst}`);
        console.log('---');
      });
    } else {
      console.log('FIFA 클럽월드컵 관련 이슈가 없습니다.\n');
    }
    
    // 3. 최근 생성된 이슈 TOP 10
    console.log('\n=== 최근 생성된 이슈 TOP 10 ===');
    const recentIssues = await query(`
      SELECT id, title, end_date, category, created_at,
             end_date AT TIME ZONE 'Asia/Seoul' as end_date_kst,
             created_at AT TIME ZONE 'Asia/Seoul' as created_at_kst
      FROM issues 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    recentIssues.rows.forEach((issue, index) => {
      console.log(`${index + 1}. [ID: ${issue.id}] ${issue.title}`);
      console.log(`   카테고리: ${issue.category}`);
      console.log(`   생성일: ${issue.created_at_kst}`);
      console.log(`   마감시간(KST): ${issue.end_date_kst}`);
      console.log(`   상태: ${issue.is_resolved ? '마감됨' : '진행중'}`);
    });
    
    // 4. 마감시간이 가까운 이슈 (24시간 이내)
    console.log('\n=== 24시간 이내 마감 예정 이슈 ===');
    const soonToExpire = await query(`
      SELECT id, title, end_date,
             end_date AT TIME ZONE 'Asia/Seoul' as end_date_kst,
             EXTRACT(EPOCH FROM (end_date - NOW())) / 3600 as hours_remaining
      FROM issues 
      WHERE is_resolved = false 
        AND end_date < NOW() + INTERVAL '24 hours'
        AND end_date > NOW()
      ORDER BY end_date ASC
    `);
    
    if (soonToExpire.rows.length > 0) {
      soonToExpire.rows.forEach(issue => {
        console.log(`[ID: ${issue.id}] ${issue.title}`);
        console.log(`   마감까지 ${Math.round(issue.hours_remaining)}시간 남음`);
        console.log(`   마감시간(KST): ${issue.end_date_kst}`);
      });
    } else {
      console.log('24시간 이내 마감 예정인 이슈가 없습니다.');
    }
    
    // 5. 이슈 변경 이력 확인 (issue_audit 테이블이 있다면)
    console.log('\n=== 최근 이슈 변경 이력 ===');
    try {
      const auditLogs = await query(`
        SELECT ia.*, i.title 
        FROM issue_audit ia
        JOIN issues i ON ia.issue_id = i.id
        WHERE ia.field_name = 'end_date'
        ORDER BY ia.created_at DESC
        LIMIT 20
      `);
      
      if (auditLogs.rows.length > 0) {
        auditLogs.rows.forEach(log => {
          console.log(`[${log.created_at}] 이슈 #${log.issue_id}: ${log.title}`);
          console.log(`   변경: ${log.old_value} → ${log.new_value}`);
          console.log(`   수행자: ${log.admin_id ? `관리자 #${log.admin_id}` : `사용자 #${log.user_id}`}`);
        });
      }
    } catch (err) {
      console.log('issue_audit 테이블이 없거나 접근할 수 없습니다.');
    }
    
  } catch (error) {
    console.error('데이터베이스 조회 중 오류 발생:', error);
  } finally {
    // pool.end() 호출 제거 - PostgreSQL pool은 애플리케이션 전체에서 공유됨
    process.exit(0);
  }
}

checkIssueDeadlines();