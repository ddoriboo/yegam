# Automated Market Generation System

## Overview

Automatically generate prediction markets from various data sources using AI, reducing manual admin work and ensuring fresh, relevant content.

---

## Generation Strategies

### Strategy 1: News-Based Generation (AI + News APIs)

**Flow:**
```
News APIs → Filter by Category → AI Analysis → Market Generation → Quality Check → Publish
```

**Data Sources:**
| Source | Type | Cost | Korean Support |
|--------|------|------|----------------|
| NewsAPI.org | Global news | Free tier (100/day) | Limited |
| Naver News API | Korean news | Free | Native |
| Google News RSS | Headlines | Free | Yes |
| Yonhap News API | Korean news | Paid | Native |
| CoinGecko API | Crypto news | Free | No |
| ESPN API | Sports | Free | No |

**Process:**
```javascript
// 1. Fetch trending news
const news = await fetchNews({
    categories: ['정치', '스포츠', '경제', '코인', '테크', '엔터'],
    language: 'ko',
    limit: 50
});

// 2. AI analyzes news for "predictable events"
const prompt = `
뉴스 헤드라인을 분석하여 예측 시장으로 만들 수 있는 이벤트를 찾으세요.

조건:
- 명확한 결과가 있어야 함 (YES/NO 또는 여러 선택지)
- 결과 확인이 가능해야 함 (공식 발표, 뉴스 등)
- 마감일이 명확해야 함

헤드라인: ${news.map(n => n.title).join('\n')}

JSON 형식으로 응답:
{
    "markets": [
        {
            "title": "윤석열 대통령, 2025년 1월 내 탄핵 심판 결과 나올까?",
            "category": "정치",
            "description": "헌법재판소의 탄핵 심판 결과가...",
            "outcomes": ["Yes", "No"],
            "end_date": "2025-01-31",
            "resolution_source": "헌법재판소 공식 발표",
            "confidence": 0.9
        }
    ]
}
`;

// 3. Filter by confidence & uniqueness
const validMarkets = markets.filter(m =>
    m.confidence > 0.7 &&
    !isDuplicate(m.title)
);

// 4. Auto-publish or queue for admin review
```

**Pros:** Fresh, relevant markets tied to current events
**Cons:** May create low-quality or duplicate markets

---

### Strategy 2: Sports Schedule Integration

**Flow:**
```
Sports APIs → Upcoming Games → Auto-create Markets → Live Updates → Auto-resolve
```

**Data Sources:**
| Source | Coverage | Cost |
|--------|----------|------|
| API-Football | Global football/soccer | Free tier |
| NBA API | Basketball | Free |
| KBO API | Korean baseball | Need to find |
| ESPN API | Multi-sport | Free |
| Sportradar | Premium, all sports | Paid |

**Auto-Generation Logic:**
```javascript
// Daily job: Create markets for games in next 7 days
async function generateSportsMarkets() {
    const upcomingGames = await fetchUpcomingGames({
        leagues: ['KBO', 'K리그', 'NBA', 'EPL'],
        days: 7
    });

    for (const game of upcomingGames) {
        // Skip if market already exists
        if (await marketExists(game.id)) continue;

        const market = {
            title: `${game.homeTeam} vs ${game.awayTeam}`,
            category: '스포츠',
            market_type: 'binary',
            outcomes: [
                { title: game.homeTeam, probability: 50 },
                { title: game.awayTeam, probability: 50 }
            ],
            end_date: game.startTime,
            resolution_source: 'official_score',
            external_id: game.id,
            live_data: {
                league: game.league,
                venue: game.venue,
                broadcast: game.broadcast
            }
        };

        await createMarket(market);
    }
}

// Auto-resolve when game ends
async function resolveSportsMarkets() {
    const finishedGames = await fetchFinishedGames();

    for (const game of finishedGames) {
        const market = await findMarketByExternalId(game.id);
        if (!market || market.status !== 'active') continue;

        const winner = game.homeScore > game.awayScore
            ? game.homeTeam
            : game.awayTeam;

        await resolveMarket(market.id, winner);
    }
}
```

**Pros:** Fully automated, no manual intervention needed
**Cons:** Limited to sports, needs reliable API

---

### Strategy 3: Calendar/Event-Based Templates

**Flow:**
```
Event Calendar → Template Matching → Generate Market → Schedule Resolution
```

**Event Types:**
| Event Type | Example | Template |
|------------|---------|----------|
| Elections | 대선, 지방선거 | "{후보} {선거}에서 당선될까?" |
| Earnings | 삼성전자 실적 | "{회사} Q{분기} 실적 컨센서스 상회할까?" |
| Product Launch | 아이폰 17 | "{회사} {제품} {날짜}까지 출시될까?" |
| Interest Rate | 한은 금리결정 | "{날짜} 금통위에서 기준금리 {동결/인상/인하}할까?" |
| Crypto Halving | 비트코인 반감기 | "비트코인, 반감기 후 {가격} 돌파할까?" |

**Implementation:**
```javascript
// Template definitions
const templates = {
    election: {
        title: "{candidate}, {election}에서 당선될까?",
        outcomes: ["Yes", "No"],
        resolution: "선거관리위원회 공식 발표"
    },
    earnings: {
        title: "{company} {quarter} 실적, 컨센서스 상회할까?",
        outcomes: ["Yes", "No"],
        resolution: "공시 기준"
    },
    price_target: {
        title: "{asset}, {date}까지 {price} 돌파할까?",
        outcomes: ["Yes", "No"],
        resolution: "종가 기준"
    },
    sports_season: {
        title: "{year} {league} 우승팀은?",
        outcomes: ["team1", "team2", "team3", ...],
        resolution: "리그 공식 발표"
    }
};

// Event calendar
const eventCalendar = [
    {
        type: 'earnings',
        company: '삼성전자',
        quarter: '2025 Q1',
        date: '2025-04-25',
        auto_generate: true
    },
    {
        type: 'interest_rate',
        event: '한국은행 금통위',
        date: '2025-01-23',
        auto_generate: true
    }
];

// Generate markets from calendar
async function generateCalendarMarkets() {
    const upcoming = eventCalendar.filter(e =>
        new Date(e.date) > new Date() &&
        new Date(e.date) < addDays(new Date(), 30) &&
        e.auto_generate
    );

    for (const event of upcoming) {
        const template = templates[event.type];
        const market = fillTemplate(template, event);
        await createMarket(market);
    }
}
```

**Pros:** High-quality, well-structured markets
**Cons:** Requires manual calendar maintenance

---

### Strategy 4: Price/Data Threshold Markets

**Flow:**
```
Price APIs → Monitor Thresholds → Generate Markets → Auto-resolve
```

**Auto-Generated Market Types:**
```javascript
const priceMarkets = [
    // Crypto
    { asset: 'BTC', thresholds: [50000, 75000, 100000, 150000, 200000] },
    { asset: 'ETH', thresholds: [2000, 3000, 4000, 5000] },

    // Stocks
    { asset: 'KOSPI', thresholds: [2500, 2750, 3000] },
    { asset: '삼성전자', thresholds: [60000, 70000, 80000] },

    // Forex
    { asset: 'USD/KRW', thresholds: [1300, 1400, 1500] }
];

// Generate "Will X reach Y by end of month?" markets
async function generatePriceMarkets() {
    const currentPrices = await fetchPrices(priceMarkets.map(p => p.asset));

    for (const config of priceMarkets) {
        const currentPrice = currentPrices[config.asset];

        // Find next threshold above current price
        const nextThreshold = config.thresholds.find(t => t > currentPrice);
        if (!nextThreshold) continue;

        // Check if market already exists
        const exists = await marketExists({
            asset: config.asset,
            threshold: nextThreshold,
            month: getCurrentMonth()
        });
        if (exists) continue;

        const market = {
            title: `${config.asset}, ${getCurrentMonth()}월 내 ${formatPrice(nextThreshold)} 돌파할까?`,
            category: config.asset.includes('BTC') ? '코인' : '경제',
            outcomes: ['Yes', 'No'],
            end_date: endOfMonth(),
            resolution_source: `${config.asset} 종가 기준`,
            metadata: {
                asset: config.asset,
                threshold: nextThreshold,
                current_price: currentPrice
            }
        };

        await createMarket(market);
    }
}

// Auto-resolve based on price
async function resolvePriceMarkets() {
    const activeMarkets = await getMarkets({
        type: 'price_target',
        status: 'active',
        end_date_passed: true
    });

    for (const market of activeMarkets) {
        const { asset, threshold } = market.metadata;
        const historicalHigh = await getHighestPrice(asset, market.created_at, market.end_date);

        const winner = historicalHigh >= threshold ? 'Yes' : 'No';
        await resolveMarket(market.id, winner);
    }
}
```

**Pros:** Fully automated, objective resolution
**Cons:** Limited market types

---

### Strategy 5: AI-Powered Market Discovery

**Flow:**
```
Multiple Sources → AI Analysis → Market Proposal → Confidence Scoring → Publish
```

**Comprehensive AI Approach:**
```javascript
class MarketGenerator {
    constructor() {
        this.sources = [
            new NaverNewsSource(),
            new TwitterTrendSource(),
            new RedditKoreaSource(),
            new CryptoNewsSource(),
            new SportsScheduleSource()
        ];
    }

    async generateDailyMarkets(targetCount = 10) {
        // 1. Gather data from all sources
        const rawData = await Promise.all(
            this.sources.map(s => s.fetch())
        );

        // 2. AI analysis for market opportunities
        const prompt = `
당신은 예측 시장 전문가입니다. 다음 데이터를 분석하여 흥미롭고 거래 가능한 예측 시장을 생성하세요.

데이터:
${JSON.stringify(rawData, null, 2)}

각 시장에 대해 다음을 제공하세요:
1. 제목 (명확하고 구체적)
2. 카테고리 (정치/스포츠/경제/코인/테크/엔터/날씨/해외)
3. 결과 옵션 (2-6개)
4. 마감일
5. 결과 확인 방법
6. 신뢰도 점수 (0-1)
7. 예상 관심도 (0-1)

규칙:
- 결과가 객관적으로 확인 가능해야 함
- 마감일이 현실적이어야 함 (1주~3개월)
- 중복되거나 사소한 주제 제외
- 논란이 될 수 있는 민감한 주제 제외 (혐오, 차별 등)

JSON 형식으로 ${targetCount}개의 시장을 생성하세요.
`;

        const aiResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const proposedMarkets = JSON.parse(aiResponse.choices[0].message.content);

        // 3. Filter and validate
        const validMarkets = await this.validateMarkets(proposedMarkets.markets);

        // 4. Check for duplicates
        const uniqueMarkets = await this.removeDuplicates(validMarkets);

        // 5. Score and rank
        const rankedMarkets = this.rankByPotential(uniqueMarkets);

        // 6. Return top markets
        return rankedMarkets.slice(0, targetCount);
    }

    async validateMarkets(markets) {
        return markets.filter(m =>
            m.confidence >= 0.7 &&
            m.outcomes.length >= 2 &&
            new Date(m.end_date) > new Date() &&
            new Date(m.end_date) < addMonths(new Date(), 6)
        );
    }

    async removeDuplicates(markets) {
        const existing = await getActiveMarketTitles();

        return markets.filter(m => {
            // Use embedding similarity to detect duplicates
            const similarity = await checkSimilarity(m.title, existing);
            return similarity < 0.85; // 85% similarity threshold
        });
    }

    rankByPotential(markets) {
        return markets.sort((a, b) => {
            const scoreA = (a.confidence * 0.4) + (a.interest * 0.6);
            const scoreB = (b.confidence * 0.4) + (b.interest * 0.6);
            return scoreB - scoreA;
        });
    }
}
```

---

## Recommended Architecture

### Hybrid Approach (Best of All Strategies)

```
┌─────────────────────────────────────────────────────────────┐
│                    Market Generation Pipeline                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Sports APIs  │  │  News APIs   │  │ Price APIs   │      │
│  │ (ESPN, KBO)  │  │ (Naver, etc) │  │ (Binance)    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Data Aggregator Service              │      │
│  │  - Fetch from all sources (cron: every 1 hour)   │      │
│  │  - Normalize data format                          │      │
│  │  - Store in staging table                         │      │
│  └──────────────────────┬───────────────────────────┘      │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │              AI Analysis Service                  │      │
│  │  - GPT-4o analyzes aggregated data               │      │
│  │  - Generates market proposals                     │      │
│  │  - Scores confidence & interest                   │      │
│  └──────────────────────┬───────────────────────────┘      │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Validation Service                   │      │
│  │  - Check duplicates (embedding similarity)        │      │
│  │  - Validate resolution criteria                   │      │
│  │  - Content moderation                             │      │
│  └──────────────────────┬───────────────────────────┘      │
│                         │                                   │
│            ┌────────────┴────────────┐                     │
│            ▼                         ▼                      │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │  Auto-Publish   │      │  Admin Review   │              │
│  │ (High confidence│      │ (Low confidence │              │
│  │  sports, prices)│      │  news-based)    │              │
│  └────────┬────────┘      └────────┬────────┘              │
│           │                        │                        │
│           └────────────┬───────────┘                        │
│                        ▼                                    │
│  ┌──────────────────────────────────────────────────┐      │
│  │                 Published Markets                 │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Auto-Resolution Pipeline                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Sports Results│  │ Price Data   │  │ Official    │       │
│  │   (APIs)     │  │  (APIs)      │  │ Announcements│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌──────────────────────────────────────────────────┐      │
│  │             Resolution Checker Service            │      │
│  │  - Runs every 5 minutes                          │      │
│  │  - Matches results to markets                     │      │
│  │  - Auto-resolves if criteria met                 │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema Additions

```sql
-- Market generation sources
CREATE TABLE market_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,  -- 'naver_news', 'espn', 'binance'
    type VARCHAR(50) NOT NULL,   -- 'news', 'sports', 'price', 'calendar'
    config JSONB,                -- API keys, endpoints, etc.
    is_active BOOLEAN DEFAULT TRUE,
    last_fetch TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Raw data staging
CREATE TABLE market_source_data (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES market_sources(id),
    raw_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- AI-generated market proposals
CREATE TABLE market_proposals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    outcomes JSONB NOT NULL,
    end_date TIMESTAMPTZ,
    resolution_source TEXT,

    -- AI metadata
    source_type VARCHAR(50),     -- 'news', 'sports', 'price', 'calendar'
    source_data JSONB,           -- Original data that inspired this
    confidence DECIMAL(3,2),     -- 0.00 to 1.00
    interest_score DECIMAL(3,2), -- 0.00 to 1.00

    -- Review status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'auto_published'
    reviewed_by INTEGER REFERENCES admins(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- If published
    market_id INTEGER REFERENCES markets(id),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Resolution criteria for auto-resolution
CREATE TABLE resolution_criteria (
    id SERIAL PRIMARY KEY,
    market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,

    criteria_type VARCHAR(50) NOT NULL,  -- 'price_above', 'sports_winner', 'date_event'
    criteria_config JSONB NOT NULL,
    /*
    Examples:
    { "asset": "BTC", "threshold": 100000, "comparison": ">=", "source": "binance" }
    { "game_id": "espn_12345", "source": "espn" }
    { "search_query": "헌재 탄핵 인용", "source": "naver_news" }
    */

    is_met BOOLEAN DEFAULT FALSE,
    met_at TIMESTAMPTZ,
    result_data JSONB,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Generation schedule/templates
CREATE TABLE generation_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    template_type VARCHAR(50) NOT NULL,  -- 'recurring', 'calendar', 'threshold'

    title_template VARCHAR(500) NOT NULL,
    category VARCHAR(50) NOT NULL,
    outcomes_template JSONB NOT NULL,

    -- Schedule
    schedule JSONB,
    /*
    Recurring: { "cron": "0 9 * * 1", "description": "Every Monday 9am" }
    Calendar: { "event_type": "earnings", "days_before": 7 }
    Threshold: { "asset": "BTC", "thresholds": [100000, 150000, 200000] }
    */

    is_active BOOLEAN DEFAULT TRUE,
    last_generated TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_proposals_status ON market_proposals(status);
CREATE INDEX idx_proposals_created ON market_proposals(created_at DESC);
CREATE INDEX idx_resolution_market ON resolution_criteria(market_id);
CREATE INDEX idx_source_data_processed ON market_source_data(processed);
```

---

## Implementation Services

### 1. Data Aggregator Service

```javascript
// /services/market-generation/data-aggregator.js

const cron = require('node-cron');

class DataAggregator {
    constructor() {
        this.sources = {
            naver_news: new NaverNewsSource(),
            google_news: new GoogleNewsSource(),
            crypto_prices: new CryptoPriceSource(),
            sports_schedule: new SportsScheduleSource(),
            twitter_trends: new TwitterTrendsSource()
        };
    }

    // Run every hour
    start() {
        cron.schedule('0 * * * *', () => this.aggregate());
    }

    async aggregate() {
        console.log('🔄 Starting data aggregation...');

        for (const [name, source] of Object.entries(this.sources)) {
            try {
                const data = await source.fetch();
                await this.storeData(name, data);
                console.log(`✅ ${name}: ${data.length} items`);
            } catch (error) {
                console.error(`❌ ${name}: ${error.message}`);
            }
        }
    }

    async storeData(sourceName, data) {
        const sourceId = await this.getSourceId(sourceName);
        await query(`
            INSERT INTO market_source_data (source_id, raw_data)
            VALUES ($1, $2)
        `, [sourceId, JSON.stringify(data)]);
    }
}

// Source implementations
class NaverNewsSource {
    async fetch() {
        const categories = ['정치', '경제', '사회', 'IT과학', '스포츠', '연예'];
        const results = [];

        for (const category of categories) {
            const response = await fetch(
                `https://openapi.naver.com/v1/search/news.json?query=${category}&display=20&sort=date`,
                { headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID } }
            );
            const data = await response.json();
            results.push(...data.items.map(item => ({
                title: item.title.replace(/<[^>]*>/g, ''),
                description: item.description.replace(/<[^>]*>/g, ''),
                link: item.link,
                pubDate: item.pubDate,
                category
            })));
        }

        return results;
    }
}

class SportsScheduleSource {
    async fetch() {
        // Fetch upcoming KBO, K리그, NBA games
        const games = [];

        // KBO example
        const kboResponse = await fetch('https://api.example.com/kbo/schedule');
        const kboData = await kboResponse.json();
        games.push(...kboData.games.map(g => ({
            type: 'sports',
            league: 'KBO',
            home: g.homeTeam,
            away: g.awayTeam,
            date: g.gameDate,
            external_id: g.gameId
        })));

        return games;
    }
}

class CryptoPriceSource {
    async fetch() {
        const assets = ['bitcoin', 'ethereum', 'solana', 'ripple'];
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${assets.join(',')}&vs_currencies=usd&include_24hr_change=true`
        );
        const data = await response.json();

        return Object.entries(data).map(([id, info]) => ({
            type: 'crypto_price',
            asset: id,
            price: info.usd,
            change_24h: info.usd_24h_change
        }));
    }
}

module.exports = { DataAggregator };
```

### 2. AI Market Generator Service

```javascript
// /services/market-generation/ai-generator.js

const OpenAI = require('openai');
const cron = require('node-cron');

class AIMarketGenerator {
    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    // Run every 6 hours
    start() {
        cron.schedule('0 */6 * * *', () => this.generate());
    }

    async generate() {
        console.log('🤖 Starting AI market generation...');

        // 1. Get unprocessed source data
        const sourceData = await this.getUnprocessedData();
        if (sourceData.length === 0) {
            console.log('No new data to process');
            return;
        }

        // 2. Generate markets using AI
        const proposals = await this.generateWithAI(sourceData);

        // 3. Validate and score
        const validProposals = await this.validateProposals(proposals);

        // 4. Check for duplicates
        const uniqueProposals = await this.removeDuplicates(validProposals);

        // 5. Store proposals
        for (const proposal of uniqueProposals) {
            await this.storeProposal(proposal);
        }

        // 6. Auto-publish high-confidence proposals
        await this.autoPublish();

        // 7. Mark source data as processed
        await this.markProcessed(sourceData.map(d => d.id));

        console.log(`✅ Generated ${uniqueProposals.length} market proposals`);
    }

    async generateWithAI(sourceData) {
        const prompt = `
당신은 한국 예측 시장 전문가입니다. 다음 데이터를 분석하여 예측 시장을 생성하세요.

## 데이터
${JSON.stringify(sourceData, null, 2)}

## 규칙
1. 각 시장은 명확한 결과가 있어야 합니다 (YES/NO 또는 여러 선택지)
2. 결과는 공식 발표, 뉴스, API 등으로 객관적으로 확인 가능해야 합니다
3. 마감일은 현실적이어야 합니다 (1주~6개월)
4. 사용자들이 관심을 가질만한 주제여야 합니다
5. 민감하거나 논란이 될 수 있는 주제는 피하세요

## 카테고리
정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외

## 출력 형식 (JSON)
{
    "markets": [
        {
            "title": "비트코인, 2025년 1월 내 $100,000 돌파할까?",
            "category": "코인",
            "description": "비트코인의 가격이 2025년 1월 31일까지 $100,000를 돌파할지 예측합니다.",
            "market_type": "binary",
            "outcomes": [
                {"title": "Yes", "initial_probability": 45},
                {"title": "No", "initial_probability": 55}
            ],
            "end_date": "2025-01-31T23:59:59+09:00",
            "resolution_source": "Binance BTC/USDT 종가 기준",
            "resolution_criteria": {
                "type": "price_above",
                "asset": "BTC",
                "threshold": 100000,
                "source": "binance"
            },
            "confidence": 0.9,
            "interest_score": 0.85,
            "tags": ["비트코인", "암호화폐", "가격예측"]
        }
    ]
}

5-10개의 다양한 시장을 생성하세요.
`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7
        });

        return JSON.parse(response.choices[0].message.content).markets;
    }

    async validateProposals(proposals) {
        return proposals.filter(p => {
            // Basic validation
            if (!p.title || !p.category || !p.outcomes) return false;
            if (p.outcomes.length < 2) return false;
            if (p.confidence < 0.6) return false;

            // Date validation
            const endDate = new Date(p.end_date);
            const now = new Date();
            const sixMonths = new Date(now.setMonth(now.getMonth() + 6));
            if (endDate <= new Date() || endDate > sixMonths) return false;

            // Content moderation (basic)
            const blockedWords = ['살인', '자살', '혐오', '차별'];
            if (blockedWords.some(w => p.title.includes(w))) return false;

            return true;
        });
    }

    async removeDuplicates(proposals) {
        const existingTitles = await query(`
            SELECT title FROM markets WHERE status IN ('active', 'closed')
            UNION
            SELECT title FROM market_proposals WHERE status = 'pending'
        `);

        const existingSet = new Set(existingTitles.rows.map(r => r.title.toLowerCase()));

        return proposals.filter(p => {
            const normalizedTitle = p.title.toLowerCase();

            // Exact match check
            if (existingSet.has(normalizedTitle)) return false;

            // Similarity check (simple version - could use embeddings)
            for (const existing of existingSet) {
                if (this.similarity(normalizedTitle, existing) > 0.8) return false;
            }

            return true;
        });
    }

    similarity(str1, str2) {
        // Simple Jaccard similarity
        const set1 = new Set(str1.split(' '));
        const set2 = new Set(str2.split(' '));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    async storeProposal(proposal) {
        await query(`
            INSERT INTO market_proposals
            (title, category, description, outcomes, end_date, resolution_source,
             source_type, confidence, interest_score, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        `, [
            proposal.title,
            proposal.category,
            proposal.description,
            JSON.stringify(proposal.outcomes),
            proposal.end_date,
            proposal.resolution_source,
            proposal.source_type || 'ai_generated',
            proposal.confidence,
            proposal.interest_score
        ]);
    }

    async autoPublish() {
        // Auto-publish high-confidence proposals
        const autoPublishThreshold = 0.85;

        const proposals = await query(`
            SELECT * FROM market_proposals
            WHERE status = 'pending'
            AND confidence >= $1
            AND source_type IN ('sports', 'price_target')
        `, [autoPublishThreshold]);

        for (const proposal of proposals.rows) {
            await this.publishProposal(proposal);
        }
    }

    async publishProposal(proposal) {
        // Create actual market from proposal
        const marketResult = await query(`
            INSERT INTO markets
            (title, description, category, market_type, end_date, resolution_source, tags)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            proposal.title,
            proposal.description,
            proposal.category,
            proposal.market_type || 'binary',
            proposal.end_date,
            proposal.resolution_source,
            proposal.tags || []
        ]);

        const marketId = marketResult.rows[0].id;

        // Create outcomes
        const outcomes = JSON.parse(proposal.outcomes);
        for (const outcome of outcomes) {
            await query(`
                INSERT INTO outcomes (market_id, title, probability, display_order)
                VALUES ($1, $2, $3, $4)
            `, [marketId, outcome.title, outcome.initial_probability, outcome.display_order || 0]);
        }

        // Update proposal status
        await query(`
            UPDATE market_proposals
            SET status = 'auto_published', market_id = $1
            WHERE id = $2
        `, [marketId, proposal.id]);

        console.log(`📢 Auto-published: ${proposal.title}`);
    }
}

module.exports = { AIMarketGenerator };
```

### 3. Auto-Resolution Service

```javascript
// /services/market-generation/auto-resolver.js

const cron = require('node-cron');

class AutoResolver {
    constructor() {
        this.resolvers = {
            price_above: new PriceResolver(),
            sports_winner: new SportsResolver(),
            date_event: new DateEventResolver()
        };
    }

    // Run every 5 minutes
    start() {
        cron.schedule('*/5 * * * *', () => this.checkResolutions());
    }

    async checkResolutions() {
        const pendingCriteria = await query(`
            SELECT rc.*, m.title, m.status as market_status
            FROM resolution_criteria rc
            JOIN markets m ON rc.market_id = m.id
            WHERE rc.is_met = FALSE
            AND m.status = 'active'
            AND m.end_date <= NOW()
        `);

        for (const criteria of pendingCriteria.rows) {
            const resolver = this.resolvers[criteria.criteria_type];
            if (!resolver) continue;

            try {
                const result = await resolver.check(criteria);
                if (result.resolved) {
                    await this.resolveMarket(criteria.market_id, result);
                }
            } catch (error) {
                console.error(`Resolution error for market ${criteria.market_id}:`, error);
            }
        }
    }

    async resolveMarket(marketId, result) {
        // Update criteria
        await query(`
            UPDATE resolution_criteria
            SET is_met = TRUE, met_at = NOW(), result_data = $1
            WHERE market_id = $2
        `, [JSON.stringify(result.data), marketId]);

        // Update winning outcome
        await query(`
            UPDATE outcomes
            SET is_winner = (title = $1)
            WHERE market_id = $2
        `, [result.winner, marketId]);

        // Update market status
        await query(`
            UPDATE markets
            SET status = 'resolved', resolved_at = NOW()
            WHERE id = $1
        `, [marketId]);

        // Distribute rewards
        await this.distributeRewards(marketId, result.winner);

        console.log(`✅ Resolved market ${marketId}: ${result.winner}`);
    }

    async distributeRewards(marketId, winningOutcome) {
        // Get winning positions
        const winningPositions = await query(`
            SELECT p.*, u.gam_balance, o.probability
            FROM positions p
            JOIN users u ON p.user_id = u.id
            JOIN outcomes o ON p.outcome_id = o.id
            WHERE p.market_id = $1
            AND o.title = $2
            AND p.is_sold = FALSE
        `, [marketId, winningOutcome]);

        for (const position of winningPositions.rows) {
            // Calculate payout: shares * 100 (each share pays 100 GAM if correct)
            const payout = Math.floor(position.shares * 100);
            const profit = payout - position.total_cost;

            // Update user balance
            await query(`
                UPDATE users SET gam_balance = gam_balance + $1 WHERE id = $2
            `, [payout, position.user_id]);

            // Record transaction
            await query(`
                INSERT INTO gam_transactions (user_id, type, category, amount, description, reference_id)
                VALUES ($1, 'earn', 'market_win', $2, $3, $4)
            `, [position.user_id, payout, `Market win: ${winningOutcome}`, `market_${marketId}`]);

            // Update position
            await query(`
                UPDATE positions SET profit_loss = $1 WHERE id = $2
            `, [profit, position.id]);
        }
    }
}

class PriceResolver {
    async check(criteria) {
        const config = criteria.criteria_config;

        // Fetch current price
        const response = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbol=${config.asset}USDT`
        );
        const data = await response.json();
        const currentPrice = parseFloat(data.price);

        // Check condition
        let met = false;
        switch (config.comparison) {
            case '>=': met = currentPrice >= config.threshold; break;
            case '<=': met = currentPrice <= config.threshold; break;
            case '>': met = currentPrice > config.threshold; break;
            case '<': met = currentPrice < config.threshold; break;
        }

        return {
            resolved: true,  // Price markets resolve at end_date regardless
            winner: met ? 'Yes' : 'No',
            data: { final_price: currentPrice, threshold: config.threshold }
        };
    }
}

class SportsResolver {
    async check(criteria) {
        const config = criteria.criteria_config;

        // Fetch game result
        const response = await fetch(
            `https://api.example.com/games/${config.game_id}`
        );
        const game = await response.json();

        if (game.status !== 'final') {
            return { resolved: false };
        }

        const winner = game.homeScore > game.awayScore
            ? game.homeTeam
            : game.awayTeam;

        return {
            resolved: true,
            winner: winner,
            data: {
                homeScore: game.homeScore,
                awayScore: game.awayScore
            }
        };
    }
}

module.exports = { AutoResolver };
```

---

## Scheduling Summary

| Service | Schedule | Description |
|---------|----------|-------------|
| Data Aggregator | Every 1 hour | Fetch news, prices, sports data |
| AI Generator | Every 6 hours | Analyze data, create proposals |
| Auto Publisher | Every 6 hours | Publish high-confidence markets |
| Auto Resolver | Every 5 minutes | Check and resolve markets |
| Sports Generator | Every 24 hours | Create upcoming game markets |
| Price Generator | Every 24 hours | Create price target markets |

---

## Admin Dashboard Features

```
/admin/market-generation
├── Pending Proposals (approve/reject)
├── Generation Stats (daily/weekly/monthly)
├── Source Health (API status)
├── Templates Management
├── Resolution Queue
└── Override Resolution
```

---

## Cost Estimates

| Service | Cost/Month |
|---------|------------|
| OpenAI GPT-4o | ~$50-100 (depending on generation frequency) |
| News APIs | Free - $50 (depending on tier) |
| Sports APIs | Free - $100 |
| Price APIs | Free (CoinGecko, Binance) |

---

## Questions to Resolve

1. **Generation Frequency**: How many new markets per day? (5-10 recommended)
2. **Auto-publish Threshold**: Confidence level for auto-publish? (0.85 recommended)
3. **Manual Review**: Which categories require admin review?
4. **Resolution Priority**: Manual override vs auto-resolution?
5. **Content Moderation**: Additional blocked topics/keywords?

---

*Document Created: 2025-01-06*
