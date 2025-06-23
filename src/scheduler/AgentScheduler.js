import cron from 'node-cron';
import { logger } from '../utils/logger.js';

export class AgentScheduler {
  constructor(agentManager, communityAPI) {
    this.agentManager = agentManager;
    this.communityAPI = communityAPI;
    this.scheduledTasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Agent scheduler started');

    this.scheduleContentGeneration();
    this.scheduleReplyGeneration();
    this.scheduleReactionGeneration();
    this.scheduleHealthCheck();
  }

  stop() {
    this.isRunning = false;
    
    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped scheduled task: ${name}`);
    });
    
    this.scheduledTasks.clear();
    logger.info('Agent scheduler stopped');
  }

  scheduleContentGeneration() {
    const task = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        logger.info('Running content generation task');
        
        const recentTopics = await this.communityAPI.getRecentTopics();
        const context = { recentTopics };
        
        const contents = await this.agentManager.generateContentForActiveAgents(context);
        
        for (const content of contents) {
          await this.communityAPI.postContent(content);
          logger.info(`Posted content from ${content.nickname}`);
          
          await this.randomDelay(2000, 5000);
        }
      } catch (error) {
        logger.error('Error in content generation task:', error);
      }
    });

    this.scheduledTasks.set('contentGeneration', task);
    task.start();
  }

  scheduleReplyGeneration() {
    const task = cron.schedule('*/10 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        logger.info('Running reply generation task');
        
        const recentPosts = await this.communityAPI.getRecentPosts(20);
        
        for (const post of recentPosts) {
          if (Math.random() > 0.3) continue;
          
          const existingReplies = await this.communityAPI.getReplies(post.id);
          const replies = await this.agentManager.generateRepliesForPost(post, existingReplies);
          
          for (const reply of replies) {
            await this.communityAPI.postReply(reply);
            logger.info(`Posted reply from ${reply.nickname} to post ${post.id}`);
            
            await this.randomDelay(3000, 8000);
          }
        }
      } catch (error) {
        logger.error('Error in reply generation task:', error);
      }
    });

    this.scheduledTasks.set('replyGeneration', task);
    task.start();
  }

  scheduleReactionGeneration() {
    const task = cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        logger.info('Running reaction generation task');
        
        const recentPosts = await this.communityAPI.getRecentPosts(30);
        
        for (const post of recentPosts) {
          const reactions = await this.agentManager.generateReactionsForPost(post);
          
          for (const reaction of reactions) {
            await this.communityAPI.addReaction(reaction);
            logger.info(`Added reaction ${reaction.reaction} from ${reaction.nickname}`);
            
            await this.randomDelay(500, 2000);
          }
        }
      } catch (error) {
        logger.error('Error in reaction generation task:', error);
      }
    });

    this.scheduledTasks.set('reactionGeneration', task);
    task.start();
  }

  scheduleHealthCheck() {
    const task = cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        logger.info('Running health check');
        
        const stats = this.agentManager.getAgentStats();
        const activeCount = stats.filter(s => s.isActive).length;
        
        logger.info(`Health check - Active agents: ${activeCount}/${stats.length}`);
        
        stats.forEach(stat => {
          logger.info(`${stat.nickname}: Posts=${stat.stats24h.posts}, Replies=${stat.stats24h.replies}, Reactions=${stat.stats24h.reactions}`);
        });
        
        const apiValid = await this.agentManager.validateApiKey();
        if (!apiValid) {
          logger.error('OpenAI API key validation failed');
          this.stop();
        }
      } catch (error) {
        logger.error('Error in health check:', error);
      }
    });

    this.scheduledTasks.set('healthCheck', task);
    task.start();
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