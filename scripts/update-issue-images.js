/**
 * 이슈 이미지 URL 일괄 업데이트 스크립트
 * 실행: node scripts/update-issue-images.js
 */

const API_BASE = process.env.API_BASE || 'https://yegam-production.up.railway.app';
const ADMIN_USER = 'superadmin';
const ADMIN_PASS = 'TempAdmin2025!';

// 각 이슈별 관련 이미지 URL (Unsplash 무료 이미지)
const issueImages = {
    // 손흥민 LAFC - 축구
    109: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop',
    
    // 밀라노 동계올림픽 - 스키/동계스포츠
    108: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop',
    
    // 코스피 5000 - 주식/차트
    107: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&h=600&fit=crop',
    
    // WBC 2026 한국 - 야구
    106: 'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?w=800&h=600&fit=crop',
    
    // 로제 그래미 - 음악/콘서트
    105: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=600&fit=crop',
    
    // 이재명 지지율 - 정치/투표
    104: 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&h=600&fit=crop',
    
    // 최민정 동계올림픽 - 스케이팅
    103: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop',
    
    // 비트코인
    102: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&h=600&fit=crop',
    
    // 윤석열 탄핵 - 법원/정의
    87: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&h=600&fit=crop'
};

async function getAuthToken() {
    const response = await fetch(`${API_BASE}/api/admin-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    });
    
    if (!response.ok) {
        throw new Error(`Admin login failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.token;
}

async function getIssue(issueId) {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}`);
    if (!response.ok) {
        throw new Error(`Failed to get issue ${issueId}: ${response.status}`);
    }
    const data = await response.json();
    return data.issue || data;
}

async function updateIssueImage(token, issueId, imageUrl) {
    // 먼저 기존 이슈 데이터 가져오기
    const issue = await getIssue(issueId);
    
    const response = await fetch(`${API_BASE}/api/admin/issues/${issueId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            title: issue.title,
            category: issue.category,
            description: issue.description,
            image_url: imageUrl,  // 새 이미지 URL
            yes_price: issue.yes_price,
            end_date: issue.end_date,
            is_popular: issue.is_popular
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update issue ${issueId}: ${response.status} - ${error}`);
    }
    
    return response.json();
}

async function main() {
    console.log('🖼️ 이슈 이미지 업데이트 시작...\n');
    
    try {
        // 관리자 로그인
        console.log('🔐 관리자 로그인 중...');
        const token = await getAuthToken();
        console.log('✅ 로그인 성공\n');
        
        // 각 이슈 이미지 업데이트
        for (const [issueId, imageUrl] of Object.entries(issueImages)) {
            try {
                console.log(`📷 이슈 #${issueId} 이미지 업데이트 중...`);
                await updateIssueImage(token, issueId, imageUrl);
                console.log(`   ✅ 완료: ${imageUrl.substring(0, 60)}...`);
            } catch (error) {
                console.log(`   ❌ 실패: ${error.message}`);
            }
        }
        
        console.log('\n🎉 이미지 업데이트 완료!');
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        process.exit(1);
    }
}

main();
