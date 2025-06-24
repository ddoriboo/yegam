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
        model: "gpt-4o-mini-search-preview-2025-03-11",
        messages: [
          { role: "system", content: agent.system_prompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2000 // 500 → 2000으로 증가 (한국어 장문 대응)
      });

      const content = completion.choices[0].message.content;
      const finishReason = completion.choices[0].finish_reason;
      
      // 토큰 제한으로 끊겼는지 로깅
      if (finishReason === 'length') {
        console.warn(`⚠️ ${agent.nickname} 콘텐츠가 토큰 제한으로 잘렸습니다`);
      } else if (finishReason === 'stop') {
        console.log(`✅ ${agent.nickname} 콘텐츠 생성 완료`);
      }
      
      // 콘텐츠 필터링
      const isSafe = await this.contentFilter.checkContent(content);
      if (!isSafe) {
        console.log(`❌ 부적절한 콘텐츠 필터링됨: ${agentId}`);
        return null;
      }

      // DB에 기록 (토큰 정보 포함)
      await query(`
        INSERT INTO ai_agent_activities (agent_id, activity_type, content, metadata)
        VALUES ($1, $2, $3, $4)
      `, [agentId, 'post', content, JSON.stringify({ 
        ...context, 
        finishReason,
        tokensUsed: completion.usage ? completion.usage.total_tokens : null,
        completionTokens: completion.usage ? completion.usage.completion_tokens : null
      })]);

      await query(`
        INSERT INTO ai_generated_content (agent_id, content_type, content, is_approved)
        VALUES ($1, $2, $3, $4)
      `, [agentId, 'post', content, true]);

      console.log(`✅ ${agent.nickname} 게시물 생성됨 (${completion.usage?.completion_tokens || '?'} 토큰)`);

      return {
        agentId,
        nickname: agent.nickname,
        content,
        timestamp: new Date(),
        type: 'post',
        finishReason,
        tokensUsed: completion.usage?.total_tokens,
        isFiltered: false
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
        max_tokens: 800 // 300 → 800으로 증가 (댓글도 충분한 길이)
      });

      const content = completion.choices[0].message.content;
      const finishReason = completion.choices[0].finish_reason;
      
      // 토큰 제한으로 끊겼는지 로깅 (댓글)
      if (finishReason === 'length') {
        console.warn(`⚠️ ${agent.nickname} 댓글이 토큰 제한으로 잘렸습니다`);
      }
      
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
    let interests = [];
    try {
      interests = typeof agent.interests === 'string' 
        ? JSON.parse(agent.interests) 
        : (Array.isArray(agent.interests) ? agent.interests : []);
    } catch (e) {
      interests = [];
    }
    const interestsText = interests.join(', ');
    const currentTime = new Date().toLocaleString('ko-KR');
    
    let prompt = `현재 시간: ${currentTime}
당신의 관심사: ${interestsText}

예겜 커뮤니티의 '분석방'에 올릴 게시물을 작성하세요.

중요한 작성 규칙:
- 자기소개 절대 금지 (AI라는 것, 이름, 전문분야 등을 언급하지 마세요)
- 바로 본론부터 시작하세요
- 첫 줄에 핵심 주제나 결론을 명확히 제시하세요
- 인사말이나 서두 없이 바로 분석/정보를 제공하세요

내용 작성 가이드:
- 당신의 전문 분야와 관련된 유용한 정보나 분석을 공유하세요
- 최신 트렌드나 이슈에 대한 당신만의 관점을 제시하세요
- 뻔한 주제보다는 그날, 그시점에 화제가 되는 주제에 대해서 논하세요
- 한국어로 작성하고, 존댓말을 사용하세요
- 글 마지막에만 간단히 "🤖 AI 어시스턴트 [닉네임]"으로 서명하세요`;

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

중요한 작성 규칙:
- 자기소개 절대 금지 (이름, AI라는 것, 전문분야 언급 금지)
- 바로 의견이나 분석으로 시작하세요
- "안녕하세요", "저는" 등의 인사말 금지

내용 작성 가이드:
- 건설적이고 도움이 되는 내용으로 작성
- 당신의 전문성을 활용한 통찰 제공
- 자연스럽고 대화하듯이 작성
- 한국어로 작성하고, 존댓말을 사용하세요
- 필요시 마지막에만 "🤖 AI 어시스턴트"로 간단히 표시`;

    return prompt;
  }

  async getActiveAgents() {
    const result = await query(`
      SELECT agent_id, nickname, is_active, active_hours
      FROM ai_agents 
      WHERE is_active = true
    `);

    return result.rows.filter(agent => {
      let activeHours = [];
      try {
        activeHours = typeof agent.active_hours === 'string' 
          ? JSON.parse(agent.active_hours) 
          : (Array.isArray(agent.active_hours) ? agent.active_hours : []);
      } catch (e) {
        // JSON 파싱 실패 시 모든 시간 활성화
        activeHours = Array.from({length: 24}, (_, i) => i);
      }
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
