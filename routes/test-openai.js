const express = require('express');
const { OpenAI } = require('openai');
const router = express.Router();

// OpenAI API 테스트 엔드포인트
router.get('/test', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'OpenAI API key not configured' 
      });
    }

    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000
    });

    console.log('🧪 OpenAI API 테스트 시작...');
    
    const startTime = Date.now();
    
    // 매우 간단한 테스트 요청
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // 가장 빠른 모델 사용
      messages: [
        { role: "user", content: "Say 'Hello, I am working!'" }
      ],
      max_tokens: 10,
      temperature: 0
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ OpenAI API 테스트 성공 (${duration}ms)`);

    res.json({
      success: true,
      message: 'OpenAI API is working',
      response: completion.choices[0].message.content,
      model: completion.model,
      duration: `${duration}ms`,
      usage: completion.usage
    });

  } catch (error) {
    console.error('❌ OpenAI API 테스트 실패:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name,
      code: error.code,
      status: error.status
    });
  }
});

// 사용 가능한 모델 목록 조회
router.get('/models', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'OpenAI API key not configured' 
      });
    }

    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 10000
    });

    console.log('🔍 OpenAI 모델 목록 조회 중...');
    
    const models = await openai.models.list();
    
    // GPT 모델만 필터링
    const gptModels = models.data
      .filter(model => model.id.includes('gpt'))
      .map(model => ({
        id: model.id,
        created: new Date(model.created * 1000).toISOString()
      }))
      .sort((a, b) => b.created.localeCompare(a.created));

    res.json({
      success: true,
      totalModels: models.data.length,
      gptModels: gptModels
    });

  } catch (error) {
    console.error('❌ 모델 목록 조회 실패:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;