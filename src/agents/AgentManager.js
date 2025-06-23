import { OpenAI } from 'openai';
import { Agent } from './Agent.js';
import { getAllPersonas } from './personas.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export class AgentManager extends EventEmitter {
  constructor(openaiApiKey) {
    super();
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.agents = new Map();
    this.initializeAgents();
  }

  initializeAgents() {
    const personas = getAllPersonas();
    
    personas.forEach(persona => {
      const agent = new Agent(persona.id, this.openai);
      this.agents.set(persona.id, agent);
      logger.info(`Initialized agent: ${persona.nickname}`);
    });
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getActiveAgents() {
    return this.getAllAgents().filter(agent => agent.isActive);
  }

  setAgentActive(agentId, isActive) {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.setActive(isActive);
      this.emit('agentStatusChanged', { agentId, isActive });
      return true;
    }
    return false;
  }

  async generateContentForActiveAgents(context = {}) {
    const activeAgents = this.getActiveAgents();
    const inActiveHours = activeAgents.filter(agent => agent.isInActiveHours());
    
    const contentPromises = inActiveHours.map(async (agent) => {
      const shouldPost = Math.random() < (1 / (24 / agent.persona.postFrequency));
      
      if (shouldPost) {
        try {
          const post = await agent.generatePost(context);
          if (post) {
            this.emit('contentGenerated', post);
            return post;
          }
        } catch (error) {
          logger.error(`Error generating content for ${agent.persona.id}:`, error);
        }
      }
      return null;
    });

    const results = await Promise.all(contentPromises);
    return results.filter(content => content !== null);
  }

  async generateRepliesForPost(post, existingReplies = []) {
    const activeAgents = this.getActiveAgents();
    const eligibleAgents = activeAgents.filter(agent => 
      agent.isInActiveHours() && agent.persona.id !== post.agentId
    );

    const replyPromises = eligibleAgents.map(async (agent) => {
      try {
        const reply = await agent.generateReply(post, existingReplies);
        if (reply) {
          this.emit('replyGenerated', reply);
          return reply;
        }
      } catch (error) {
        logger.error(`Error generating reply for ${agent.persona.id}:`, error);
      }
      return null;
    });

    const results = await Promise.all(replyPromises);
    return results.filter(reply => reply !== null);
  }

  async generateReactionsForPost(post) {
    const activeAgents = this.getActiveAgents();
    const eligibleAgents = activeAgents.filter(agent => 
      agent.isInActiveHours() && agent.persona.id !== post.agentId
    );

    const reactionPromises = eligibleAgents.map(async (agent) => {
      try {
        const reaction = await agent.generateReaction(post);
        if (reaction) {
          this.emit('reactionGenerated', reaction);
          return reaction;
        }
      } catch (error) {
        logger.error(`Error generating reaction for ${agent.persona.id}:`, error);
      }
      return null;
    });

    const results = await Promise.all(reactionPromises);
    return results.filter(reaction => reaction !== null);
  }

  getAgentStats() {
    return this.getAllAgents().map(agent => agent.getStats());
  }

  emergencyStop() {
    logger.warn('Emergency stop activated - disabling all agents');
    this.getAllAgents().forEach(agent => {
      agent.setActive(false);
    });
    this.emit('emergencyStop');
  }

  async validateApiKey() {
    try {
      await this.openai.models.list();
      return true;
    } catch (error) {
      logger.error('Invalid OpenAI API key:', error);
      return false;
    }
  }
}