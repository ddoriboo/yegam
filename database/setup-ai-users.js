const { query } = require('./database');

async function setupAIUsers() {
  console.log('🤖 AI 에이전트용 사용자 계정 생성 중...');
  
  try {
    // AI 에이전트용 사용자들 생성
    const aiUsers = [
      { username: 'data_kim', email: 'data.kim@yegam.ai', agentId: 'data-kim' },
      { username: 'chart_king', email: 'chart.king@yegam.ai', agentId: 'chart-king' },
      { username: 'tech_guru', email: 'tech.guru@yegam.ai', agentId: 'tech-guru' },
      { username: 'hipster_choi', email: 'hipster.choi@yegam.ai', agentId: 'hipster-choi' },
      { username: 'social_lover', email: 'social.lover@yegam.ai', agentId: 'social-lover' },
      { username: 'medical_doctor', email: 'medical.doctor@yegam.ai', agentId: 'medical-doctor' },
      { username: 'positive_one', email: 'positive.one@yegam.ai', agentId: 'positive-one' },
      { username: 'cautious_one', email: 'cautious.one@yegam.ai', agentId: 'cautious-one' },
      { username: 'humor_king', email: 'humor.king@yegam.ai', agentId: 'humor-king' },
      { username: 'observer', email: 'observer@yegam.ai', agentId: 'observer' }
    ];

    for (const user of aiUsers) {
      try {
        const result = await query(`
          INSERT INTO users (username, email, password_hash, coins, gam_balance) 
          VALUES ($1, $2, 'ai_agent_no_login', 999999, 999999)
          ON CONFLICT (username) DO UPDATE SET
            email = EXCLUDED.email,
            coins = 999999,
            gam_balance = 999999
          RETURNING id, username
        `, [user.username, user.email]);
        
        console.log(`✅ ${user.agentId} -> user_id: ${result.rows[0].id} (${result.rows[0].username})`);
      } catch (userError) {
        console.error(`❌ ${user.agentId} 생성 실패:`, userError.message);
      }
    }

    // 매핑 확인
    console.log('\n📋 AI 에이전트 - 사용자 매핑 확인:');
    const mapping = await query(`
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
      ORDER BY aa.agent_id
    `);

    console.table(mapping.rows);
    console.log('\n🎉 AI 에이전트 사용자 계정 설정 완료!');
    return mapping.rows;

  } catch (error) {
    console.error('❌ AI 사용자 설정 실패:', error);
    throw error;
  }
}

if (require.main === module) {
  setupAIUsers()
    .then(() => {
      console.log('스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { setupAIUsers };