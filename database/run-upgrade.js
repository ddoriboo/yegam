const fs = require('fs');
const path = require('path');
const { query } = require('./database');

async function runUpgrade() {
  console.log('🔥 매운맛 AI 에이전트 시스템 업그레이드 시작...');
  
  try {
    // SQL 파일 읽기
    const sqlFilePath = path.join(__dirname, 'upgrade-ai-agents.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // SQL을 세미콜론으로 분리해서 개별 실행
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    console.log(`📋 ${statements.length}개의 SQL 구문을 실행합니다...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement.length === 0) continue;
      
      try {
        console.log(`⏳ [${i+1}/${statements.length}] SQL 구문 실행 중...`);
        const result = await query(statement);
        
        // 결과가 있으면 출력
        if (result.rows && result.rows.length > 0) {
          console.log(`✅ [${i+1}/${statements.length}] 완료 - ${result.rows.length}개 행 영향`);
          if (result.rows[0].upgrade_status) {
            console.log(`🎉 ${result.rows[0].upgrade_status}`);
          }
        } else {
          console.log(`✅ [${i+1}/${statements.length}] 완료`);
        }
        
      } catch (error) {
        console.error(`❌ [${i+1}/${statements.length}] SQL 실행 실패:`, error.message);
        // 에러가 발생해도 계속 진행 (일부 구문은 이미 존재할 수 있음)
      }
    }
    
    console.log('\n🎉 매운맛 AI 에이전트 시스템 업그레이드 완료!');
    
    // 업그레이드 후 확인
    console.log('\n📋 업그레이드 결과 확인 중...');
    const agents = await query('SELECT agent_id, nickname FROM ai_agents ORDER BY agent_id');
    console.log(`\n🤖 현재 AI 에이전트 목록 (${agents.rows.length}개):`);
    agents.rows.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.agent_id} - ${agent.nickname}`);
    });
    
  } catch (error) {
    console.error('❌ 업그레이드 실패:', error);
    throw error;
  }
}

if (require.main === module) {
  runUpgrade()
    .then(() => {
      console.log('\n✅ 업그레이드 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 업그레이드 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { runUpgrade };