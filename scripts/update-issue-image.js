#!/usr/bin/env node
/**
 * 예겜 이슈 이미지 업데이트
 * 
 * 사용법:
 *   node update-issue-image.js <이슈ID> <이미지URL>
 * 
 * 예시:
 *   node update-issue-image.js 113 https://news.com/tennis.jpg
 */

const { updateIssue, downloadImage, saveImageToGitHub, authRequest } = require('./lib/api-client');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('사용법: node update-issue-image.js <이슈ID> <이미지URL>');
        console.log('예시: node update-issue-image.js 113 https://news.com/tennis.jpg');
        process.exit(1);
    }
    
    const issueId = args[0];
    const imageSource = args[1];
    
    console.log(`🔧 이슈 ${issueId} 이미지 업데이트 중...`);
    
    try {
        let imagePath = imageSource;
        let isTempFile = false;
        
        // URL이면 다운로드
        if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
            const urlObj = new URL(imageSource);
            const ext = path.extname(urlObj.pathname) || '.jpg';
            imagePath = path.join(os.tmpdir(), `yegam-update-${Date.now()}${ext}`);
            
            console.log(`   ↓ 다운로드 중: ${imageSource}`);
            await downloadImage(imageSource, imagePath);
            console.log(`   ↓ 다운로드 완료`);
            isTempFile = true;
        }
        
        // GitHub에 저장
        const ext = path.extname(imagePath) || '.jpg';
        const filename = `issue-${issueId}-${Date.now()}${ext}`;
        
        console.log(`   📤 GitHub에 업로드 중...`);
        const result = await saveImageToGitHub(imagePath, filename);
        
        if (!result.success) {
            console.error('❌ GitHub 저장 실패:', result.error);
            process.exit(1);
        }
        
        console.log(`   ✅ GitHub 저장 완료: ${result.url}`);
        
        // 기존 이슈 정보 가져오기
        console.log(`   📝 기존 이슈 정보 조회 중...`);
        const issueData = await authRequest(`/api/issues/${issueId}`);
        
        if (!issueData.success || !issueData.issue) {
            console.error('❌ 이슈 조회 실패');
            process.exit(1);
        }
        
        const issue = issueData.issue;
        
        // 이슈 업데이트 (기존 정보 유지 + 이미지 URL 변경)
        console.log(`   📝 이슈 업데이트 중...`);
        const updateResult = await updateIssue(issueId, {
            title: issue.title,
            description: issue.description,
            category: issue.category,
            end_date: issue.end_date,
            is_popular: issue.is_popular,
            image_url: result.url
        });
        
        if (updateResult.success) {
            console.log(`✅ 이슈 ${issueId} 이미지 업데이트 완료!`);
            console.log(`   새 이미지: ${result.url}`);
        } else {
            console.error('❌ 이슈 업데이트 실패:', updateResult.message);
        }
        
        // 임시 파일 정리
        if (isTempFile && fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message || error);
        process.exit(1);
    }
}

main();
