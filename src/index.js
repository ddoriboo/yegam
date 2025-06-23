import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

import { AgentManager } from './agents/AgentManager.js';
import { AgentScheduler } from './scheduler/AgentScheduler.js';
import { MockCommunityAPI } from './api/communityAPI.js';
import { ContentFilter } from './utils/contentFilter.js';
import { logger } from './utils/logger.js';
import { createAgentRouter, createSystemRouter } from './api/agentController.js';
import { initializeDatabase, systemLog, cleanup } from './database/prismaClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
});

app.use('/api', limiter);

// Authentication middleware
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Initialize components
let agentManager;
let scheduler;
let contentFilter;
let wss;

async function initialize() {
  try {
    logger.info('Starting AI Community Agents System...');
    
    // Initialize database
    await initializeDatabase();
    await systemLog('info', 'System starting up');
    
    // Create instances
    agentManager = new AgentManager(process.env.OPENAI_API_KEY);
    contentFilter = new ContentFilter();
    
    // Use mock API for testing, replace with real API
    const communityAPI = new MockCommunityAPI();
    
    scheduler = new AgentScheduler(agentManager, communityAPI);
    
    // Setup WebSocket for real-time updates
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
    
    wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');
      
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });
    
    // Forward agent events to WebSocket clients
    agentManager.on('contentGenerated', (content) => {
      broadcastToClients({ type: 'contentGenerated', payload: content });
    });
    
    agentManager.on('replyGenerated', (reply) => {
      broadcastToClients({ type: 'replyGenerated', payload: reply });
    });
    
    agentManager.on('reactionGenerated', (reaction) => {
      broadcastToClients({ type: 'reactionGenerated', payload: reaction });
    });
    
    agentManager.on('agentStatusChanged', (status) => {
      broadcastToClients({ type: 'agentStatusChanged', payload: status });
    });
    
    // Routes
    app.use('/api', authenticateAdmin, createAgentRouter(agentManager));
    app.use('/api', authenticateAdmin, createSystemRouter(agentManager, scheduler, contentFilter));
    
    // Serve admin dashboard
    app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
    });
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date(),
        uptime: process.uptime()
      });
    });
    
    // Start scheduler
    scheduler.start();
    
    logger.info('AI Community Agents System initialized successfully');
    await systemLog('info', 'System initialized successfully');
    
  } catch (error) {
    logger.error('Failed to initialize system:', error);
    await systemLog('error', 'Failed to initialize system', { error: error.message });
    process.exit(1);
  }
}

function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  if (scheduler) {
    scheduler.stop();
  }
  
  if (agentManager) {
    agentManager.emergencyStop();
  }
  
  await systemLog('info', 'System shutting down');
  await cleanup();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  if (scheduler) {
    scheduler.stop();
  }
  
  if (agentManager) {
    agentManager.emergencyStop();
  }
  
  await systemLog('info', 'System shutting down');
  await cleanup();
  
  process.exit(0);
});

// Start the system
initialize().catch((error) => {
  logger.error('Unhandled error during initialization:', error);
  process.exit(1);
});