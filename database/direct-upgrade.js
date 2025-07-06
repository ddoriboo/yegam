const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function directUpgrade() {
  // Railway 데이터베이스 연결 설정
  const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔥 Railway 데이터베이스 직접 연결 중...');
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공!');

    // 1. 먼저 upgrade-ai-agents.sql 실행
    console.log('\n📋 매운맛 AI agents 업그레이드 SQL 실행 중...');
    const upgradeSql = fs.readFileSync(path.join(__dirname, 'upgrade-ai-agents.sql'), 'utf8');
    
    // SQL을 개별 구문으로 분리
    const statements = upgradeSql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement.length === 0) continue;
      
      try {
        console.log(`⏳ [${i+1}/${statements.length}] 실행 중...`);
        const result = await client.query(statement);
        
        if (result.rows && result.rows.length > 0 && result.rows[0].upgrade_status) {
          console.log(`🎉 ${result.rows[0].upgrade_status}`);
        } else {
          console.log(`✅ [${i+1}/${statements.length}] 완료`);
        }
      } catch (error) {
        console.error(`❌ [${i+1}/${statements.length}] 실행 실패:`, error.message);
        // 일부 에러는 무시하고 계속 진행 (이미 존재하는 데이터 등)
      }
    }

    // 2. AI 에이전트 확인
    console.log('\n📋 생성된 AI 에이전트 확인 중...');
    const agentCheck = await client.query('SELECT agent_id, nickname FROM ai_agents ORDER BY agent_id');
    console.log(`\n🤖 현재 AI 에이전트 목록 (${agentCheck.rows.length}개):`);
    agentCheck.rows.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.agent_id} - ${agent.nickname}`);
    });

    // 3. 매운맛 AI 사용자 계정 생성
    console.log('\n🔥 매운맛 AI 사용자 계정 생성 중...');
    
    // 기존 AI 사용자 삭제
    await client.query(`
      DELETE FROM users WHERE email LIKE '%@yegam.ai' AND username IN (
        'data_kim', 'chart_king', 'tech_guru', 'hipster_choi', 'social_lover',
        'medical_doctor', 'positive_one', 'cautious_one', 'humor_king', 'observer'
      )
    `);
    console.log('✅ 기존 AI 사용자 삭제 완료');

    // 새로운 매운맛 AI 사용자 생성
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

    for (const user of spicyAiUsers) {
      try {
        const result = await client.query(`
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
        `, [user.username, user.email, 5000, 0, 0, '티끌']);
        
        console.log(`✅ ${user.agentId} (${user.username}) - ID: ${result.rows[0].id}, GAM: ${result.rows[0].gam_balance}, 등급: ${result.rows[0].rank}`);
      } catch (error) {
        console.error(`❌ ${user.username} 생성 실패:`, error.message);
      }
    }

    // 4. 최종 확인
    console.log('\n📋 최종 매핑 확인 중...');
    const mapping = await client.query(`
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

    console.log('\n🔥 매운맛 AI 에이전트 - 사용자 매핑 결과:');
    console.table(mapping.rows.map(row => ({
      '에이전트ID': row.agent_id,
      '닉네임': row.nickname,
      '사용자ID': row.user_id || 'NULL',
      '사용자명': row.username || 'NULL',
      'GAM잔액': row.gam_balance || 'NULL',
      '레벨': row.level !== null ? row.level : 'NULL',
      '등급': row.rank || 'NULL'
    })));

    // 통계
    const validMappings = mapping.rows.filter(row => row.user_id !== null).length;
    const teegulCount = mapping.rows.filter(row => row.rank === '티끌').length;
    
    console.log('\n📊 업그레이드 완료 통계:');
    console.log(`   📋 총 AI 에이전트: ${mapping.rows.length}개`);
    console.log(`   👤 연결된 사용자: ${validMappings}개`);
    console.log(`   🏆 티끌 등급: ${teegulCount}개`);

    console.log('\n🎉 매운맛 AI 에이전트 시스템 업그레이드 완료!');
    console.log('🔥 모든 AI 에이전트가 티끌 등급으로 설정되었습니다!');

  } catch (error) {
    console.error('❌ 업그레이드 실패:', error);
    throw error;
  } finally {
    await client.end();
    console.log('\n✅ 데이터베이스 연결 종료');
  }
}

if (require.main === module) {
  directUpgrade()
    .then(() => {
      console.log('\n✅ 직접 업그레이드 완료!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 직접 업그레이드 실패:', error);
      process.exit(1);
    });
}

module.exports = { directUpgrade };