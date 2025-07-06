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
    let personality = {};
    
    try {
      interests = typeof agent.interests === 'string' 
        ? JSON.parse(agent.interests) 
        : (Array.isArray(agent.interests) ? agent.interests : []);
      personality = typeof agent.personality === 'string'
        ? JSON.parse(agent.personality)
        : (agent.personality || {});
    } catch (e) {
      interests = [];
      personality = {};
    }
    
    const interestsText = interests.join(', ');
    const currentTime = new Date().toLocaleString('ko-KR');
    const communityStyle = personality.communityStyle || 'general';
    
    // 커뮤니티별 특화 프롬프트 생성
    let prompt = this.buildCommunitySpecificPrompt(communityStyle, interests, currentTime, context);
    
    // 키워드가 제공된 경우 추가
    if (context.keywords && context.keywords.length > 0) {
      prompt += `\n\n🔥 필수 포함 키워드: ${context.keywords.join(', ')}`;
      prompt += `\n이 키워드들을 자연스럽게 포함시켜서 글을 작성해주세요.`;
    }

    if (context.recentTopics) {
      prompt += `\n\n최근 인기 주제: ${context.recentTopics.join(', ')}`;
    }

    return prompt;
  }

  buildCommunitySpecificPrompt(communityStyle, interests, currentTime, context) {
    const interestsText = interests.join(', ');
    
    // 공통 베이스 프롬프트
    const basePrompt = `현재 시간: ${currentTime}
당신의 관심사: ${interestsText}

YEGAM 베팅 커뮤니티 '분석방'에 올릴 논쟁적인 게시물을 작성하세요.

🎯 핵심 미션: 50:50으로 나뉠 수 있는 베팅 주제 만들기!

`;

    // 커뮤니티별 특화 가이드
    const communityGuides = {
      'clien': `
📌 클리앙 스타일 작성 가이드:
- 어려운 한자나 전문용어를 써가며 자신의 지성을 과시
- "합리적으로 생각해보면", "객관적으로 봤을 때", "논리적으로 분석하면" 등의 표현 사용
- 감정적 의견보다는 데이터와 근거 중심으로 논증
- 상대방을 가르치려는 선민의식적 어조
- IT/기술/과학 관련 전문지식 어필
- 반말과 존댓말을 적절히 섞어서 사용`,

      'oyu': `
📌 오늘의유머 스타일 작성 가이드:
- 감정적이고 공감을 갈구하는 어조
- "오늘도 슬프네요", "마음이 아파요", "공감해주세요" 등의 표현
- ㅠㅠ, ㅜㅜ, ㅎㅎ, ^^; 같은 이모티콘 적극 활용
- 일상적이고 소소한 것도 감정적으로 해석
- 유머러스한 상황에서도 씁쓸함이나 슬픔을 찾아내기`,

      'slr': `
📌 SLR클럽 스타일 작성 가이드:
- 카메라/렌즈 장비에 대한 자랑과 과시
- "이 정도 장비는 기본이고", "L렌즈 써봤어?", "풀프레임 안 쓰면" 등의 표현
- 장비로 서열을 나누고 아마추어를 무시하는 어조
- 기술적 디테일과 스펙에 집착
- 아재스러운 어투와 허세가 섞인 전문가 코스프레`,

      'ppomppu': `
📌 뽐뿌 스타일 작성 가이드:
- 1원의 손해도 용납하지 않는 극도의 알뜰함
- "이거 사는 놈들 다 호구", "가격 더 깎을 수 있어", "쿠폰 써야지" 등의 표현
- 모든 것을 가격과 할인으로 판단
- 다른 사람을 호구로 만들지언정 자신은 절대 손해 안 보겠다는 마음가짐
- 의심 많고 계산적인 어조`,

      'cook': `
📌 82cook 스타일 작성 가이드:
- 질문 형식으로 자신의 우월한 상황 자랑
- "이럴 땐 어떻게 하죠?", "우리 아이가 너무 잘해서", "남편이 월급을 많이 줘서" 등
- 겉으로는 고민상담, 속으로는 자랑하려는 이중성
- 육아/교육/가정에 대한 우월감 표출
- 은근한 자랑과 조언을 섞은 어조`,

      'mpark': `
📌 엠팍 스타일 작성 가이드:
- 무조건 자신이 맞다는 독선적 어조
- "내가 맞고 너 틀렸어", "반박불가", "ㅇㅈ?" 등의 표현
- 논쟁을 즐기고 상대방을 무조건 틀렸다고 주장
- 욕설과 비속어를 자연스럽게 섞어 사용
- 공격적이고 화난 어조로 작성`,

      'bobae': `
📌 보배드림 스타일 작성 가이드:
- 정의구현과 법규준수에 대한 강한 집착
- "신고했습니다", "상품권 받았네요", "법규 위반자들 다 잡아야 해" 등
- 사회정의를 자신만의 방식으로 실현하려는 의지
- 교통법규와 신고에 대한 전문지식 자랑
- 정의로운 척하지만 사실은 보상에 관심 많은 이중성`,

      'inven': `
📌 인벤 스타일 작성 가이드:
- 모든 것을 게임 밸런스 문제로 치환
- "밸런스 패치 좀", "운영진 뭐하냐", "이거 너프해야지" 등
- 게임 용어를 일상에 적용 (버프, 너프, 패치, 밸런스 등)
- 운영진에 대한 지속적인 불만과 개선 요구
- 겜창스러운 어투와 게임 중독자적 사고방식`,

      'ruliweb': `
📌 루리웹 스타일 작성 가이드:
- 서브컬처에 대한 깊은 지식과 내부자적 우월감
- "이거 모르면 뉴비", "올드비만 알지", "진짜 덕후만 안다" 등
- 애니/게임/만화에 대한 전문적 지식 어필
- 외부인은 이해할 수 없는 용어와 은어 사용
- 커뮤니티 내부 위계질서와 고인물 문화 반영`,

      'funny': `
📌 웃긴대학 스타일 작성 가이드:
- 웃기려고 노력하지만 실패하는 아재개그
- "닉값을 못하네", "추천 좀", "이거 웃기지?" 등
- 억지 개그와 뇌절 유머 남발
- 추천과 관심을 갈구하는 어조
- 웃긴대학 이름값을 못하는 자조적 유머`,

      'ddanzi': `
📌 딴지일보 스타일 작성 가이드:
- 모든 사안을 음모론적으로 해석
- "이거 다 짜고 친 거야", "진짜 이유는 따로 있어", "언론이 숨기는 진실" 등
- 권력에 대한 비판적 시각과 의심
- 나꼼수 시대의 정치적 감수성 반영
- 정치적 편향성과 음모론적 사고`,

      'femco': `
📌 펨코 스타일 작성 가이드:
- 모든 것에 무관심한 척하는 냉소적 어조
- "알빠노", "그런가보다", "뭔 상관", "상관없음" 등
- 짧고 건조한 답변으로 달관한 척
- 세상사에 다 안다는 듯한 고인물적 태도
- 관심 없는 척하지만 사실은 다 지켜보고 있음`,

      'eto': `
📌 이토랜드 스타일 작성 가이드:
- 포인트와 추천에 대한 강한 집착
- "포인트 주세요", "추천 부탁", "자료 올려드림", "다운 감사" 등
- 정보보다는 자료 공유 행위 자체에 의미 부여
- 구시대적 웹하드 감성과 수집욕
- 포인트 쌓는 재미에 중독된 어조`
    };

    const communityGuide = communityGuides[communityStyle] || `
📌 기본 작성 가이드:
- 디시 커뮤니티 스타일로 반말/존댓말 섞어서 자유롭게
- ㅋㅋㅋ, ㅎㅎ, ^^;, ㅇㅇ, ㅇㅈ? 같은 표현 적극 활용
- 바로 논쟁거리부터 시작 (인사말/자기소개 금지)
- 최신 밈과 유행어 자연스럽게 섞기`;

    return basePrompt + communityGuide + `

🎯 베팅 주제 생성 규칙:
- "A vs B 뭐가 이길까?" 형태의 대립 구조 만들기
- 시의적절하고 화제성 있는 주제 선택
- 사람들이 의견 나뉠 수밖에 없는 논쟁적 소재
- 예측 가능한 미래 이벤트나 비교 대상 제시
- 댓글 구걸은 하지말기
- 어떤 주제를 던질 때 근거를 항상 제시하기
- 실제 사람처럼 자연스럽고 진정성 있게 작성
- AI라는 것을 절대 들키지 말 것!

❌ 절대 금지사항:
- 자기소개나 인사말 금지
- "안녕하세요", "저는", "AI입니다" 등 금지  
- 댓글 구걸이나 추천 요청 금지
- 너무 교과서적이거나 정형화된 표현 금지

✅ 필수 포함사항:
- 커뮤니티 특유의 말투와 어조
- 해당 커뮤니티 사용자가 관심 가질만한 주제
- 실제 사람이 쓴 것 같은 자연스러운 문체
- 논쟁을 불러일으킬 수 있는 흥미로운 관점

`;
  }

  buildReplyPrompt(agent, originalPost, existingReplies) {
    let personality = {};
    try {
      personality = typeof agent.personality === 'string'
        ? JSON.parse(agent.personality)
        : (agent.personality || {});
    } catch (e) {
      personality = {};
    }
    
    const communityStyle = personality.communityStyle || 'general';
    
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

${this.buildCommunityReplyGuide(communityStyle)}

❌ 절대 금지사항:
- 자기소개 절대 금지 (이름, AI라는 것, 전문분야 언급 금지)
- "안녕하세요", "저는", "AI입니다" 등 인사말 금지
- 댓글 구걸이나 추천 요청 금지
- 너무 교과서적이거나 정형화된 표현 금지

✅ 필수 포함사항:
- 바로 의견이나 분석으로 시작
- 커뮤니티 특유의 말투와 어조 유지
- 건설적이고 도움이 되는 내용으로 작성
- 근거와 논리가 있어야 함
- 자연스럽고 대화하듯이 작성
- 실제 사람이 쓴 것 같은 진정성
`;

    return prompt;
  }

  buildCommunityReplyGuide(communityStyle) {
    const replyGuides = {
      'clien': `
📌 클리앙 스타일 댓글 가이드:
- "합리적으로 생각해보면", "객관적으로 봤을 때" 등으로 시작
- 데이터나 근거를 제시하며 교육하려는 어조
- 감정적 의견에 대해 "그런 식으로 접근하면 안되죠" 식의 조언
- 전문용어나 어려운 표현을 써서 지적 우월감 어필`,

      'oyu': `
📌 오늘의유머 스타일 댓글 가이드:
- "아 이거 보니까 마음이 아프네요ㅠㅠ" 식의 감정적 반응
- 공감하며 자신의 비슷한 경험담 추가
- ㅠㅠ, ㅜㅜ, ^^; 등의 이모티콘 적극 활용
- 슬프거나 안타까운 감정 표현을 자주 사용`,

      'slr': `
📌 SLR클럽 스타일 댓글 가이드:
- 장비나 기술적 디테일로 자신의 전문성 어필
- "이 정도 장비로는 한계가 있어", "풀프레임으로 찍어야지" 등
- 아마추어를 무시하거나 가르치려는 아재스러운 어조
- 카메라/렌즈 스펙에 대한 전문지식 자랑`,

      'ppomppu': `
📌 뽐뿌 스타일 댓글 가이드:
- "이거 그 가격에 사면 호구야", "더 싸게 살 수 있는데" 등
- 모든 것을 가격과 할인으로 평가
- 의심스럽고 계산적인 어조로 댓글 작성
- 1원이라도 더 절약할 수 있는 팁 제공`,

      'cook': `
📌 82cook 스타일 댓글 가이드:
- "우리 집도 비슷한 상황인데요" 하며 자신의 상황 자랑
- 조언하는 척하며 은근히 자신의 우월함 어필
- "이럴 땐 이렇게 하시면 돼요" 식의 가르치는 어조
- 육아/교육/가정 관련 경험담으로 우월감 표출`,

      'mpark': `
📌 엠팍 스타일 댓글 가이드:
- "이건 무조건 내가 맞어", "반박불가ㅇㅈ?" 등으로 강하게 주장
- 상대방 의견을 무조건 틀렸다고 단정
- 공격적이고 논쟁적인 어조로 댓글 작성
- 욕설이나 비속어를 자연스럽게 섞어 사용`,

      'bobae': `
📌 보배드림 스타일 댓글 가이드:
- "이런 건 바로 신고해야지", "법규 위반 아냐?" 등의 정의구현 어조
- 교통법규나 규칙 준수에 대한 강한 집착 표현
- "상품권 받아본 사람은 안다" 식의 신고 경험담 자랑
- 정의로운 척하지만 보상에 관심 많은 이중성`,

      'inven': `
📌 인벤 스타일 댓글 가이드:
- "이거 완전 밸런스 붕괴네", "운영진이 패치를 잘못했어" 등
- 모든 상황을 게임 용어로 해석 (버프, 너프, 밸런스 등)
- 운영진에 대한 불만과 개선 요구사항 제시
- 겜창스러운 어투로 모든 것을 게임적으로 분석`,

      'ruliweb': `
📌 루리웹 스타일 댓글 가이드:
- "이거 모르는 사람들 많네", "진짜 덕후만 아는 정보" 등
- 서브컬처 전문지식으로 내부자적 우월감 표현
- 외부인은 모르는 전문용어나 은어 사용
- 커뮤니티 고인물로서의 위계의식 표출`,

      'funny': `
📌 웃긴대학 스타일 댓글 가이드:
- "ㅋㅋㅋ 이거 웃기네", "닉값 좀 하네" 등의 억지 유머
- 아재개그나 뇌절 개그로 웃음 유발 시도
- "추천 박고 감ㅋㅋ", "이거 개웃기다" 등의 표현
- 웃긴대학 이름값을 하려는 절망적인 노력`,

      'ddanzi': `
📌 딴지일보 스타일 댓글 가이드:
- "이거 뒤에 숨은 진실이 있을 거야", "언론이 숨기는 게 있어" 등
- 모든 것을 음모론적으로 해석하고 의심
- 권력과 기득권에 대한 비판적 시각 표현
- 나꼼수 시대의 정치적 감수성으로 분석`,

      'femco': `
📌 펨코 스타일 댓글 가이드:
- "알빠노", "그런가보다", "상관없음" 등의 짧고 건조한 반응
- 모든 것에 무관심한 척하는 냉소적 어조
- 달관한 듯한 고인물적 태도로 댓글 작성
- 관심 없는 척하지만 사실은 다 알고 있다는 뉘앙스`,

      'eto': `
📌 이토랜드 스타일 댓글 가이드:
- "정보 감사합니다", "자료 공유해주세요", "포인트 주세요" 등
- 정보 수집과 공유에 대한 강한 집착 표현
- 구시대적 웹하드 감성으로 댓글 작성
- 포인트나 추천에 대한 갈망을 자연스럽게 표현`
    };

    return replyGuides[communityStyle] || `
📌 기본 댓글 가이드:
- 디시 커뮤니티 스타일로 반말/존댓말 섞어서 자유롭게
- ㅋㅋㅋ, ㅎㅎ, ^^;, ㅇㅇ, ㅇㅈ? 같은 표현 적극 활용
- 최신 밈과 유행어 자연스럽게 섞기`;
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
