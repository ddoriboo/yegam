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
      
      // 모델 fallback 시스템
      const preferredModel = "gpt-4o-mini-search-preview-2025-03-11";
      const fallbackModel = "gpt-4o-mini";
      
      let completion;
      let modelUsed;
      
      try {
        // search-preview 모델은 model과 messages만 지원
        const requestParams = {
          model: preferredModel,
          messages: [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: prompt }
          ]
        };
        
        // search-preview 모델이 아닌 경우에만 추가 파라미터 사용
        if (!preferredModel.includes('search-preview')) {
          requestParams.temperature = 0.8;
          requestParams.max_tokens = 2000;
        }
        
        completion = await this.openai.chat.completions.create(requestParams);
        modelUsed = preferredModel;
        console.log(`✅ ${agent.nickname} - ${preferredModel} 모델 사용 성공`);
        
      } catch (modelError) {
        console.warn(`⚠️ ${preferredModel} 모델 사용 실패: ${modelError.message}`);
        console.log(`🔄 ${fallbackModel} 모델로 재시도...`);
        
        // fallback 모델로 재시도
        completion = await this.openai.chat.completions.create({
          model: fallbackModel,
          messages: [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 2000
        });
        modelUsed = fallbackModel;
        console.log(`✅ ${agent.nickname} - ${fallbackModel} 모델 사용 (fallback)`);
      }

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

      console.log(`✅ ${agent.nickname} 게시물 생성됨 (${modelUsed}, ${completion.usage?.completion_tokens || '?'} 토큰)`);

      return {
        agentId,
        nickname: agent.nickname,
        content,
        timestamp: new Date(),
        type: 'post',
        finishReason,
        tokensUsed: completion.usage?.total_tokens,
        modelUsed,
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
      
      // 모델 fallback 시스템 (댓글용)
      const preferredModel = "gpt-4o-mini-search-preview-2025-03-11";
      const fallbackModel = "gpt-4o-mini";
      
      let completion;
      
      try {
        // search-preview 모델은 model과 messages만 지원
        const requestParams = {
          model: preferredModel,
          messages: [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: prompt }
          ]
        };
        
        // search-preview 모델이 아닌 경우에만 추가 파라미터 사용
        if (!preferredModel.includes('search-preview')) {
          requestParams.temperature = 0.7;
          requestParams.max_tokens = 800;
        }
        
        completion = await this.openai.chat.completions.create(requestParams);
      } catch (modelError) {
        console.warn(`⚠️ ${preferredModel} 모델 사용 실패 (댓글): ${modelError.message}`);
        completion = await this.openai.chat.completions.create({
          model: fallbackModel,
          messages: [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 800
        });
      }

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

YEGAM 베팅 커뮤니티 '분석방'에 올릴 논쟁적인 게시물을 작성하세요.

🎯 핵심 미션: 50:50으로 나뉠 수 있는 베팅 주제 만들기!

필수 작성 규칙:
- 디시 커뮤니티 스타일로 반말/존댓말 섞어서 자유롭게
- ㅋㅋㅋ, ㅎㅎ, ^^;, ㅇㅇ, ㅇㅈ? 같은 표현 적극 활용
- 바로 논쟁거리부터 시작 (인사말/자기소개 금지)
- 최신 밈과 유행어 자연스럽게 섞기

베팅 주제 가이드:
- "A vs B 뭐가 이길까?" 형태의 대립 구조 만들기
- 시의적절하고 화제성 있는 주제 선택
- 사람들이 의견 나뉠 수밖에 없는 논쟁적 소재
- 예측 가능한 미래 이벤트나 비교 대상 제시
- 댓글로 토론 유발할 수 있는 떡밥 던지기

글 마지막에만 🤖[닉네임]으로 서명`;

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
