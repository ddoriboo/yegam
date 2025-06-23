const cron = require('node-cron');
const { query, get } = require('../database/database');

class AgentScheduler {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.scheduledTasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  AI 에이전트 스케줄러가 이미 실행 중입니다');
      return;
    }

    this.isRunning = true;
    console.log('🤖 AI 에이전트 스케줄러 시작');

    this.scheduleContentGeneration();
    this.scheduleReplyGeneration();
    this.scheduleHealthCheck();
  }

  stop() {
    this.isRunning = false;
    
    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      console.log(`⏹️  스케줄 작업 중지: ${name}`);
    });
    
    this.scheduledTasks.clear();
    console.log('🛑 AI 에이전트 스케줄러 중지됨');
  }

  scheduleContentGeneration() {
    // 15분마다 콘텐츠 생성 확인
    const task = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('📝 AI 에이전트 콘텐츠 생성 작업 실행');
        
        // 긴급 정지 상태 확인
        const emergencyStop = await get(`
          SELECT config_value FROM ai_system_config 
          WHERE config_key = 'emergency_stop'
        `);

        if (emergencyStop && emergencyStop.config_value === 'true') {
          console.log('🛑 긴급 정지 상태 - 콘텐츠 생성 건너뜀');
          return;
        }

        const activeAgents = await this.agentManager.getActiveAgents();
        
        for (const agent of activeAgents) {
          // 각 에이전트의 포스트 빈도에 따라 확률적으로 실행
          const postFrequency = 3; // 일 3회 기본값
          const shouldPost = Math.random() < (1 / (24 / postFrequency));
          
          if (shouldPost) {
            console.log(`📝 ${agent.nickname} 콘텐츠 생성 시도`);
            
            // 최근 토론 주제 가져오기 (있다면)
            const recentTopics = await this.getRecentTopics();
            const context = { recentTopics };
            
            const content = await this.agentManager.generatePost(agent.agent_id, context);
            
            if (content) {
              // 실제 토론 게시물로 등록 (토론 시스템이 있다면)
              await this.postToDiscussions(content);
              
              // 대기 시간 (2-5초)
              await this.randomDelay(2000, 5000);
            }
          }
        }
      } catch (error) {
        console.error('콘텐츠 생성 작업 오류:', error);
        
        await query(`
          INSERT INTO ai_system_logs (log_level, message, metadata)
          VALUES ($1, $2, $3)
        `, ['error', 'Content generation task failed', JSON.stringify({ error: error.message })]);
      }
    }, {
      scheduled: false
    });

    this.scheduledTasks.set('contentGeneration', task);
    task.start();
    console.log('📅 콘텐츠 생성 스케줄 등록됨 (15분마다)');
  }

  scheduleReplyGeneration() {
    // 10분마다 댓글 생성 확인
    const task = cron.schedule('*/10 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('💬 AI 에이전트 댓글 생성 작업 실행');
        
        // 긴급 정지 확인
        const emergencyStop = await get(`
          SELECT config_value FROM ai_system_config 
          WHERE config_key = 'emergency_stop'
        `);

        if (emergencyStop && emergencyStop.config_value === 'true') {
          return;
        }

        // 최근 토론 게시물들 가져오기 (토론 시스템이 있다면)
        const recentPosts = await this.getRecentDiscussions();
        const activeAgents = await this.agentManager.getActiveAgents();
        
        for (const post of recentPosts.slice(0, 5)) { // 최신 5개만
          for (const agent of activeAgents) {
            // 자신의 게시물에는 댓글 달지 않음
            if (post.author_ai_agent === agent.agent_id) continue;
            
            // 30% 확률로 댓글 생성
            if (Math.random() > 0.3) continue;
            
            const existingReplies = await this.getExistingReplies(post.id);
            const reply = await this.agentManager.generateReply(
              agent.agent_id, 
              post, 
              existingReplies
            );
            
            if (reply) {
              await this.postReplyToDiscussion(post.id, reply);
              await this.randomDelay(3000, 8000);
            }
          }
        }
      } catch (error) {
        console.error('댓글 생성 작업 오류:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledTasks.set('replyGeneration', task);
    task.start();
    console.log('📅 댓글 생성 스케줄 등록됨 (10분마다)');
  }

  scheduleHealthCheck() {
    // 1시간마다 헬스 체크
    const task = cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        console.log('🔍 AI 에이전트 시스템 헬스 체크');
        
        // 활성 에이전트 수 확인
        const activeAgents = await query(`
          SELECT COUNT(*) as count FROM ai_agents WHERE is_active = true
        `);

        // 최근 24시간 활동 통계
        const activities = await query(`
          SELECT 
            activity_type,
            COUNT(*) as count
          FROM ai_agent_activities 
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY activity_type
        `);

        const stats = {
          activeAgents: parseInt(activeAgents.rows[0]?.count || 0),
          activities24h: {}
        };

        activities.rows.forEach(activity => {
          stats.activities24h[activity.activity_type] = parseInt(activity.count);
        });

        console.log('📊 AI 에이전트 24시간 통계:', stats);

        // API 키 검증
        const apiValid = await this.agentManager.validateApiKey();
        if (!apiValid) {
          console.error('❌ OpenAI API 키 검증 실패');
          
          await query(`
            INSERT INTO ai_system_logs (log_level, message, metadata)
            VALUES ($1, $2, $3)
          `, ['error', 'OpenAI API key validation failed', JSON.stringify(stats)]);
        }

        // 헬스 체크 로그
        await query(`
          INSERT INTO ai_system_logs (log_level, message, metadata)
          VALUES ($1, $2, $3)
        `, ['info', 'Health check completed', JSON.stringify(stats)]);

      } catch (error) {
        console.error('헬스 체크 오류:', error);
      }
    }, {
      scheduled: false
    });

    this.scheduledTasks.set('healthCheck', task);
    task.start();
    console.log('📅 헬스 체크 스케줄 등록됨 (1시간마다)');
  }

  async getRecentTopics() {
    try {
      // 기존 토론 시스템에서 최근 주제 가져오기
      const topics = await query(`
        SELECT title 
        FROM discussions 
        WHERE created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC 
        LIMIT 10
      `);

      return topics.rows.map(row => row.title);
    } catch (error) {
      // 토론 테이블이 없다면 기본 주제 반환
      return ['AI 기술', '경제 동향', '주식 시장', '최신 트렌드', '게임 뉴스'];
    }
  }

  async getRecentDiscussions() {
    try {
      // 최근 토론 게시물 가져오기
      const discussions = await query(`
        SELECT id, title, content, author, created_at
        FROM discussions 
        WHERE created_at > NOW() - INTERVAL '1 day'
        ORDER BY created_at DESC 
        LIMIT 20
      `);

      return discussions.rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        author: row.author,
        created_at: row.created_at
      }));
    } catch (error) {
      console.log('토론 테이블 없음 - 빈 배열 반환');
      return [];
    }
  }

  async getExistingReplies(discussionId) {
    try {
      const replies = await query(`
        SELECT content, author 
        FROM discussion_comments 
        WHERE discussion_id = $1 
        ORDER BY created_at ASC
      `, [discussionId]);

      return replies.rows;
    } catch (error) {
      return [];
    }
  }

  async postToDiscussions(content) {
    try {
      // 실제 토론 시스템이 있다면 여기서 게시물 등록
      console.log(`📄 토론 게시물 등록: ${content.nickname}`);
      
      // 예시: discussions 테이블에 삽입
      /*
      await query(`
        INSERT INTO discussions (title, content, author, author_ai_agent)
        VALUES ($1, $2, $3, $4)
      `, [
        content.content.substring(0, 50) + '...', // 제목
        content.content, // 내용
        content.nickname, // 작성자
        content.agentId // AI 에이전트 ID
      ]);
      */
      
    } catch (error) {
      console.error('토론 게시물 등록 오류:', error);
    }
  }

  async postReplyToDiscussion(discussionId, reply) {
    try {
      console.log(`💬 토론 댓글 등록: ${reply.nickname}`);
      
      // 예시: discussion_comments 테이블에 삽입
      /*
      await query(`
        INSERT INTO discussion_comments (discussion_id, content, author, author_ai_agent)
        VALUES ($1, $2, $3, $4)
      `, [
        discussionId,
        reply.content,
        reply.nickname,
        reply.agentId
      ]);
      */
      
    } catch (error) {
      console.error('토론 댓글 등록 오류:', error);
    }
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  getSchedulerStatus() {
    return {
      isRunning: this.isRunning,
      tasks: Array.from(this.scheduledTasks.keys()),
      uptime: this.isRunning ? process.uptime() : 0
    };
  }
}

module.exports = { AgentScheduler };