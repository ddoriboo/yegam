import { OpenAI } from 'openai';
import { AGENT_PERSONAS } from './personas.js';
import { ContentFilter } from '../utils/contentFilter.js';
import { logger } from '../utils/logger.js';

export class Agent {
  constructor(personaId, openaiClient) {
    this.persona = AGENT_PERSONAS[personaId];
    if (!this.persona) {
      throw new Error(`Unknown persona: ${personaId}`);
    }
    
    this.openai = openaiClient;
    this.contentFilter = new ContentFilter();
    this.isActive = true;
    this.lastActivityTime = null;
    this.activityLog = [];
  }

  async generatePost(context = {}) {
    if (!this.isActive) return null;
    
    try {
      const prompt = this.buildPostPrompt(context);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: this.persona.systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 500
      });

      const content = completion.choices[0].message.content;
      
      const isSafe = await this.contentFilter.checkContent(content);
      if (!isSafe) {
        logger.warn(`Filtered unsafe content from ${this.persona.id}`);
        return null;
      }

      this.logActivity('post', content);
      return {
        agentId: this.persona.id,
        nickname: this.persona.nickname,
        content: content,
        timestamp: new Date(),
        type: 'post'
      };
    } catch (error) {
      logger.error(`Error generating post for ${this.persona.id}:`, error);
      return null;
    }
  }

  async generateReply(originalPost, existingReplies = []) {
    if (!this.isActive) return null;
    
    const shouldReply = Math.random() < this.persona.replyProbability;
    if (!shouldReply) return null;

    try {
      const prompt = this.buildReplyPrompt(originalPost, existingReplies);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: this.persona.systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const content = completion.choices[0].message.content;
      
      const isSafe = await this.contentFilter.checkContent(content);
      if (!isSafe) {
        logger.warn(`Filtered unsafe reply from ${this.persona.id}`);
        return null;
      }

      this.logActivity('reply', content);
      return {
        agentId: this.persona.id,
        nickname: this.persona.nickname,
        content: content,
        timestamp: new Date(),
        type: 'reply',
        replyTo: originalPost.id
      };
    } catch (error) {
      logger.error(`Error generating reply for ${this.persona.id}:`, error);
      return null;
    }
  }

  async generateReaction(post) {
    if (!this.isActive) return null;
    
    const reactions = ['👍', '❤️', '😂', '😮', '🤔', '👏'];
    const shouldReact = Math.random() < 0.3;
    
    if (!shouldReact) return null;

    try {
      const prompt = `다음 게시물을 읽고 적절한 반응 이모지를 하나 선택하세요: ${reactions.join(', ')}

게시물: "${post.content}"

이모지만 답하세요:`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "당신은 이모지로만 반응하는 AI입니다." },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 10
      });

      const reaction = completion.choices[0].message.content.trim();
      
      if (reactions.includes(reaction)) {
        this.logActivity('reaction', reaction);
        return {
          agentId: this.persona.id,
          nickname: this.persona.nickname,
          reaction: reaction,
          timestamp: new Date(),
          type: 'reaction',
          postId: post.id
        };
      }
    } catch (error) {
      logger.error(`Error generating reaction for ${this.persona.id}:`, error);
    }
    
    return null;
  }

  buildPostPrompt(context) {
    const interests = this.persona.interests.join(', ');
    const currentTime = new Date().toLocaleString('ko-KR');
    
    let prompt = `현재 시간: ${currentTime}
당신의 관심사: ${interests}

커뮤니티 '분석방'에 올릴 게시물을 작성하세요. 
- 당신의 전문 분야와 관련된 유용한 정보나 분석을 공유하세요
- 프로필에 🤖 AI 어시스턴트임이 표시되어 있으므로 자연스럽게 행동하세요
- 최신 트렌드나 이슈에 대한 당신만의 관점을 제시하세요`;

    if (context.recentTopics) {
      prompt += `\n\n최근 인기 주제: ${context.recentTopics.join(', ')}`;
    }

    return prompt;
  }

  buildReplyPrompt(originalPost, existingReplies) {
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
- 자연스럽고 대화하듯이 작성`;

    return prompt;
  }

  setActive(isActive) {
    this.isActive = isActive;
    logger.info(`Agent ${this.persona.id} is now ${isActive ? 'active' : 'inactive'}`);
  }

  isInActiveHours() {
    const currentHour = new Date().getHours();
    return this.persona.activeHours.includes(currentHour);
  }

  logActivity(type, content) {
    const activity = {
      timestamp: new Date(),
      type,
      content: content.substring(0, 100) + '...'
    };
    
    this.activityLog.push(activity);
    this.lastActivityTime = new Date();
    
    if (this.activityLog.length > 100) {
      this.activityLog.shift();
    }
  }

  getStats() {
    const now = new Date();
    const last24Hours = this.activityLog.filter(
      log => (now - log.timestamp) < 24 * 60 * 60 * 1000
    );

    return {
      agentId: this.persona.id,
      nickname: this.persona.nickname,
      isActive: this.isActive,
      lastActivity: this.lastActivityTime,
      stats24h: {
        posts: last24Hours.filter(log => log.type === 'post').length,
        replies: last24Hours.filter(log => log.type === 'reply').length,
        reactions: last24Hours.filter(log => log.type === 'reaction').length
      }
    };
  }
}