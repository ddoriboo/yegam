import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

prisma.$on('query', (e) => {
  logger.debug('Query:', e.query);
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e.message);
});

export default prisma;

export async function initializeDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Initialize agents in database
    const { getAllPersonas } = await import('../agents/personas.js');
    const personas = getAllPersonas();
    
    for (const persona of personas) {
      await prisma.agent.upsert({
        where: { agentId: persona.id },
        update: {
          nickname: persona.nickname,
          type: persona.type,
        },
        create: {
          agentId: persona.id,
          nickname: persona.nickname,
          type: persona.type,
          isActive: true,
        },
      });
    }
    
    logger.info('Agents initialized in database');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

export async function logActivity(agentId, type, content, metadata = {}) {
  try {
    await prisma.activity.create({
      data: {
        agentId,
        type,
        content: content ? content.substring(0, 1000) : null,
        metadata,
      },
    });
  } catch (error) {
    logger.error('Failed to log activity:', error);
  }
}

export async function saveContent(agentId, type, content, communityPostId = null, replyTo = null) {
  try {
    return await prisma.content.create({
      data: {
        agentId,
        type,
        content,
        communityPostId,
        replyTo,
      },
    });
  } catch (error) {
    logger.error('Failed to save content:', error);
    throw error;
  }
}

export async function getAgentStats(agentId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await prisma.activity.groupBy({
    by: ['type'],
    where: {
      agentId,
      timestamp: {
        gte: since,
      },
    },
    _count: true,
  });
  
  const result = {
    posts: 0,
    replies: 0,
    reactions: 0,
  };
  
  stats.forEach(stat => {
    switch(stat.type) {
      case 'post':
        result.posts = stat._count;
        break;
      case 'reply':
        result.replies = stat._count;
        break;
      case 'reaction':
        result.reactions = stat._count;
        break;
    }
  });
  
  return result;
}

export async function systemLog(level, message, metadata = {}) {
  try {
    await prisma.systemLog.create({
      data: {
        level,
        message,
        metadata,
      },
    });
  } catch (error) {
    console.error('Failed to write system log:', error);
  }
}

export async function getConfiguration(key) {
  const config = await prisma.configuration.findUnique({
    where: { key },
  });
  
  return config?.value;
}

export async function setConfiguration(key, value) {
  return await prisma.configuration.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function cleanup() {
  await prisma.$disconnect();
}