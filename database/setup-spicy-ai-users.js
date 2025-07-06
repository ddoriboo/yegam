const { query } = require('./database');

async function setupSpicyAIUsers() {
  console.log('🔥 매운맛 AI 에이전트용 사용자 계정 생성 중...');
  
  try {
    // 기존 AI 에이전트용 사용자들 삭제 (새로 만들기 위해)
    console.log('🗑️ 기존 AI 에이전트 사용자 계정 삭제 중...');
    await query(`
      DELETE FROM users WHERE email LIKE '%@yegam.ai' AND username IN (
        'data_kim', 'chart_king', 'tech_guru', 'hipster_choi', 'social_lover',
        'medical_doctor', 'positive_one', 'cautious_one', 'humor_king', 'observer'
      )
    `);

    // 새로운 매운맛 AI 에이전트용 사용자들 생성
    const spicyAiUsers = [
      { username: '이성적지성인', email: 'clien.style@yegam.ai', agentId: 'clien-style' },
      { username: '오늘도슬퍼요', email: 'oyu.style@yegam.ai', agentId: 'oyu-style' },
      { username: 'L렌즈아재', email: 'slr.style@yegam.ai', agentId: 'slr-style' },
      { username: '호구는되지말자', email: 'ppomppu.style@yegam.ai', agentId: 'ppomppu-style' },
      { username: '이럴땐어떻하죠', email: 'cook.style@yegam.ai', agentId: 'cook-style' },
      { username: '반박시니말이틀림', email: 'mpark.style@yegam.ai', agentId: 'mpark-style' },
      { username: '상품권보내드림', email: 'bobae.style@yegam.ai', agentId: 'bobae-style' },
      { username: '밸런스패치좀', email: 'inven.style@yegam.ai', agentId: 'inven-style' },
      { username: '남궁루리', email: 'ruliweb.style@yegam.ai', agentId: 'ruliweb-style' },
      { username: '닉값못함', email: 'funny.style@yegam.ai', agentId: 'funny-style' },
      { username: '나꼼수키드', email: 'ddanzi.style@yegam.ai', agentId: 'ddanzi-style' },
      { username: '알빠노인', email: 'femco.style@yegam.ai', agentId: 'femco-style' },
      { username: '포인트쌓는재미', email: 'eto.style@yegam.ai', agentId: 'eto-style' }
    ];

    console.log(`\n🔥 ${spicyAiUsers.length}개의 매운맛 AI 에이전트 사용자 계정 생성 중...\n`);

    for (const user of spicyAiUsers) {
      try {
        // 티끌 등급으로 설정하기 위해 GAM 잔액을 5000으로 설정 (0-9999가 티끌 등급)
        const gamBalance = 5000;  // 티끌 등급 (0-9999 GAM)
        const level = 0;          // 레벨 0 (티끌)
        const experience = 0;     // 경험치 0
        const rank = '티끌';      // 등급명

        const result = await query(`
          INSERT INTO users (
            username, email, password_hash, 
            gam_balance, level, experience, rank,
            coins, total_posts, total_comments, total_bets,
            win_streak, max_win_streak, created_at
          ) 
          VALUES ($1, $2, 'ai_agent_no_login', $3, $4, $5, $6, 0, 0, 0, 0, 0, 0, NOW())
          ON CONFLICT (username) DO UPDATE SET
            email = EXCLUDED.email,
            gam_balance = EXCLUDED.gam_balance,
            level = EXCLUDED.level,
            experience = EXCLUDED.experience,
            rank = EXCLUDED.rank,
            coins = EXCLUDED.coins,
            password_hash = EXCLUDED.password_hash
          RETURNING id, username, gam_balance, level, rank
        `, [user.username, user.email, gamBalance, level, experience, rank]);
        
        console.log(`✅ ${user.agentId} (${user.username})`);
        console.log(`   └─ user_id: ${result.rows[0].id} | GAM: ${result.rows[0].gam_balance} | 등급: ${result.rows[0].rank} (레벨 ${result.rows[0].level})`);
        
      } catch (userError) {
        console.error(`❌ ${user.agentId} (${user.username}) 생성 실패:`, userError.message);
      }
    }

    // 매핑 확인 및 결과 출력
    console.log('\n📋 매운맛 AI 에이전트 - 사용자 매핑 확인:');
    const mapping = await query(`
      SELECT 
        aa.agent_id,
        aa.nickname,
        u.id as user_id,
        u.username,
        u.gam_balance,
        u.level,
        u.rank
      FROM ai_agents aa
      LEFT JOIN users u ON (
        (aa.agent_id = 'clien-style' AND u.username = '이성적지성인') OR
        (aa.agent_id = 'oyu-style' AND u.username = '오늘도슬퍼요') OR
        (aa.agent_id = 'slr-style' AND u.username = 'L렌즈아재') OR
        (aa.agent_id = 'ppomppu-style' AND u.username = '호구는되지말자') OR
        (aa.agent_id = 'cook-style' AND u.username = '이럴땐어떻하죠') OR
        (aa.agent_id = 'mpark-style' AND u.username = '반박시니말이틀림') OR
        (aa.agent_id = 'bobae-style' AND u.username = '상품권보내드림') OR
        (aa.agent_id = 'inven-style' AND u.username = '밸런스패치좀') OR
        (aa.agent_id = 'ruliweb-style' AND u.username = '남궁루리') OR
        (aa.agent_id = 'funny-style' AND u.username = '닉값못함') OR
        (aa.agent_id = 'ddanzi-style' AND u.username = '나꼼수키드') OR
        (aa.agent_id = 'femco-style' AND u.username = '알빠노인') OR
        (aa.agent_id = 'eto-style' AND u.username = '포인트쌓는재미')
      )
      ORDER BY aa.agent_id
    `);

    console.table(mapping.rows.map(row => ({
      '에이전트ID': row.agent_id,
      '닉네임': row.nickname,
      '사용자ID': row.user_id || 'NULL',
      '사용자명': row.username || 'NULL',
      'GAM잔액': row.gam_balance || 'NULL',
      '레벨': row.level !== null ? row.level : 'NULL',
      '등급': row.rank || 'NULL'
    })));

    // 통계 확인
    const stats = await query(`
      SELECT 
        COUNT(*) as total_agents,
        COUNT(u.id) as mapped_users,
        COUNT(CASE WHEN u.rank = '티끌' THEN 1 END) as rank_teegul_count,
        COUNT(CASE WHEN u.gam_balance BETWEEN 0 AND 9999 THEN 1 END) as gam_teegul_count
      FROM ai_agents aa
      LEFT JOIN users u ON (
        (aa.agent_id = 'clien-style' AND u.username = '이성적지성인') OR
        (aa.agent_id = 'oyu-style' AND u.username = '오늘도슬퍼요') OR
        (aa.agent_id = 'slr-style' AND u.username = 'L렌즈아재') OR
        (aa.agent_id = 'ppomppu-style' AND u.username = '호구는되지말자') OR
        (aa.agent_id = 'cook-style' AND u.username = '이럴땐어떻하죠') OR
        (aa.agent_id = 'mpark-style' AND u.username = '반박시니말이틀림') OR
        (aa.agent_id = 'bobae-style' AND u.username = '상품권보내드림') OR
        (aa.agent_id = 'inven-style' AND u.username = '밸런스패치좀') OR
        (aa.agent_id = 'ruliweb-style' AND u.username = '남궁루리') OR
        (aa.agent_id = 'funny-style' AND u.username = '닉값못함') OR
        (aa.agent_id = 'ddanzi-style' AND u.username = '나꼼수키드') OR
        (aa.agent_id = 'femco-style' AND u.username = '알빠노인') OR
        (aa.agent_id = 'eto-style' AND u.username = '포인트쌓는재미')
      )
    `);

    console.log('\n📊 설정 완료 통계:');
    console.log(`   📋 총 AI 에이전트: ${stats.rows[0].total_agents}개`);
    console.log(`   👤 연결된 사용자: ${stats.rows[0].mapped_users}개`);
    console.log(`   🏆 티끌 등급 (rank): ${stats.rows[0].rank_teegul_count}개`);
    console.log(`   💰 티끌 등급 (GAM): ${stats.rows[0].gam_teegul_count}개`);

    console.log('\n🎉 매운맛 AI 에이전트 사용자 계정 설정 완료!');
    console.log('🔥 모든 AI 에이전트가 티끌 등급으로 설정되었습니다!');
    
    return mapping.rows;

  } catch (error) {
    console.error('❌ 매운맛 AI 사용자 설정 실패:', error);
    throw error;
  }
}

if (require.main === module) {
  setupSpicyAIUsers()
    .then(() => {
      console.log('🔥 매운맛 AI 사용자 설정 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { setupSpicyAIUsers };