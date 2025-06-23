import { logger } from '../utils/logger.js';

export class CommunityAPI {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
  }

  async postContent(content) {
    try {
      // 실제 커뮤니티 API에 맞게 수정 필요
      const response = await fetch(`${this.baseURL}/posts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          author: content.nickname,
          content: content.content,
          metadata: {
            agentId: content.agentId,
            isAI: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      logger.info(`Posted content to community: ${result.id}`);
      return result;
    } catch (error) {
      logger.error('Error posting content:', error);
      throw error;
    }
  }

  async postReply(reply) {
    try {
      const response = await fetch(`${this.baseURL}/posts/${reply.replyTo}/comments`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          author: reply.nickname,
          content: reply.content,
          metadata: {
            agentId: reply.agentId,
            isAI: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      logger.info(`Posted reply to post ${reply.replyTo}: ${result.id}`);
      return result;
    } catch (error) {
      logger.error('Error posting reply:', error);
      throw error;
    }
  }

  async addReaction(reaction) {
    try {
      const response = await fetch(`${this.baseURL}/posts/${reaction.postId}/reactions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          user: reaction.nickname,
          reaction: reaction.reaction,
          metadata: {
            agentId: reaction.agentId,
            isAI: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      logger.info(`Added reaction ${reaction.reaction} to post ${reaction.postId}`);
      return true;
    } catch (error) {
      logger.error('Error adding reaction:', error);
      throw error;
    }
  }

  async getRecentPosts(limit = 10) {
    try {
      const response = await fetch(`${this.baseURL}/posts?limit=${limit}&sort=recent`, {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const posts = await response.json();
      return posts;
    } catch (error) {
      logger.error('Error fetching recent posts:', error);
      return [];
    }
  }

  async getReplies(postId) {
    try {
      const response = await fetch(`${this.baseURL}/posts/${postId}/comments`, {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const replies = await response.json();
      return replies;
    } catch (error) {
      logger.error('Error fetching replies:', error);
      return [];
    }
  }

  async getRecentTopics() {
    try {
      const response = await fetch(`${this.baseURL}/trending/topics`, {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const topics = await response.json();
      return topics.map(t => t.name);
    } catch (error) {
      logger.error('Error fetching recent topics:', error);
      return [];
    }
  }
}

// Mock implementation for testing
export class MockCommunityAPI extends CommunityAPI {
  constructor() {
    super('mock://api', 'mock-key');
    this.posts = [];
    this.comments = new Map();
    this.reactions = new Map();
  }

  async postContent(content) {
    const post = {
      id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...content,
      timestamp: new Date(),
      reactions: [],
      comments: []
    };
    
    this.posts.unshift(post);
    logger.info(`[MOCK] Posted content: ${post.id}`);
    return post;
  }

  async postReply(reply) {
    const comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...reply,
      timestamp: new Date()
    };
    
    if (!this.comments.has(reply.replyTo)) {
      this.comments.set(reply.replyTo, []);
    }
    
    this.comments.get(reply.replyTo).push(comment);
    logger.info(`[MOCK] Posted reply to ${reply.replyTo}: ${comment.id}`);
    return comment;
  }

  async addReaction(reaction) {
    if (!this.reactions.has(reaction.postId)) {
      this.reactions.set(reaction.postId, []);
    }
    
    this.reactions.get(reaction.postId).push(reaction);
    logger.info(`[MOCK] Added reaction ${reaction.reaction} to post ${reaction.postId}`);
    return true;
  }

  async getRecentPosts(limit = 10) {
    return this.posts.slice(0, limit);
  }

  async getReplies(postId) {
    return this.comments.get(postId) || [];
  }

  async getRecentTopics() {
    const topics = [
      'AI 기술', '경제 동향', '주식 시장', 'K-pop', 
      '게임 뉴스', '건강 정보', '스타트업', '트렌드'
    ];
    
    return topics.sort(() => Math.random() - 0.5).slice(0, 5);
  }
}