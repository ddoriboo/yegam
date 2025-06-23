import { logger } from './logger.js';

export class ContentFilter {
  constructor() {
    this.bannedWords = [
      '욕설1', '욕설2', '비속어1', '비속어2',
      '혐오표현1', '혐오표현2'
    ];
    
    this.sensitiveTopics = [
      '정치적극단주의', '폭력', '성적콘텐츠', '차별표현'
    ];
    
    this.threshold = parseFloat(process.env.CONTENT_FILTER_THRESHOLD || '0.8');
  }

  async checkContent(content) {
    if (!process.env.ENABLE_CONTENT_FILTER === 'true') {
      return true;
    }

    const lowerContent = content.toLowerCase();
    
    for (const word of this.bannedWords) {
      if (lowerContent.includes(word.toLowerCase())) {
        logger.warn(`Banned word detected: ${word}`);
        return false;
      }
    }
    
    const toxicityScore = await this.calculateToxicityScore(content);
    if (toxicityScore > this.threshold) {
      logger.warn(`High toxicity score detected: ${toxicityScore}`);
      return false;
    }

    return true;
  }

  async calculateToxicityScore(content) {
    const negativeIndicators = [
      /공격적/gi, /비하/gi, /모욕/gi, /차별/gi,
      /혐오/gi, /욕설/gi, /비속어/gi
    ];

    let score = 0;
    let matchCount = 0;

    negativeIndicators.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matchCount += matches.length;
      }
    });

    score = Math.min(matchCount * 0.2, 1.0);
    
    if (content.includes('!') || content.includes('?')) {
      const exclamationCount = (content.match(/[!?]/g) || []).length;
      score += exclamationCount * 0.05;
    }
    
    if (content === content.toUpperCase() && content.length > 10) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  addBannedWord(word) {
    if (!this.bannedWords.includes(word)) {
      this.bannedWords.push(word);
      logger.info(`Added banned word: ${word}`);
    }
  }

  removeBannedWord(word) {
    const index = this.bannedWords.indexOf(word);
    if (index > -1) {
      this.bannedWords.splice(index, 1);
      logger.info(`Removed banned word: ${word}`);
    }
  }

  getBannedWords() {
    return [...this.bannedWords];
  }

  setThreshold(threshold) {
    if (threshold >= 0 && threshold <= 1) {
      this.threshold = threshold;
      logger.info(`Content filter threshold set to: ${threshold}`);
    }
  }
}