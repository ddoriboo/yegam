#!/usr/bin/env node

// 댓글 쿨다운 테스트 스크립트
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';

async function testCommentCooldown() {
    console.log('🧪 댓글 쿨다운 테스트 시작...\n');
    
    // 테스트용 사용자 ID와 이슈 ID (실제 DB에 존재하는 값으로 설정)
    const testUserId = 1; // 관리자 계정
    const testIssueId = 1; // 첫 번째 이슈
    
    // 첫 번째 댓글 작성
    console.log('1️⃣ 첫 번째 댓글 작성...');
    const firstResponse = await fetch(`${BASE_URL}/api/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userId: testUserId,
            issueId: testIssueId,
            content: '첫 번째 테스트 댓글입니다.'
        })
    });
    
    const firstData = await firstResponse.json();
    console.log('응답:', firstData);
    console.log('상태:', firstResponse.status, '\n');
    
    // 즉시 두 번째 댓글 작성 시도 (쿨다운 발생해야 함)
    console.log('2️⃣ 즉시 두 번째 댓글 작성 시도...');
    const secondResponse = await fetch(`${BASE_URL}/api/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            userId: testUserId,
            issueId: testIssueId,
            content: '두 번째 테스트 댓글입니다.'
        })
    });
    
    const secondData = await secondResponse.json();
    console.log('응답:', secondData);
    console.log('상태:', secondResponse.status);
    
    // 쿨다운 시간 확인
    if (secondData.cooldownRemaining) {
        console.log('✅ cooldownRemaining 필드 존재:', secondData.cooldownRemaining, '초');
    } else {
        console.log('❌ cooldownRemaining 필드 없음');
    }
    
    // 에러 메시지에서 시간 추출 테스트
    if (secondData.message) {
        const match = secondData.message.match(/(\d+)초 후에/);
        if (match) {
            console.log('✅ 메시지에서 시간 추출 성공:', match[1], '초');
        } else {
            console.log('❌ 메시지에서 시간 추출 실패');
        }
    }
    
    console.log('\n🔬 테스트 완료');
}

// 분석방 댓글 쿨다운 테스트
async function testDiscussionCommentCooldown() {
    console.log('\n🧪 분석방 댓글 쿨다운 테스트 시작...\n');
    
    // 테스트용 게시글 ID (실제 DB에 존재하는 값으로 설정)
    const testPostId = 1;
    
    // 첫 번째 댓글 작성
    console.log('1️⃣ 첫 번째 분석방 댓글 작성...');
    const firstResponse = await fetch(`${BASE_URL}/api/discussions/posts/${testPostId}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer fake-token' // 실제 토큰 필요
        },
        body: JSON.stringify({
            content: '첫 번째 분석방 테스트 댓글입니다.'
        })
    });
    
    const firstData = await firstResponse.json();
    console.log('응답:', firstData);
    console.log('상태:', firstResponse.status, '\n');
    
    // 즉시 두 번째 댓글 작성 시도
    console.log('2️⃣ 즉시 두 번째 분석방 댓글 작성 시도...');
    const secondResponse = await fetch(`${BASE_URL}/api/discussions/posts/${testPostId}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer fake-token'
        },
        body: JSON.stringify({
            content: '두 번째 분석방 테스트 댓글입니다.'
        })
    });
    
    const secondData = await secondResponse.json();
    console.log('응답:', secondData);
    console.log('상태:', secondResponse.status);
    
    // 쿨다운 시간 확인
    if (secondData.cooldownRemaining) {
        console.log('✅ cooldownRemaining 필드 존재:', secondData.cooldownRemaining, '초');
    } else {
        console.log('❌ cooldownRemaining 필드 없음');
    }
    
    console.log('\n🔬 분석방 테스트 완료');
}

// 메인 실행
async function main() {
    try {
        await testCommentCooldown();
        await testDiscussionCommentCooldown();
    } catch (error) {
        console.error('❌ 테스트 실행 중 오류:', error);
    }
}

main();