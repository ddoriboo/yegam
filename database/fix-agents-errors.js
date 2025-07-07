const { Client } = require('pg');

async function fixAgentsErrors() {
  const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 AI agents 에러 수정 시작...');
    await client.connect();

    // 1. discussion_posts 테이블 확인 및 생성
    console.log('📋 discussion_posts 테이블 확인 중...');
    
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'discussion_posts'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('📝 discussion_posts 테이블 생성 중...');
      await client.query(`
        CREATE TABLE discussion_posts (
          id SERIAL PRIMARY KEY,
          title VARCHAR(500) NOT NULL,
          content TEXT NOT NULL,
          category_id INTEGER NOT NULL DEFAULT 1,
          author_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          views INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          is_deleted BOOLEAN DEFAULT false
        );
        
        CREATE INDEX idx_discussion_posts_category ON discussion_posts(category_id);
        CREATE INDEX idx_discussion_posts_author ON discussion_posts(author_id);
        CREATE INDEX idx_discussion_posts_created ON discussion_posts(created_at);
      `);
      console.log('✅ discussion_posts 테이블 생성 완료');
    } else {
      console.log('✅ discussion_posts 테이블 이미 존재');
    }

    // 2. AI 에이전트 사용자들의 ID 확인
    console.log('\n📋 AI 에이전트 사용자 ID 확인 중...');
    const agentUsers = await client.query(`
      SELECT id, username 
      FROM users 
      WHERE email LIKE '%@yegam.ai' 
      ORDER BY id
    `);

    console.log('🤖 AI 에이전트 사용자 목록:');
    agentUsers.rows.forEach(user => {
      console.log(`   - ID: ${user.id}, Username: ${user.username}`);
    });

    // 3. AI 에이전트 활성화 상태 확인 및 수정
    console.log('\n📋 AI 에이전트 활성화 상태 확인 중...');
    const agents = await client.query(`
      SELECT agent_id, nickname, is_active 
      FROM ai_agents 
      ORDER BY agent_id
    `);

    console.log('🤖 현재 AI 에이전트 상태:');
    agents.rows.forEach(agent => {
      const status = agent.is_active ? '✅ 활성' : '❌ 비활성';
      console.log(`   - ${agent.agent_id} (${agent.nickname}): ${status}`);
    });

    // 모든 에이전트 활성화
    await client.query(`
      UPDATE ai_agents 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
    `);
    console.log('✅ 모든 AI 에이전트가 활성화되었습니다');

    // 4. 시스템 설정 확인
    console.log('\n📋 AI 시스템 설정 확인 중...');
    const config = await client.query(`
      SELECT config_key, config_value 
      FROM ai_system_config 
      ORDER BY config_key
    `);

    console.log('⚙️ 현재 시스템 설정:');
    config.rows.forEach(cfg => {
      console.log(`   - ${cfg.config_key}: ${cfg.config_value}`);
    });

    // 긴급 정지 해제
    await client.query(`
      UPDATE ai_system_config 
      SET config_value = '"false"', updated_at = CURRENT_TIMESTAMP
      WHERE config_key = 'emergency_stop'
    `);
    console.log('✅ 긴급 정지 상태가 해제되었습니다');

    // 5. 테스트용 discussion post 생성
    console.log('\n📝 테스트용 분석방 게시물 생성 중...');
    
    const testUser = agentUsers.rows[0]; // 첫 번째 AI 사용자 사용
    if (testUser) {
      const testPost = await client.query(`
        INSERT INTO discussion_posts (title, content, category_id, author_id, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING id, title
      `, [
        '[테스트] AI 에이전트 시스템 정상 작동 확인',
        '이 게시물은 AI 에이전트 시스템이 정상적으로 작동하는지 확인하기 위한 테스트 게시물입니다.\n\n매운맛 AI 에이전트들이 분석방에 글을 작성할 수 있는지 테스트합니다.',
        1, // 일반 카테고리
        testUser.id
      ]);
      
      console.log(`✅ 테스트 게시물 생성됨: ID ${testPost.rows[0].id} - ${testPost.rows[0].title}`);
    }

    console.log('\n🎉 AI agents 에러 수정 완료!');
    console.log('\n📋 수정 사항 요약:');
    console.log('   ✅ discussion_posts 테이블 확인/생성');
    console.log('   ✅ 모든 AI 에이전트 활성화');
    console.log('   ✅ 긴급 정지 상태 해제');
    console.log('   ✅ 테스트 게시물 생성');

  } catch (error) {
    console.error('❌ 에러 수정 실패:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  fixAgentsErrors()
    .then(() => {
      console.log('\n✅ AI agents 에러 수정 스크립트 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { fixAgentsErrors };