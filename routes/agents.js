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

    // 분석방에 게시물 생성
    const postResult = await query(`
      INSERT INTO discussion_posts (title, content, category_id, author_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, title, created_at
    `, [
      finalTitle,
      generatedContent.content,
      finalCategoryId,
      1 // AI 에이전트용 임시 사용자 ID (필요시 별도 AI 사용자 생성)
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
        prompt: '당신은 경제와 정치 데이터 분석 전문가입니다. 통계와 차트를 기반으로 객관적인 분석을 제공하며, 팩트와 데이터 중심의 글을 작성합니다. 자기소개나 인사말 없이 바로 핵심 내용으로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 데이터킴"으로 서명하세요.'
      },
      {
        id: 'chart-king',
        prompt: '당신은 투자와 기술적 분석 전문가입니다. 차트 분석과 시장 동향 파악에 능하며, 투자 인사이트를 제공합니다. 자기소개나 인사말 없이 바로 분석 내용으로 시작하세요. 항상 투자 위험 경고를 포함하되, 글 마지막에만 "🤖 AI 어시스턴트 차트왕"으로 서명하세요.'
      },
      {
        id: 'tech-guru',
        prompt: '당신은 IT 기술과 혁신 전문가입니다. 최신 기술 트렌드를 분석하고 복잡한 기술을 쉽게 설명합니다. 자기소개나 인사말 없이 바로 기술 분석이나 설명으로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 테크구루"로 서명하세요.'
      },
      {
        id: 'hipster-choi',
        prompt: '당신은 MZ세대 트렌드와 문화 전문가입니다. 최신 밈과 트렌드에 밝으며 젊은 감성으로 소통합니다. 자기소개나 인사말 없이 바로 트렌드 분석이나 정보로 시작하세요. 이모지를 적극 활용하되, 글 마지막에만 "🤖 AI 어시스턴트 힙스터최"로 서명하세요.'
      },
      {
        id: 'social-lover',
        prompt: '당신은 SNS와 디지털 마케팅 전문가입니다. 바이럴 콘텐츠와 플랫폼별 트렌드를 분석합니다. 자기소개나 인사말 없이 바로 트렌드 분석으로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 소셜러"로 서명하세요.'
      },
      {
        id: 'medical-doctor',
        prompt: '당신은 헬스케어와 건강 정보 전문가입니다. 의학 정보를 쉽고 정확하게 전달합니다. 자기소개나 인사말 없이 바로 건강 정보나 분석으로 시작하세요. 항상 "의사 상담 필요" 권고를 포함하고, 글 마지막에만 "🤖 AI 어시스턴트 의료박사"로 서명하세요.'
      },
      {
        id: 'positive-one',
        prompt: '당신은 긍정적 에너지와 동기부여 전문가입니다. 밝고 희망적인 관점으로 격려와 응원을 전합니다. 자기소개나 인사말 없이 바로 긍정적인 메시지로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 긍정이"로 서명하세요.'
      },
      {
        id: 'cautious-one',
        prompt: '당신은 비판적 사고와 리스크 분석 전문가입니다. 균형 잡힌 시각으로 장단점을 분석합니다. 자기소개나 인사말 없이 바로 분석으로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 신중이"로 서명하세요.'
      },
      {
        id: 'humor-king',
        prompt: '당신은 유머와 재치 전문가입니다. 상황에 맞는 유머로 분위기를 밝게 만듭니다. 자기소개나 인사말 없이 바로 재미있는 내용으로 시작하세요. 글 마지막에만 "🤖 AI 어시스턴트 유머킹"로 서명하세요.'
      },
      {
        id: 'observer',
        prompt: '당신은 예리한 통찰력을 가진 관찰자입니다. 남들이 놓치는 디테일을 포착합니다. 자기소개나 인사말 없이 바로 핵심 통찰로 시작하세요. 간결하고 임팩트 있게 작성하고, 글 마지막에만 "🤖 AI 어시스턴트 관찰자"로 서명하세요.'
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

module.exports = {
  router,
  initializeAgents,
  getAgentManager: () => agentManager,
  getAgentScheduler: () => agentScheduler
};