const { Client } = require('pg');

async function fix500Error() {
  const client = new Client({
    connectionString: 'postgresql://postgres:ZoSsHYJiQJESArWRESxSWdukDlFiisEb@hopper.proxy.rlwy.net:26469/railway',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 500 에러 원인 분석 및 수정 시작...');
    await client.connect();

    // 1. discussion_posts 테이블 구조 자세히 확인
    console.log('📋 discussion_posts 테이블 구조 확인 중...');
    
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'discussion_posts'
      ORDER BY ordinal_position;
    `);

    console.log('📋 discussion_posts 테이블 구조:');
    tableInfo.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'NULL 허용' : 'NOT NULL'}) ${col.column_default ? `기본값: ${col.column_default}` : ''}`);
    });

    // 2. AI 에이전트 사용자 ID 재확인
    console.log('\n📋 AI 에이전트 사용자 ID 재확인...');
    const agentUsers = await client.query(`
      SELECT id, username, email 
      FROM users 
      WHERE email LIKE '%@yegam.ai' 
      ORDER BY id
    `);

    console.log('🤖 AI 에이전트 사용자:');
    agentUsers.rows.forEach(user => {
      console.log(`   - ID: ${user.id}, Username: ${user.username}, Email: ${user.email}`);
    });

    // 3. 테스트 데이터 삽입 시도 (실제 에러 원인 파악)
    console.log('\n🧪 테스트 데이터 삽입 시도...');
    
    if (agentUsers.rows.length > 0) {
      const testUser = agentUsers.rows[0];
      
      try {
        const testResult = await client.query(`
          INSERT INTO discussion_posts (title, content, category_id, author_id, created_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          RETURNING id, title, author_id, category_id
        `, [
          '[500 에러 테스트] AI 에이전트 게시 테스트',
          '이 게시물은 500 에러의 원인을 파악하기 위한 테스트입니다.\n\n실제 AI 에이전트가 작성한 것처럼 테스트합니다.',
          1, // 일반 카테고리
          testUser.id
        ]);
        
        console.log(`✅ 테스트 데이터 삽입 성공: ID ${testResult.rows[0].id}`);
        console.log(`   - title: ${testResult.rows[0].title}`);
        console.log(`   - author_id: ${testResult.rows[0].author_id}`);
        console.log(`   - category_id: ${testResult.rows[0].category_id}`);
        
      } catch (insertError) {
        console.error('❌ 테스트 데이터 삽입 실패:', insertError);
        console.error('❌ 에러 상세:', insertError.message);
        console.error('❌ 에러 코드:', insertError.code);
        console.error('❌ 에러 세부사항:', insertError.detail);
      }
    }

    // 4. discussion_categories 테이블 확인
    console.log('\n📋 discussion_categories 테이블 확인...');
    
    try {
      const categories = await client.query(`
        SELECT id, name 
        FROM discussion_categories 
        ORDER BY id
      `);
      
      console.log('📂 사용 가능한 카테고리:');
      categories.rows.forEach(cat => {
        console.log(`   - ID: ${cat.id}, Name: ${cat.name}`);
      });
      
    } catch (catError) {
      console.error('❌ 카테고리 테이블 확인 실패:', catError.message);
      
      // 카테고리 테이블이 없다면 생성
      console.log('📝 discussion_categories 테이블 생성 중...');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS discussion_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          
          INSERT INTO discussion_categories (id, name, description) VALUES
          (1, '일반', '일반적인 토론 주제'),
          (2, '정치', '정치 관련 토론'),
          (3, '스포츠', '스포츠 관련 토론'),
          (4, '경제', '경제 관련 토론'),
          (5, '코인', '암호화폐 관련 토론'),
          (6, '테크', 'IT/기술 관련 토론'),
          (7, '엔터', '엔터테인먼트 관련 토론'),
          (8, '국제', '국제 이슈 관련 토론')
          ON CONFLICT (id) DO NOTHING;
        `);
        console.log('✅ discussion_categories 테이블 생성 완료');
      } catch (createCatError) {
        console.error('❌ 카테고리 테이블 생성 실패:', createCatError.message);
      }
    }

    // 5. FK 제약조건 확인
    console.log('\n📋 Foreign Key 제약조건 확인...');
    
    const constraints = await client.query(`
      SELECT 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'discussion_posts';
    `);

    console.log('🔗 discussion_posts FK 제약조건:');
    constraints.rows.forEach(c => {
      console.log(`   - ${c.column_name} → ${c.foreign_table_name}.${c.foreign_column_name}`);
    });

    // 6. Railway 환경변수 확인을 위한 정보 출력
    console.log('\n⚠️ 만약 여전히 500 에러가 발생한다면:');
    console.log('   1. Railway 대시보드에서 환경변수 확인 필요:');
    console.log('      - OPENAI_API_KEY=sk-your-openai-api-key');
    console.log('      - ADMIN_SECRET_KEY=yegam_admin_2024_secure_key_for_ai_agents');
    console.log('   2. Railway 서버 로그 확인');
    console.log('   3. OpenAI API 키 유효성 확인');

    console.log('\n🎉 500 에러 분석 완료!');

  } catch (error) {
    console.error('❌ 분석 실패:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  fix500Error()
    .then(() => {
      console.log('\n✅ 500 에러 분석 스크립트 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { fix500Error };