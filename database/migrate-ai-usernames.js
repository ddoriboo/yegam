const { query } = require('../database/postgres');

async function migrateAIUsernames() {
  console.log('🔄 AI 에이전트 사용자명 마이그레이션 시작...');
  
  try {
    // 트랜잭션 시작
    await query('BEGIN');
    
    // 마이그레이션할 사용자명 매핑
    const migrations = [
      { old: 'ai_data_kim', new: 'data_kim' },
      { old: 'ai_chart_king', new: 'chart_king' },
      { old: 'ai_tech_guru', new: 'tech_guru' },
      { old: 'ai_hipster_choi', new: 'hipster_choi' },
      { old: 'ai_social_lover', new: 'social_lover' },
      { old: 'ai_medical_doctor', new: 'medical_doctor' },
      { old: 'ai_positive_one', new: 'positive_one' },
      { old: 'ai_cautious_one', new: 'cautious_one' },
      { old: 'ai_humor_king', new: 'humor_king' },
      { old: 'ai_observer', new: 'observer' }
    ];
    
    // 기존 AI 사용자 확인
    console.log('\n📋 기존 AI 사용자 확인:');
    const existingUsers = await query(`
      SELECT id, username, email 
      FROM users 
      WHERE username LIKE 'ai_%' 
      ORDER BY username
    `);
    console.table(existingUsers.rows);
    
    // 사용자명 업데이트
    console.log('\n🔧 사용자명 업데이트 중...');
    for (const migration of migrations) {
      try {
        const result = await query(
          'UPDATE users SET username = $1 WHERE username = $2 RETURNING id, username',
          [migration.new, migration.old]
        );
        if (result.rows.length > 0) {
          console.log(`✅ ${migration.old} → ${migration.new} (ID: ${result.rows[0].id})`);
        } else {
          console.log(`⚠️ ${migration.old} 사용자를 찾을 수 없음`);
        }
      } catch (error) {
        console.error(`❌ ${migration.old} 업데이트 실패:`, error.message);
      }
    }
    
    // 업데이트 결과 확인
    console.log('\n📋 업데이트된 사용자 확인:');
    const updatedUsers = await query(`
      SELECT id, username, email, gam_balance
      FROM users 
      WHERE username IN ('data_kim', 'chart_king', 'tech_guru', 'hipster_choi', 
                        'social_lover', 'medical_doctor', 'positive_one', 
                        'cautious_one', 'humor_king', 'observer')
      ORDER BY username
    `);
    console.table(updatedUsers.rows);
    
    // 매핑 뷰 재생성
    console.log('\n🔄 AI 에이전트 매핑 뷰 재생성...');
    await query(`
      CREATE OR REPLACE VIEW ai_agent_user_mapping AS
      SELECT 
        aa.agent_id,
        aa.nickname,
        u.id as user_id,
        u.username
      FROM ai_agents aa
      JOIN users u ON (
        (aa.agent_id = 'data-kim' AND u.username = 'data_kim') OR
        (aa.agent_id = 'chart-king' AND u.username = 'chart_king') OR
        (aa.agent_id = 'tech-guru' AND u.username = 'tech_guru') OR
        (aa.agent_id = 'hipster-choi' AND u.username = 'hipster_choi') OR
        (aa.agent_id = 'social-lover' AND u.username = 'social_lover') OR
        (aa.agent_id = 'medical-doctor' AND u.username = 'medical_doctor') OR
        (aa.agent_id = 'positive-one' AND u.username = 'positive_one') OR
        (aa.agent_id = 'cautious-one' AND u.username = 'cautious_one') OR
        (aa.agent_id = 'humor-king' AND u.username = 'humor_king') OR
        (aa.agent_id = 'observer' AND u.username = 'observer')
      )
    `);
    
    // 최종 매핑 확인
    console.log('\n📋 최종 AI 에이전트 매핑:');
    const mapping = await query('SELECT * FROM ai_agent_user_mapping ORDER BY agent_id');
    console.table(mapping.rows);
    
    // 커밋
    await query('COMMIT');
    console.log('\n✅ 마이그레이션 성공적으로 완료!');
    
    return true;
    
  } catch (error) {
    // 롤백
    await query('ROLLBACK');
    console.error('\n❌ 마이그레이션 실패:', error);
    throw error;
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  migrateAIUsernames()
    .then(() => {
      console.log('\n🎉 마이그레이션 스크립트 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 마이그레이션 스크립트 실패:', error);
      process.exit(1);
    });
}

module.exports = { migrateAIUsernames };