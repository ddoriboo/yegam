const express = require('express');
const { query, get } = require('../database/database');
const { AgentManager } = require('../services/agentManager');
const { AgentScheduler } = require('../services/agentScheduler');
const router = express.Router();

// AI 에이전트 매니저 인스턴스 (서버 시작시 초기화됨)
let agentManager;
let agentScheduler;

// 초기화 함수
const initializeAgents = async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY가 설정되지 않음 - AI 에이전트 비활성화');
    return null;
  }

  try {
    agentManager = new AgentManager(process.env.OPENAI_API_KEY);
    agentScheduler = new AgentScheduler(agentManager);
    
    // 🚀 스케줄러 시작 - 자동 콘텐츠 생성 활성화
    agentScheduler.start();
    
    console.log('🤖 AI 에이전트 시스템 초기화 완료');
    console.log('⏰ AI 에이전트 스케줄러 시작됨 - 자동 콘텐츠 생성 활성화');
    return agentManager;
  } catch (error) {
    console.error('❌ AI 에이전트 초기화 실패:', error);
    return null;
  }
};

// 관리자 인증 미들웨어 (기존 admin 미들웨어 재사용)
const requireAdmin = (req, res, next) => {
  // 기존 관리자 인증 로직 또는 간단한 토큰 검증
  const adminToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (adminToken !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// 모든 AI 에이전트 상태 조회
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const agents = await query(`
      SELECT agent_id, nickname, display_name, type, is_active, 
             created_at, updated_at
      FROM ai_agents 
      ORDER BY created_at ASC
    `);

    // 최근 24시간 활동 통계 조회
    const stats = await Promise.all(agents.rows.map(async (agent) => {
      const activity = await query(`
        SELECT 
          activity_type,
          COUNT(*) as count
        FROM ai_agent_activities 
        WHERE agent_id = $1 
        AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY activity_type
      `, [agent.agent_id]);

      const stats24h = {
        posts: 0,
        replies: 0,
        reactions: 0
      };

      activity.rows.forEach(stat => {
        if (stat.activity_type === 'post') stats24h.posts = parseInt(stat.count);
        if (stat.activity_type === 'reply') stats24h.replies = parseInt(stat.count);
        if (stat.activity_type === 'reaction') stats24h.reactions = parseInt(stat.count);
      });

      const lastActivity = await get(`
        SELECT created_at 
        FROM ai_agent_activities 
        WHERE agent_id = $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `, [agent.agent_id]);

      return {
        agentId: agent.agent_id,
        nickname: agent.nickname,
        displayName: agent.display_name,
        type: agent.type,
        isActive: agent.is_active,
        lastActivity: lastActivity?.created_at,
        stats24h
      };
    }));

    res.json(stats);
  } catch (error) {
    console.error('AI 에이전트 상태 조회 오류:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// 특정 AI 에이전트 활성/비활성화
router.put('/:agentId/status', requireAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { active } = req.body;

    const result = await query(`
      UPDATE ai_agents 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = $2
      RETURNING agent_id, nickname, is_active
    `, [active, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // 시스템 로그 기록
    await query(`
      INSERT INTO ai_system_logs (log_level, message, agent_id, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
      'info',
      `Agent ${active ? 'activated' : 'deactivated'}`,
      agentId,
      JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
    ]);

    res.json({
      agentId,
      active,
      message: `Agent ${active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('AI 에이전트 상태 변경 오류:', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

// 모든 AI 에이전트 활성화
router.post('/activate-all', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      UPDATE ai_agents 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      RETURNING agent_id
    `);

    // 시스템 로그 기록 (선택적)
    try {
      await query(`
        INSERT INTO ai_system_logs (log_level, message, metadata)
        VALUES ($1, $2, $3)
      `, [
        'info',
        'All agents activated',
        JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
      ]);
    } catch (logError) {
      console.log('로그 기록 실패 (무시):', logError.message);
    }

    res.json({
      message: 'All agents activated',
      count: result.rows.length
    });
  } catch (error) {
    console.error('모든 AI 에이전트 활성화 오류:', error);
    res.status(500).json({ error: 'Failed to activate all agents' });
  }
});

// 모든 AI 에이전트 비활성화
router.post('/deactivate-all', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      UPDATE ai_agents 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      RETURNING agent_id
    `);

    // 시스템 로그 기록 (선택적)
    try {
      await query(`
        INSERT INTO ai_system_logs (log_level, message, metadata)
        VALUES ($1, $2, $3)
      `, [
        'warn',
        'All agents deactivated',
        JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
      ]);
    } catch (logError) {
      console.log('로그 기록 실패 (무시):', logError.message);
    }

    res.json({
      message: 'All agents deactivated',
      count: result.rows.length
    });
  } catch (error) {
    console.error('모든 AI 에이전트 비활성화 오류:', error);
    res.status(500).json({ error: 'Failed to deactivate all agents' });
  }
});

// 긴급 정지
router.post('/emergency-stop', requireAdmin, async (req, res) => {
  try {
    // 모든 에이전트 비활성화
    await query(`
      UPDATE ai_agents 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
    `);

    // 긴급 정지 상태 설정
    await query(`
      UPDATE ai_system_config 
      SET config_value = 'true', updated_at = CURRENT_TIMESTAMP
      WHERE config_key = 'emergency_stop'
    `);

    // 스케줄러 중지 (있다면)
    if (agentScheduler) {
      agentScheduler.stop();
    }

    await query(`
      INSERT INTO ai_system_logs (log_level, message, metadata)
      VALUES ($1, $2, $3)
    `, [
      'error',
      'Emergency stop activated',
      JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
    ]);

    console.log('🛑 AI 에이전트 긴급 정지 실행됨');

    res.json({
      message: 'Emergency stop activated',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('긴급 정지 오류:', error);
    res.status(500).json({ error: 'Failed to execute emergency stop' });
  }
});

// 시스템 상태 조회
router.get('/system/status', requireAdmin, async (req, res) => {
  try {
    const config = await query(`
      SELECT config_key, config_value 
      FROM ai_system_config
    `);

    const configMap = {};
    config.rows.forEach(row => {
      configMap[row.config_key] = row.config_value;
    });

    // OpenAI API 키 검증 (간단한 체크)
    const apiStatus = process.env.OPENAI_API_KEY ? true : false;

    res.json({
      apiStatus,
      scheduler: {
        isRunning: agentScheduler ? agentScheduler.isRunning : false,
        uptime: process.uptime()
      },
      contentFilter: configMap.content_filter_enabled === 'true',
      emergencyStop: configMap.emergency_stop === 'true',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('시스템 상태 조회 오류:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// 활동 로그 조회 (관리자용)
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, level, agent_id } = req.query;
    
    let whereClause = [];
    let params = [];
    let paramIndex = 1;

    if (level) {
      whereClause.push(`log_level = $${paramIndex++}`);
      params.push(level);
    }

    if (agent_id) {
      whereClause.push(`agent_id = $${paramIndex++}`);
      params.push(agent_id);
    }

    const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const logs = await query(`
      SELECT * FROM ai_system_logs 
      ${whereString}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex}
    `, [...params, parseInt(limit)]);

    res.json(logs.rows);
  } catch (error) {
    console.error('로그 조회 오류:', error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// 생성된 콘텐츠 조회 (관리자용)
router.get('/content', requireAdmin, async (req, res) => {
  try {
    const { limit = 20, agent_id } = req.query;
    
    let whereClause = [];
    let params = [];
    let paramIndex = 1;

    if (agent_id) {
      whereClause.push(`aga.agent_id = $${paramIndex++}`);
      params.push(agent_id);
    }

    const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const content = await query(`
      SELECT 
        aga.id,
        aga.agent_id,
        ag.nickname,
        aga.activity_type,
        aga.content,
        aga.metadata,
        aga.is_filtered,
        aga.created_at
      FROM ai_agent_activities aga
      JOIN ai_agents ag ON aga.agent_id = ag.agent_id
      ${whereString}
      ORDER BY aga.created_at DESC 
      LIMIT $${paramIndex}
    `, [...params, parseInt(limit)]);

    res.json(content.rows);
  } catch (error) {
    console.error('생성된 콘텐츠 조회 오류:', error);
    res.status(500).json({ error: 'Failed to get generated content' });
  }
});

// 수동 콘텐츠 생성 (테스트용)
router.post('/:agentId/generate', requireAdmin, async (req, res) => {
  try {
    if (!agentManager) {
      return res.status(503).json({ error: 'Agent manager not initialized' });
    }

    const { agentId } = req.params;
    const { prompt, type = 'post' } = req.body;

    // 에이전트가 활성화되어 있는지 확인
    const agent = await get(`
      SELECT * FROM ai_agents WHERE agent_id = $1 AND is_active = true
    `, [agentId]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or inactive' });
    }

    // AgentManager를 통한 실제 AI 콘텐츠 생성
    const context = {
      prompt: prompt || '오늘의 주제에 대해 의견을 나눠주세요',
      type: type
    };
    
    const generatedContent = await agentManager.generatePost(agentId, context);
    
    if (!generatedContent) {
      console.error(`❌ ${agentId} 콘텐츠 생성 실패: generatePost 결과가 null`);
      return res.status(500).json({ error: 'Content generation returned null' });
    }
    
    const result = {
      agentId,
      nickname: agent.nickname,
      content: generatedContent.content,
      type,
      timestamp: new Date(),
      isFiltered: generatedContent.isFiltered || false
    };

    // 활동 로그 기록
    await query(`
      INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
      agentId,
      type,
      result.content,
      JSON.stringify({ manual: true, prompt, isFiltered: result.isFiltered })
    ]);

    res.json(result);
  } catch (error) {
    console.error('콘텐츠 생성 오류:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// AI 콘텐츠를 분석방에 바로 게시
router.post('/:agentId/post-to-discussions', requireAdmin, async (req, res) => {
  try {
    if (!agentManager) {
      return res.status(503).json({ error: 'Agent manager not initialized' });
    }

    const { agentId } = req.params;
    const { prompt, categoryId, title } = req.body;

    // 에이전트 확인
    const agent = await get(`
      SELECT * FROM ai_agents WHERE agent_id = $1 AND is_active = true
    `, [agentId]);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or inactive' });
    }

    // AI 콘텐츠 생성
    const context = {
      prompt: prompt || '오늘의 주제에 대해 전문가적 분석을 해주세요',
      type: 'post'
    };
    
    const generatedContent = await agentManager.generatePost(agentId, context);
    
    if (!generatedContent) {
      console.error(`❌ ${agentId} 분석방 게시용 콘텐츠 생성 실패: generatePost 결과가 null`);
      return res.status(500).json({ error: 'Content generation returned null' });
    }
    
    if (generatedContent.isFiltered) {
      console.warn(`⚠️ ${agentId} 분석방 게시용 콘텐츠가 필터링됨`);
      return res.status(400).json({ error: 'Content was filtered due to safety concerns' });
    }

    // 에이전트별 기본 카테고리 매핑
    const getDefaultCategory = (agentId) => {
      const categoryMap = {
        'data-kim': 4,      // 경제
        'chart-king': 5,    // 코인  
        'tech-guru': 6,     // 테크
        'medical-doctor': 1, // 일반
        'hipster-choi': 7,  // 엔터
        'social-lover': 1,  // 일반
        'positive-one': 1,  // 일반
        'cautious-one': 1,  // 일반
        'humor-king': 7,    // 엔터
        'observer': 1       // 일반
      };
      return categoryMap[agentId] || 1;
    };

    // 콘텐츠에서 제목 추출하는 함수
    const extractTitle = (content) => {
      // 첫 줄이나 첫 문장에서 제목 추출
      const lines = content.split('\n').filter(line => line.trim());
      let titleCandidate = lines[0] || '';
      
      // "제목:", "Title:" 등의 패턴 제거
      titleCandidate = titleCandidate.replace(/^(제목|title)\s*[:：]\s*/i, '').trim();
      
      // 너무 길면 줄이기 (최대 100자)
      if (titleCandidate.length > 100) {
        // 마침표나 느낌표에서 자르기
        const punctIndex = titleCandidate.search(/[.!?。]/);
        if (punctIndex > 20 && punctIndex < 100) {
          titleCandidate = titleCandidate.slice(0, punctIndex);
        } else {
          // 단어 단위로 자르기
          const words = titleCandidate.split(' ');
          let shortTitle = '';
          for (const word of words) {
            if (shortTitle.length + word.length > 80) break;
            shortTitle += (shortTitle ? ' ' : '') + word;
          }
          titleCandidate = shortTitle || titleCandidate.slice(0, 80);
        }
      }
      
      // 이모지와 특수문자 정리
      titleCandidate = titleCandidate.replace(/[🤖📊💰🚀]/g, '').trim();
      
      // 빈 제목이면 본문에서 핵심 내용 추출
      if (!titleCandidate || titleCandidate.length < 10) {
        const mainContent = content.slice(0, 200).replace(/\n/g, ' ');
        const keyPoint = mainContent.match(/(?:분석|전망|동향|트렌드|이슈|핵심|중요).*?[.!?]/);
        titleCandidate = keyPoint ? keyPoint[0].slice(0, 80) : mainContent.slice(0, 80);
      }
      
      return titleCandidate.trim();
    };
    
    const finalCategoryId = categoryId || getDefaultCategory(agentId);
    const finalTitle = title || extractTitle(generatedContent.content);

    // AI 에이전트의 고유 사용자 ID 가져오기
    const authorId = await getAIAgentUserId(agentId);

    // 분석방에 게시물 생성
    const postResult = await query(`
      INSERT INTO discussion_posts (title, content, category_id, author_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, title, created_at
    `, [
      finalTitle,
      generatedContent.content,
      finalCategoryId,
      authorId // AI 에이전트별 고유 사용자 ID 사용
    ]);

    const discussionPost = postResult.rows[0];

    // 활동 로그 기록
    await query(`
      INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
      agentId,
      'discussion_post',
      generatedContent.content,
      JSON.stringify({ 
        manual: true, 
        prompt, 
        discussionId: discussionPost.id,
        categoryId: finalCategoryId,
        title: finalTitle
      })
    ]);

    console.log(`📄 ${agent.nickname}이 분석방에 게시물을 작성했습니다: ${discussionPost.title}`);

    res.json({
      agentId,
      nickname: agent.nickname,
      content: generatedContent.content,
      discussionPost: {
        id: discussionPost.id,
        title: discussionPost.title,
        categoryId: finalCategoryId,
        createdAt: discussionPost.created_at,
        url: `/discussion-post.html?id=${discussionPost.id}`
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('분석방 게시 오류:', error);
    res.status(500).json({ error: 'Failed to post to discussions' });
  }
});

// 데이터베이스 직접 업데이트 (개발용)
router.post('/update-system-prompts', requireAdmin, async (req, res) => {
  try {
    const updates = [
      {
        id: 'data-kim',
        prompt: '너는 경제/정치 베팅 예측에 미친 디시인이야 ㅋㅋ 데이터로 논쟁거리 만들어내는 게 특기고, YEGAM 베팅방에서 50:50 갈등 유발하는 게 목표야. "다음 달 금리 인상 vs 동결", "내년 대선 결과", "인플레이션 상승 vs 하락" 같은 논쟁적 주제를 던져. 반말 써도 되고 ㅋㅋㅋ, ㅎㅎ, ^^; 이런 거 자유롭게 써. 근데 예의는 지켜 ㅇㅇ 차트랑 숫자 들이밀면서 "이거 베팅하면 누가 이길까?" 이런 식으로 도발해봐 ㅋㅋ 🤖데이터킴'
      },
      {
        id: 'chart-king',
        prompt: '야 나는 코인/주식 베팅계의 전설이야 ㅋㅋㅋ 차트 보면서 "비트 10만불 돌파 vs 7만불 추락" 이런 50:50 베팅거리 만드는 게 내 특기임 ㅎㅎ "테슬라 vs 애플 누가 이길까?", "이번 주 코스피 3000 돌파 가능?" 이런 걸로 YEGAM 베팅방 뒤집어놔 ㅋㅋ 반말로 편하게 쓰고 ㅋㅋㅋ, ^^; 이런 것도 써가면서 밈도 섞어. 근데 투자는 본인 책임이야~ 라는 말은 꼭 넣어줘 ㅇㅇ 🤖차트왕'
      },
      {
        id: 'tech-guru',
        prompt: '테크계 논쟁왕이 왔다 ㅋㅋㅋ "애플 vs 삼성 신제품 대결", "ChatGPT vs Claude 누가 더 똑똑함?", "메타버스 대박 vs 망함" 이런 걸로 YEGAM 베팅방에서 키배 유발하는 게 내 역할임 ㅎㅎ 최신 IT 밈이랑 개발자 개그도 섞어가면서 반말로 편하게 써 ㅇㅇ "갤럭시 폴드 vs 아이폰 플립" 이런 것도 좋고 ㅋㅋ ^^; 표정도 자주 써줘~ 🤖테크구루'
      },
      {
        id: 'hipster-choi',
        prompt: 'MZ 트렌드 베팅계의 힙스터가 떴다 ㅋㅋㅋ "뉴진스 vs 에스파 누가 더 핫?", "틱톡 vs 인스타 릴스 승부", "이번 유행 뭐가 될까?" 이런 걸로 YEGAM 베팅 ㅆㅅㅌㅊ 만들어보자 ㅎㅎ 최신 밈 무조건 써야 하고 ㅋㅋㅋ, ㅇㅈ?, ㅗㅜㅑ 같은 줄임말도 쓸 줄 아는 척해 ^^; "올해 대세 패션 vs 먹거리" 이런 것도 괜찮고~ 🤖힙스터최'
      },
      {
        id: 'social-lover',
        prompt: 'SNS 베팅계의 바이럴 메이커다 ㅋㅋ "유튜브 vs 틱톡 어디가 더 대세?", "인플루언서 논란 어디까지 갈까?", "이번 챌린지 대박 vs 쪽박" 이런 걸로 YEGAM에서 설전 벌여보자 ㅎㅎ 각종 SNS 밈이랑 요즘 유행하는 말투 써가면서 반말로 편하게~ ㅋㅋㅋ ^^; 이런 표정도 자주 쓰고 "구독 좋아요 알림설정" 이런 개그도 섞어줘 ㅇ㇂ 🤖소셜러'
      },
      {
        id: 'medical-doctor',
        prompt: '의료계 베팅 토론왕이야 ㅋㅋ "올해 독감 vs 코로나 뭐가 더 심할까?", "다이어트 방법 뭐가 제일 효과적임?", "수면시간 6시간 vs 8시간 논란" 이런 걸로 YEGAM 베팅방 달궈보자 ㅎㅎ 의학적 근거는 대면서도 재밌게 써야 함 ㅇㅇ 반말 써도 되고 ㅋㅋㅋ, ^^; 이런 거 자주 써. 근데 "의사 상담 받으라고~" 는 꼭 넣어줘야 해 ㅇㅈ? 🤖의료박사'
      },
      {
        id: 'positive-one',
        prompt: '긍정 에너지 베팅왕 등장 ㅋㅋㅋ "올해는 좋은 일 vs 평범한 일 뭐가 더 많을까?", "운동 vs 다이어트 뭐가 더 성공률 높음?", "새해 목표 달성 vs 포기 베팅" 이런 걸로 YEGAM에서 희망 배틀 벌여보자 ㅎㅎ 항상 밝게 반말로 쓰고 ㅋㅋㅋ, ㅎㅎ, ^^; 이런 거 많이 써줘! "할 수 있다 화이팅" 이런 것도 넣으면서 🤖긍정이'
      },
      {
        id: 'cautious-one',
        prompt: '신중파 베팅 분석가 왔음 ㅋㅋ "투자 vs 저축 뭐가 더 안전?", "부동산 상승 vs 하락 리스크", "경제 호황 vs 불황 가능성" 이런 걸로 YEGAM에서 리스크 토론 만들어보자 ㅎㅎ 양쪽 다 따져보면서 "근데 이건 좀 위험할 수도..." 이런 식으로 반박도 해줘 ㅇㅇ 반말 써도 되고 ㅋㅋ, ^^; 이런 거 쓰면서 🤖신중이'
      },
      {
        id: 'humor-king',
        prompt: '개그계 베팅왕이 나타났다 ㅋㅋㅋㅋㅋ "개그맨 vs 유튜버 누가 더 웃김?", "썰 vs 개그 뭐가 더 재밌음?", "이번 유행어 뭐가 될까?" 이런 걸로 YEGAM 베팅방을 웃음바다로 만들어버림 ㅎㅎㅎ 최신 밈 총동원하고 ㅋㅋㅋㅋ, ㅗㅜㅑ, ^^; 이런 거 막 써가면서 "아 진짜 웃기네 ㅋㅋㅋ" 이런 식으로 🤖유머킹'
      },
      {
        id: 'observer',
        prompt: '관찰력 갑 베팅 예측왕임 ㅋㅋ "사람들이 놓친 포인트 vs 뻔한 결과", "숨겨진 진실 vs 겉보기 현상", "다들 모르는 사실 vs 알려진 사실" 이런 걸로 YEGAM에서 반전 베팅 만들어내는 게 내 특기 ㅎㅎ 짧게 임팩트 있게 쓰는데 반말로 편하게~ ㅋㅋ ^^; 이런 거 가끔 써주고 "너희 이거 놓쳤지?" 이런 식으로 🤖관찰자'
      }
    ];

    const results = [];
    for (const agent of updates) {
      try {
        await query(
          'UPDATE ai_agents SET system_prompt = $1, updated_at = CURRENT_TIMESTAMP WHERE agent_id = $2',
          [agent.prompt, agent.id]
        );
        results.push({ agentId: agent.id, status: 'success' });
        console.log(`✅ ${agent.id} system_prompt 업데이트 완료`);
      } catch (err) {
        results.push({ agentId: agent.id, status: 'error', error: err.message });
        console.error(`❌ ${agent.id} 업데이트 실패:`, err.message);
      }
    }

    res.json({
      message: 'System prompts update completed',
      results: results,
      successCount: results.filter(r => r.status === 'success').length,
      errorCount: results.filter(r => r.status === 'error').length
    });

  } catch (error) {
    console.error('System prompts 업데이트 오류:', error);
    res.status(500).json({ error: 'Failed to update system prompts' });
  }
});

// 레벨/등급 시스템 설정
router.post('/setup-level-system', requireAdmin, async (req, res) => {
  try {
    console.log('⭐ 사용자 레벨/등급 시스템 설정 중...');
    
    // 1. 테이블에 컬럼 추가
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS experience INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rank VARCHAR(20) DEFAULT '티끌',
      ADD COLUMN IF NOT EXISTS total_posts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_comments INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_bets INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS win_streak INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_win_streak INTEGER DEFAULT 0
    `);

    // 2. 등급 계산 함수 생성
    await query(`
      CREATE OR REPLACE FUNCTION get_user_rank(user_level INTEGER) 
      RETURNS VARCHAR(20) AS $$
      BEGIN
        CASE 
          WHEN user_level >= 100 THEN RETURN '전설';
          WHEN user_level >= 80 THEN RETURN '다이아';
          WHEN user_level >= 60 THEN RETURN '플래티넘';
          WHEN user_level >= 40 THEN RETURN '골드';
          WHEN user_level >= 20 THEN RETURN '실버';
          WHEN user_level >= 10 THEN RETURN '브론즈';
          WHEN user_level >= 5 THEN RETURN '아이언';
          WHEN user_level >= 1 THEN RETURN '새싹';
          ELSE RETURN '티끌';
        END CASE;
      END;
      $$ LANGUAGE plpgsql
    `);

    // 3. AI 에이전트들에게 특별한 레벨 부여
    await query(`
      UPDATE users 
      SET 
        level = 99,
        experience = 9900,
        rank = '다이아',
        total_posts = 999,
        total_comments = 999
      WHERE username LIKE 'ai_%'
    `);

    // 4. 기존 일반 사용자들 기본값 설정
    await query(`
      UPDATE users 
      SET 
        level = COALESCE(level, 0),
        experience = COALESCE(experience, 0),
        rank = COALESCE(rank, '티끌'),
        total_posts = COALESCE(total_posts, 0),
        total_comments = COALESCE(total_comments, 0),
        total_bets = COALESCE(total_bets, 0),
        win_streak = COALESCE(win_streak, 0),
        max_win_streak = COALESCE(max_win_streak, 0)
      WHERE level IS NULL OR rank IS NULL
    `);

    // 5. 확인용 데이터 조회
    const userLevels = await query(`
      SELECT 
        id, username, level, experience, rank, total_posts, total_comments,
        CASE 
          WHEN username LIKE 'ai_%' THEN '🤖 AI'
          ELSE '👤 User'
        END as user_type
      FROM users
      ORDER BY level DESC, experience DESC
      LIMIT 20
    `);

    res.json({
      message: '사용자 레벨/등급 시스템 설정 완료',
      userLevels: userLevels.rows,
      totalUsers: userLevels.rows.length
    });

  } catch (error) {
    console.error('레벨 시스템 설정 실패:', error);
    res.status(500).json({ error: 'Failed to setup level system', details: error.message });
  }
});

// AI 에이전트용 사용자 계정 설정
router.post('/setup-ai-users', requireAdmin, async (req, res) => {
  try {
    console.log('🤖 AI 에이전트용 사용자 계정 생성 중...');
    
    const aiUsers = [
      { username: 'ai_data_kim', email: 'data.kim@yegam.ai', agentId: 'data-kim' },
      { username: 'ai_chart_king', email: 'chart.king@yegam.ai', agentId: 'chart-king' },
      { username: 'ai_tech_guru', email: 'tech.guru@yegam.ai', agentId: 'tech-guru' },
      { username: 'ai_hipster_choi', email: 'hipster.choi@yegam.ai', agentId: 'hipster-choi' },
      { username: 'ai_social_lover', email: 'social.lover@yegam.ai', agentId: 'social-lover' },
      { username: 'ai_medical_doctor', email: 'medical.doctor@yegam.ai', agentId: 'medical-doctor' },
      { username: 'ai_positive_one', email: 'positive.one@yegam.ai', agentId: 'positive-one' },
      { username: 'ai_cautious_one', email: 'cautious.one@yegam.ai', agentId: 'cautious-one' },
      { username: 'ai_humor_king', email: 'humor.king@yegam.ai', agentId: 'humor-king' },
      { username: 'ai_observer', email: 'observer@yegam.ai', agentId: 'observer' }
    ];

    const results = [];
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
        
        results.push({
          agentId: user.agentId,
          userId: result.rows[0].id,
          username: result.rows[0].username,
          status: 'success'
        });
        console.log(`✅ ${user.agentId} -> user_id: ${result.rows[0].id}`);
      } catch (userError) {
        results.push({
          agentId: user.agentId,
          status: 'error',
          error: userError.message
        });
        console.error(`❌ ${user.agentId} 생성 실패:`, userError.message);
      }
    }

    // 매핑 확인
    const mapping = await query(`
      SELECT 
        aa.agent_id,
        aa.nickname,
        u.id as user_id,
        u.username
      FROM ai_agents aa
      JOIN users u ON (
        (aa.agent_id = 'data-kim' AND u.username = 'ai_data_kim') OR
        (aa.agent_id = 'chart-king' AND u.username = 'ai_chart_king') OR
        (aa.agent_id = 'tech-guru' AND u.username = 'ai_tech_guru') OR
        (aa.agent_id = 'hipster-choi' AND u.username = 'ai_hipster_choi') OR
        (aa.agent_id = 'social-lover' AND u.username = 'ai_social_lover') OR
        (aa.agent_id = 'medical-doctor' AND u.username = 'ai_medical_doctor') OR
        (aa.agent_id = 'positive-one' AND u.username = 'ai_positive_one') OR
        (aa.agent_id = 'cautious-one' AND u.username = 'ai_cautious_one') OR
        (aa.agent_id = 'humor-king' AND u.username = 'ai_humor_king') OR
        (aa.agent_id = 'observer' AND u.username = 'ai_observer')
      )
      ORDER BY aa.agent_id
    `);

    res.json({
      message: 'AI 에이전트 사용자 계정 설정 완료',
      results: results,
      mapping: mapping.rows,
      successCount: results.filter(r => r.status === 'success').length,
      errorCount: results.filter(r => r.status === 'error').length
    });

  } catch (error) {
    console.error('AI 사용자 설정 실패:', error);
    res.status(500).json({ error: 'Failed to setup AI users' });
  }
});

// Superadmin 글/댓글 관리 기능
router.get('/admin/discussions', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '' } = req.query;
    
    let whereClause = '';
    let params = [];
    let paramIndex = 1;
    
    if (search) {
      whereClause = `WHERE (dp.title ILIKE $${paramIndex} OR dp.content ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // 게시물 조회
    const posts = await query(`
      SELECT 
        dp.id,
        dp.title,
        dp.content,
        dp.category_id,
        dp.created_at,
        u.id as author_id,
        u.username as author_username,
        u.level,
        u.rank,
        CASE WHEN u.username LIKE 'ai_%' THEN true ELSE false END as is_ai
      FROM discussion_posts dp
      JOIN users u ON dp.author_id = u.id
      ${whereClause}
      ORDER BY dp.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), parseInt(offset)]);

    // 댓글 조회 (최근 50개)
    const comments = await query(`
      SELECT 
        dc.id,
        dc.content,
        dc.post_id,
        dc.created_at,
        u.id as author_id,
        u.username as author_username,
        u.level,
        u.rank,
        dp.title as post_title,
        CASE WHEN u.username LIKE 'ai_%' THEN true ELSE false END as is_ai
      FROM discussion_comments dc
      JOIN users u ON dc.author_id = u.id
      JOIN discussion_posts dp ON dc.post_id = dp.id
      ORDER BY dc.created_at DESC
      LIMIT 50
    `);

    res.json({
      posts: posts.rows,
      comments: comments.rows,
      totalPosts: posts.rows.length,
      totalComments: comments.rows.length
    });

  } catch (error) {
    console.error('토론 관리 데이터 조회 실패:', error);
    res.status(500).json({ error: 'Failed to get discussions data' });
  }
});

// 게시물 삭제
router.delete('/admin/discussions/posts/:postId', requireAdmin, async (req, res) => {
  try {
    const { postId } = req.params;
    
    // 게시물 정보 먼저 조회
    const post = await get('SELECT * FROM discussion_posts WHERE id = $1', [postId]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // 관련 댓글부터 삭제
    const deletedComments = await query('DELETE FROM discussion_comments WHERE post_id = $1 RETURNING id', [postId]);
    
    // 좋아요 삭제
    await query('DELETE FROM discussion_post_likes WHERE post_id = $1', [postId]);
    await query('DELETE FROM discussion_comment_likes WHERE comment_id IN (SELECT id FROM discussion_comments WHERE post_id = $1)', [postId]);
    
    // 게시물 삭제
    await query('DELETE FROM discussion_posts WHERE id = $1', [postId]);

    console.log(`🗑️ 관리자가 게시물 삭제: ID ${postId}, 댓글 ${deletedComments.rows.length}개도 함께 삭제`);

    res.json({
      message: '게시물이 삭제되었습니다',
      deletedPost: post.id,
      deletedComments: deletedComments.rows.length
    });

  } catch (error) {
    console.error('게시물 삭제 실패:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// 댓글 삭제
router.delete('/admin/discussions/comments/:commentId', requireAdmin, async (req, res) => {
  try {
    const { commentId } = req.params;
    
    // 댓글 정보 먼저 조회
    const comment = await get('SELECT * FROM discussion_comments WHERE id = $1', [commentId]);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // 댓글 좋아요 삭제
    await query('DELETE FROM discussion_comment_likes WHERE comment_id = $1', [commentId]);
    
    // 댓글 삭제
    await query('DELETE FROM discussion_comments WHERE id = $1', [commentId]);

    console.log(`🗑️ 관리자가 댓글 삭제: ID ${commentId}`);

    res.json({
      message: '댓글이 삭제되었습니다',
      deletedComment: comment.id
    });

  } catch (error) {
    console.error('댓글 삭제 실패:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// 일괄 삭제 (AI 글 또는 특정 사용자 글)
router.post('/admin/discussions/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { type, userId, confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ error: 'Confirmation required' });
    }

    let deletedPosts = 0;
    let deletedComments = 0;

    if (type === 'ai_posts') {
      // AI 게시물 모두 삭제
      const aiPosts = await query(`
        SELECT dp.id FROM discussion_posts dp
        JOIN users u ON dp.author_id = u.id
        WHERE u.username LIKE 'ai_%'
      `);
      
      for (const post of aiPosts.rows) {
        await query('DELETE FROM discussion_comments WHERE post_id = $1', [post.id]);
        await query('DELETE FROM discussion_post_likes WHERE post_id = $1', [post.id]);
      }
      
      const result = await query(`
        DELETE FROM discussion_posts 
        WHERE author_id IN (SELECT id FROM users WHERE username LIKE 'ai_%')
        RETURNING id
      `);
      
      deletedPosts = result.rows.length;
      
    } else if (type === 'user_content' && userId) {
      // 특정 사용자의 모든 글/댓글 삭제
      const userPosts = await query('SELECT id FROM discussion_posts WHERE author_id = $1', [userId]);
      
      for (const post of userPosts.rows) {
        await query('DELETE FROM discussion_comments WHERE post_id = $1', [post.id]);
        await query('DELETE FROM discussion_post_likes WHERE post_id = $1', [post.id]);
      }
      
      const postsResult = await query('DELETE FROM discussion_posts WHERE author_id = $1 RETURNING id', [userId]);
      const commentsResult = await query('DELETE FROM discussion_comments WHERE author_id = $1 RETURNING id', [userId]);
      
      deletedPosts = postsResult.rows.length;
      deletedComments = commentsResult.rows.length;
    }

    console.log(`🗑️ 관리자 일괄 삭제: ${type}, 게시물 ${deletedPosts}개, 댓글 ${deletedComments}개`);

    res.json({
      message: '일괄 삭제가 완료되었습니다',
      deletedPosts,
      deletedComments,
      type
    });

  } catch (error) {
    console.error('일괄 삭제 실패:', error);
    res.status(500).json({ error: 'Failed to bulk delete' });
  }
});

// AI 에이전트 ID로 사용자 ID 가져오는 헬퍼 함수
async function getAIAgentUserId(agentId) {
  const mapping = {
    'data-kim': 'ai_data_kim',
    'chart-king': 'ai_chart_king', 
    'tech-guru': 'ai_tech_guru',
    'hipster-choi': 'ai_hipster_choi',
    'social-lover': 'ai_social_lover',
    'medical-doctor': 'ai_medical_doctor',
    'positive-one': 'ai_positive_one',
    'cautious-one': 'ai_cautious_one',
    'humor-king': 'ai_humor_king',
    'observer': 'ai_observer'
  };

  const username = mapping[agentId];
  if (!username) {
    throw new Error(`Unknown agent ID: ${agentId}`);
  }

  try {
    const result = await get(`SELECT id FROM users WHERE username = $1`, [username]);
    return result ? result.id : 1; // fallback to 1 if not found
  } catch (error) {
    console.error(`Failed to get user ID for agent ${agentId}:`, error);
    return 1; // fallback to 1
  }
}

module.exports = {
  router,
  initializeAgents,
  getAgentManager: () => agentManager,
  getAgentScheduler: () => agentScheduler,
  getAIAgentUserId
};