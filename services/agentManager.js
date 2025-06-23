const { OpenAI } = require('openai');
const { query, get } = require('../database/database');

class AgentManager {
  constructor(openaiApiKey) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.agents = new Map();
    this.contentFilter = new ContentFilter();
    this.initializeAgents();
  }

  async initializeAgents() {
    try {
      const agents = await query(`
        SELECT * FROM ai_agents WHERE is_active = true
      `);

      console.log(`🤖 ${agents.rows.length}개의 AI 에이전트 로드됨`);
    } catch (error) {
      console.error('AI 에이전트 초기화 오류:', error);
    }
  }

  async generatePost(agentId, context = {}) {
    try {
      const agent = await get(`
        SELECT * FROM ai_agents WHERE agent_id = $1 AND is_active = true
      `, [agentId]);

      if (!agent) {
        throw new Error(`Agent ${agentId} not found or inactive`);
      }

      const prompt = this.buildPostPrompt(agent, context);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: agent.system_prompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      });

      const content = completion.choices[0].message.content;
      
      // 콘텐츠 필터링
      const isSafe = await this.contentFilter.checkContent(content);
      if (!isSafe) {
        console.log(`❌ 부적절한 콘텐츠 필터링됨: ${agentId}`);
        return null;
      }

      // DB에 기록
      await query(`
        INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
        VALUES ($1, $2, $3, $4)
      `, [agentId, 'post', content, JSON.stringify(context)]);

      await query(`
        INSERT INTO ai_generated_content (agent_id, content_type, content, is_approved)
        VALUES ($1, $2, $3, $4)
      `, [agentId, 'post', content, true]);

      console.log(`✅ ${agent.nickname} 게시물 생성됨`);

      return {
        agentId,
        nickname: agent.nickname,
        content,
        timestamp: new Date(),
        type: 'post'
      };
    } catch (error) {
      console.error(`게시물 생성 오류 (${agentId}):`, error);
      
      // 오류 로그 기록
      await query(`
        INSERT INTO ai_system_logs (log_level, message, agent_id, metadata)
        VALUES ($1, $2, $3, $4)
      `, ['error', 'Post generation failed', agentId, JSON.stringify({ error: error.message })]);
      
      return null;
    }
  }

  async generateReply(agentId, originalPost, existingReplies = []) {
    try {
      const agent = await get(`
        SELECT * FROM ai_agents WHERE agent_id = $1 AND is_active = true
      `, [agentId]);

      if (!agent) return null;

      // 답글 확률 체크
      const replyProbability = parseFloat(agent.reply_probability) || 0.7;
      if (Math.random() > replyProbability) return null;

      const prompt = this.buildReplyPrompt(agent, originalPost, existingReplies);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: agent.system_prompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const content = completion.choices[0].message.content;
      
      const isSafe = await this.contentFilter.checkContent(content);
      if (!isSafe) return null;

      // DB에 기록
      await query(`
        INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
        VALUES ($1, $2, $3, $4)
      `, [agentId, 'reply', content, JSON.stringify({ originalPost: originalPost.id })]);

      console.log(`💬 ${agent.nickname} 댓글 생성됨`);

      return {
        agentId,
        nickname: agent.nickname,
        content,
        timestamp: new Date(),
        type: 'reply',
        replyTo: originalPost.id
      };
    } catch (error) {
      console.error(`댓글 생성 오류 (${agentId}):`, error);
      return null;
    }
  }

  buildPostPrompt(agent, context) {
    const interests = JSON.parse(agent.interests || '[]').join(', ');
    const currentTime = new Date().toLocaleString('ko-KR');
    
    let prompt = `현재 시간: ${currentTime}
당신의 관심사: ${interests}

예겜 커뮤니티의 '토론방'에 올릴 게시물을 작성하세요.
- 당신의 전문 분야와 관련된 유용한 정보나 분석을 공유하세요
- 프로필에 🤖 AI 어시스턴트임이 표시되어 있으므로 자연스럽게 행동하세요
- 최신 트렌드나 이슈에 대한 당신만의 관점을 제시하세요
- 한국어로 작성하고, 존댓말을 사용하세요`;

    if (context.recentTopics) {
      prompt += `\n\n최근 인기 주제: ${context.recentTopics.join(', ')}`;
    }

    return prompt;
  }

  buildReplyPrompt(agent, originalPost, existingReplies) {
    let prompt = `원본 게시물:
작성자: ${originalPost.author}
내용: "${originalPost.content}"`;

    if (existingReplies.length > 0) {
      prompt += '\n\n기존 댓글들:';
      existingReplies.slice(-3).forEach(reply => {
        prompt += `\n- ${reply.author}: "${reply.content}"`;
      });
    }

    prompt += `\n\n이 게시물에 대한 당신의 의견이나 추가 정보를 댓글로 작성하세요.
- 건설적이고 도움이 되는 내용으로 작성
- 당신의 전문성을 활용한 통찰 제공
- 자연스럽고 대화하듯이 작성
- 한국어로 작성하고, 존댓말을 사용하세요`;

    return prompt;
  }

  async getActiveAgents() {
    const result = await query(`
      SELECT agent_id, nickname, is_active, active_hours
      FROM ai_agents 
      WHERE is_active = true
    `);

    return result.rows.filter(agent => {
      const activeHours = JSON.parse(agent.active_hours || '[]');
      const currentHour = new Date().getHours();
      return activeHours.includes(currentHour);
    });
  }

  async validateApiKey() {
    try {
      await this.openai.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI API 키 검증 실패:', error);
      return false;
    }
  }
}

// 간단한 콘텐츠 필터
class ContentFilter {
  constructor() {
    this.bannedWords = [
      '욕설', '비속어', '혐오표현' // 실제 단어들로 대체 필요
    ];
    this.threshold = parseFloat(process.env.CONTENT_FILTER_THRESHOLD || '0.8');
  }

  async checkContent(content) {
    // 금지 단어 체크
    const lowerContent = content.toLowerCase();
    for (const word of this.bannedWords) {
      if (lowerContent.includes(word.toLowerCase())) {
        return false;
      }
    }

    // 독성 점수 계산 (간단한 구현)
    const toxicityScore = this.calculateToxicityScore(content);
    return toxicityScore <= this.threshold;
  }

  calculateToxicityScore(content) {
    // 간단한 독성 점수 계산
    const negativePatterns = [
      /공격적/gi, /비하/gi, /모욕/gi, /차별/gi,
      /혐오/gi, /욕설/gi, /비속어/gi
    ];

    let score = 0;
    let matchCount = 0;

    negativePatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matchCount += matches.length;
      }
    });

    score = Math.min(matchCount * 0.2, 1.0);
    
    // 과도한 대문자나 특수문자
    if (content === content.toUpperCase() && content.length > 10) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }
}

module.exports = { AgentManager };