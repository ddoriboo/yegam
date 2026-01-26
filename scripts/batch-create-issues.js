#!/usr/bin/env node
/**
 * 예겜 이슈 배치 생성 CLI
 * 
 * 사용법:
 *   node batch-create-issues.js <issues.json>
 * 
 * JSON 형식:
 * [
 *   {
 *     "title": "이슈 제목",
 *     "category": "코인",
 *     "endDate": "2026-01-31T23:59",
 *     "description": "설명",
 *     "image": "./image.jpg 또는 https://...",
 *     "popular": true
 *   }
 * ]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createIssue, uploadImage, downloadImage } = require('./lib/api-client');

async function processImage(image, baseDir) {
    if (!image) return null;
    
    let imagePath = image;
    let tempFile = null;
    
    // URL이면 다운로드
    if (image.startsWith('http://') || image.startsWith('https://')) {
        const ext = path.extname(new URL(image).pathname) || '.png';
        tempFile = path.join(os.tmpdir(), `yegam-batch-${Date.now()}${ext}`);
        await downloadImage(image, tempFile);
        imagePath = tempFile;
    } else if (!path.isAbsolute(image)) {
        // 상대 경로면 JSON 파일 기준으로 변환
        imagePath = path.join(baseDir, image);
    }
    
    // 업로드
    const result = await uploadImage(imagePath);
    
    // 임시 파일 정리
    if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
    }
    
    return result.success ? result.imageUrl : null;
}

async function main() {
    const jsonPath = process.argv[2];
    
    if (!jsonPath || jsonPath === '--help' || jsonPath === '-h') {
        console.log(`
예겜 이슈 배치 생성 CLI

사용법:
  node batch-create-issues.js <issues.json>

JSON 형식:
  [
    {
      "title": "이슈 제목",           // 필수
      "category": "코인",             // 필수 (정치|스포츠|경제|코인|테크|엔터|날씨|해외)
      "endDate": "2026-01-31T23:59",  // 필수 (ISO 형식)
      "description": "설명",          // 선택
      "image": "./image.jpg",         // 선택 (파일 경로 또는 URL)
      "popular": true                 // 선택 (기본: false)
    }
  ]

예시:
  node batch-create-issues.js issues.json
`);
        process.exit(0);
    }
    
    // JSON 파일 읽기
    if (!fs.existsSync(jsonPath)) {
        console.error(`❌ 파일을 찾을 수 없습니다: ${jsonPath}`);
        process.exit(1);
    }
    
    let issues;
    try {
        const content = fs.readFileSync(jsonPath, 'utf-8');
        issues = JSON.parse(content);
    } catch (e) {
        console.error(`❌ JSON 파싱 오류: ${e.message}`);
        process.exit(1);
    }
    
    if (!Array.isArray(issues)) {
        console.error('❌ JSON은 배열 형식이어야 합니다.');
        process.exit(1);
    }
    
    console.log(`📋 총 ${issues.length}개 이슈 처리 시작...\n`);
    
    const baseDir = path.dirname(path.resolve(jsonPath));
    const results = { success: [], failed: [] };
    
    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const num = i + 1;
        
        console.log(`[${num}/${issues.length}] ${issue.title}`);
        
        // 필수값 검증
        if (!issue.title || !issue.category || !issue.endDate) {
            console.log(`   ❌ 필수값 누락 (title, category, endDate)`);
            results.failed.push({ ...issue, error: '필수값 누락' });
            continue;
        }
        
        try {
            // 이미지 처리
            let imageUrl = null;
            if (issue.image) {
                console.log(`   📷 이미지 처리 중...`);
                imageUrl = await processImage(issue.image, baseDir);
                if (imageUrl) {
                    console.log(`   ↑ 업로드 완료`);
                }
            }
            
            // 날짜 보정
            let endDate = issue.endDate;
            if (!endDate.includes('T')) {
                endDate += 'T23:59:00';
            }
            
            // 이슈 생성
            const result = await createIssue({
                title: issue.title,
                category: issue.category,
                endDate: endDate,
                description: issue.description || '',
                popular: issue.popular || false,
                imageUrl: imageUrl
            });
            
            if (result.success) {
                console.log(`   ✅ 생성 완료 (ID: ${result.issue.id})`);
                results.success.push(result.issue);
            } else {
                console.log(`   ❌ 실패: ${result.message}`);
                results.failed.push({ ...issue, error: result.message });
            }
            
        } catch (error) {
            console.log(`   ❌ 오류: ${error.message || error}`);
            results.failed.push({ ...issue, error: error.message || String(error) });
        }
        
        console.log('');
    }
    
    // 결과 요약
    console.log('━'.repeat(40));
    console.log(`✅ 성공: ${results.success.length}개`);
    console.log(`❌ 실패: ${results.failed.length}개`);
    
    if (results.failed.length > 0) {
        console.log('\n실패 목록:');
        results.failed.forEach((f, i) => {
            console.log(`  ${i + 1}. ${f.title} - ${f.error}`);
        });
    }
}

main();
