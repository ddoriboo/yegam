import express from 'express';
import { logger } from '../utils/logger.js';

export function createAgentRouter(agentManager) {
  const router = express.Router();

  // 모든 에이전트 상태 조회
  router.get('/agents', (req, res) => {
    try {
      const stats = agentManager.getAgentStats();
      res.json(stats);
    } catch (error) {
      logger.error('Error getting agent stats:', error);
      res.status(500).json({ error: 'Failed to get agent stats' });
    }
  });

  // 특정 에이전트 상태 조회
  router.get('/agents/:agentId', (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json(agent.getStats());
    } catch (error) {
      logger.error('Error getting agent:', error);
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // 에이전트 활성/비활성화
  router.put('/agents/:agentId/status', (req, res) => {
    try {
      const { active } = req.body;
      const success = agentManager.setAgentActive(req.params.agentId, active);
      
      if (!success) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      res.json({ 
        agentId: req.params.agentId, 
        active,
        message: `Agent ${active ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      logger.error('Error updating agent status:', error);
      res.status(500).json({ error: 'Failed to update agent status' });
    }
  });

  // 모든 에이전트 활성화
  router.post('/agents/activate-all', (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      agents.forEach(agent => agent.setActive(true));
      
      res.json({ 
        message: 'All agents activated',
        count: agents.length
      });
    } catch (error) {
      logger.error('Error activating all agents:', error);
      res.status(500).json({ error: 'Failed to activate all agents' });
    }
  });

  // 모든 에이전트 비활성화
  router.post('/agents/deactivate-all', (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      agents.forEach(agent => agent.setActive(false));
      
      res.json({ 
        message: 'All agents deactivated',
        count: agents.length
      });
    } catch (error) {
      logger.error('Error deactivating all agents:', error);
      res.status(500).json({ error: 'Failed to deactivate all agents' });
    }
  });

  // 긴급 정지
  router.post('/emergency-stop', (req, res) => {
    try {
      agentManager.emergencyStop();
      logger.warn('Emergency stop activated via API');
      
      res.json({ 
        message: 'Emergency stop activated',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error in emergency stop:', error);
      res.status(500).json({ error: 'Failed to execute emergency stop' });
    }
  });

  // 수동 콘텐츠 생성 트리거
  router.post('/agents/:agentId/generate-content', async (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const { context } = req.body;
      const content = await agent.generatePost(context);
      
      if (!content) {
        return res.status(400).json({ error: 'Failed to generate content' });
      }
      
      res.json(content);
    } catch (error) {
      logger.error('Error generating content:', error);
      res.status(500).json({ error: 'Failed to generate content' });
    }
  });

  return router;
}

export function createSystemRouter(agentManager, scheduler, contentFilter) {
  const router = express.Router();

  // 시스템 상태 조회
  router.get('/system/status', async (req, res) => {
    try {
      const apiStatus = await agentManager.validateApiKey();
      const schedulerStatus = scheduler.getSchedulerStatus();
      
      res.json({
        apiStatus,
        scheduler: schedulerStatus,
        contentFilter: process.env.ENABLE_CONTENT_FILTER === 'true',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error getting system status:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  });

  // 스케줄러 시작/중지
  router.post('/system/scheduler/:action', (req, res) => {
    try {
      const { action } = req.params;
      
      if (action === 'start') {
        scheduler.start();
        res.json({ message: 'Scheduler started' });
      } else if (action === 'stop') {
        scheduler.stop();
        res.json({ message: 'Scheduler stopped' });
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      logger.error('Error controlling scheduler:', error);
      res.status(500).json({ error: 'Failed to control scheduler' });
    }
  });

  // 콘텐츠 필터 설정
  router.put('/system/content-filter', (req, res) => {
    try {
      const { threshold, bannedWords } = req.body;
      
      if (threshold !== undefined) {
        contentFilter.setThreshold(threshold);
      }
      
      if (bannedWords && Array.isArray(bannedWords)) {
        bannedWords.forEach(word => contentFilter.addBannedWord(word));
      }
      
      res.json({ 
        message: 'Content filter updated',
        threshold: contentFilter.threshold,
        bannedWordsCount: contentFilter.getBannedWords().length
      });
    } catch (error) {
      logger.error('Error updating content filter:', error);
      res.status(500).json({ error: 'Failed to update content filter' });
    }
  });

  return router;
}