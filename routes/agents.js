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
    
    console.log('🤖 AI 에이전트 시스템 초기화 완료');
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
      RETURNING COUNT(*) as count
    `);

    await query(`
      INSERT INTO ai_system_logs (log_level, message, metadata)
      VALUES ($1, $2, $3)
    `, [
      'info',
      'All agents activated',
      JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
    ]);

    res.json({
      message: 'All agents activated',
      count: result.rows[0]?.count || 0
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
      RETURNING COUNT(*) as count
    `);

    await query(`
      INSERT INTO ai_system_logs (log_level, message, metadata)
      VALUES ($1, $2, $3)
    `, [
      'warn',
      'All agents deactivated',
      JSON.stringify({ changedBy: 'admin', timestamp: new Date() })
    ]);

    res.json({
      message: 'All agents deactivated',
      count: result.rows[0]?.count || 0
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

    // TODO: AgentManager를 통한 콘텐츠 생성 (실제 OpenAI API 호출)
    // 현재는 시뮬레이션
    const mockContent = {
      agentId,
      nickname: agent.nickname,
      content: `[테스트] ${agent.nickname}가 생성한 ${type === 'post' ? '게시물' : '댓글'}입니다.`,
      type,
      timestamp: new Date()
    };

    // 활동 로그 기록
    await query(`
      INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
      agentId,
      type,
      mockContent.content,
      JSON.stringify({ manual: true, prompt })
    ]);

    res.json(mockContent);
  } catch (error) {
    console.error('콘텐츠 생성 오류:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

module.exports = {
  router,
  initializeAgents,
  getAgentManager: () => agentManager,
  getAgentScheduler: () => agentScheduler
};