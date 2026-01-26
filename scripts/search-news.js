#!/usr/bin/env node
/**
 * 예겜 이슈 검색 CLI
 * Brave Search + Tavily (fallback) + Polymarket 통합 검색
 * 
 * 사용법:
 *   node search-news.js "검색어"
 *   node search-news.js "비트코인" --provider tavily
 *   node search-news.js "손흥민" --count 10
 */

const https = require('https');

const CONFIG = {
    brave: {
        apiKey: process.env.BRAVE_API_KEY,
        baseUrl: 'https://api.search.brave.com/res/v1/web/search'
    },
    tavily: {
        apiKey: process.env.TAVILY_API_KEY || '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',
        baseUrl: 'https://api.tavily.com/search'
    }
};

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

/**
 * Brave Search
 */
async function searchBrave(query, count = 5) {
    if (!CONFIG.brave.apiKey) {
        throw new Error('BRAVE_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    
    const params = new URLSearchParams({
        q: query,
        count: count.toString(),
        search_lang: 'ko',
        country: 'KR'
    });
    
    const res = await request(`${CONFIG.brave.baseUrl}?${params}`, {
        headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': CONFIG.brave.apiKey
        }
    });
    
    if (res.status === 429) {
        throw new Error('RATE_LIMIT');
    }
    
    if (res.status !== 200) {
        throw new Error(`Brave API 오류: ${res.status}`);
    }
    
    return (res.data.web?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
        source: 'brave'
    }));
}

/**
 * Tavily Search
 */
async function searchTavily(query, count = 5) {
    const res = await request(CONFIG.tavily.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: CONFIG.tavily.apiKey,
            query: query,
            max_results: count,
            search_depth: 'basic',
            include_answer: false
        })
    });
    
    if (res.status !== 200) {
        throw new Error(`Tavily API 오류: ${res.status}`);
    }
    
    return (res.data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.content,
        source: 'tavily'
    }));
}

/**
 * Polymarket 검색 (Gamma API)
 */
async function searchPolymarket(query, count = 5) {
    const params = new URLSearchParams({
        _limit: count.toString(),
        closed: 'false',
        title_like: query
    });
    
    const res = await request(`https://gamma-api.polymarket.com/markets?${params}`);
    
    if (res.status !== 200) {
        return [];
    }
    
    return (Array.isArray(res.data) ? res.data : []).map(m => ({
        title: m.question || m.title,
        url: `https://polymarket.com/event/${m.slug || m.id}`,
        description: `YES: ${Math.round((m.outcomePrices?.[0] || 0.5) * 100)}% | Volume: $${Math.round(m.volume || 0).toLocaleString()}`,
        endDate: m.endDate,
        source: 'polymarket'
    }));
}

/**
 * 통합 검색
 */
async function search(query, options = {}) {
    const provider = options.provider || 'auto';
    const count = options.count || 5;
    
    const results = {
        news: [],
        polymarket: []
    };
    
    // 뉴스 검색
    console.log(`🔍 뉴스 검색: "${query}"`);
    
    if (provider === 'tavily') {
        results.news = await searchTavily(query, count);
        console.log(`   (Tavily 사용)`);
    } else {
        // Brave 시도, 실패시 Tavily fallback
        try {
            results.news = await searchBrave(query, count);
            console.log(`   (Brave 사용)`);
        } catch (e) {
            if (e.message === 'RATE_LIMIT' || !CONFIG.brave.apiKey) {
                console.log(`   ⚠️ Brave 제한, Tavily로 전환...`);
                results.news = await searchTavily(query, count);
            } else {
                throw e;
            }
        }
    }
    
    // Polymarket 검색
    console.log(`🎰 Polymarket 검색: "${query}"`);
    try {
        results.polymarket = await searchPolymarket(query, count);
    } catch (e) {
        console.log(`   ⚠️ Polymarket 검색 실패: ${e.message}`);
    }
    
    return results;
}

function printResults(results) {
    console.log('\n' + '═'.repeat(60));
    
    // 뉴스 결과
    console.log('\n📰 뉴스 검색 결과:\n');
    if (results.news.length === 0) {
        console.log('   (결과 없음)');
    } else {
        results.news.forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   ${r.url}`);
            if (r.description) {
                console.log(`   ${r.description.substring(0, 100)}...`);
            }
            console.log('');
        });
    }
    
    // Polymarket 결과
    console.log('═'.repeat(60));
    console.log('\n🎰 Polymarket 예측 시장:\n');
    if (results.polymarket.length === 0) {
        console.log('   (관련 마켓 없음)');
    } else {
        results.polymarket.forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   ${r.description}`);
            console.log(`   ${r.url}`);
            console.log('');
        });
    }
}

// 인자 파싱
function parseArgs(args) {
    const result = { query: null, provider: 'auto', count: 5 };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        
        if (arg === '--provider' || arg === '-p') {
            result.provider = next;
            i++;
        } else if (arg === '--count' || arg === '-c') {
            result.count = parseInt(next) || 5;
            i++;
        } else if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (!arg.startsWith('-')) {
            result.query = arg;
        }
    }
    
    return result;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    
    if (args.help || !args.query) {
        console.log(`
예겜 이슈 검색 CLI

사용법:
  node search-news.js "검색어" [옵션]

옵션:
  -p, --provider <brave|tavily|auto>  검색 제공자 (기본: auto)
  -c, --count <숫자>                  결과 개수 (기본: 5)
  -h, --help                          도움말

예시:
  node search-news.js "비트코인"
  node search-news.js "손흥민 토트넘" --count 10
  node search-news.js "대선" --provider tavily

환경변수:
  BRAVE_API_KEY   - Brave Search API 키
  TAVILY_API_KEY  - Tavily API 키 (기본값 있음)
`);
        process.exit(args.help ? 0 : 1);
    }
    
    try {
        const results = await search(args.query, {
            provider: args.provider,
            count: args.count
        });
        
        printResults(results);
        
    } catch (error) {
        console.error('❌ 오류:', error.message || error);
        process.exit(1);
    }
}

main();
