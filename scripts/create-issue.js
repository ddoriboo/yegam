#!/usr/bin/env node
/**
 * 예겜 이슈 생성 CLI
 * 
 * 사용법:
 *   node create-issue.js -t "제목" -c 카테고리 -d 마감일 [-D 설명] [-i 이미지] [-p]
 * 
 * 예시:
 *   node create-issue.js -t "비트코인 10만달러?" -c 코인 -d 2026-01-31
 *   node create-issue.js -t "손흥민 골?" -c 스포츠 -d 2026-01-27T22:00 -i ./image.png -p
 */

const { createIssue, uploadImage, downloadImage } = require('./lib/api-client');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 간단한 인자 파싱
function parseArgs(args) {
    const result = { popular: false };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        
        switch (arg) {
            case '-t':
            case '--title':
                result.title = next;
                i++;
                break;
            case '-c':
            case '--category':
                result.category = next;
                i++;
                break;
            case '-d':
            case '--date':
            case '--end-date':
                result.endDate = next;
                i++;
                break;
            case '-D':
            case '--desc':
            case '--description':
                result.description = next;
                i++;
                break;
            case '-i':
            case '--image':
                result.image = next;
                i++;
                break;
            case '-p':
            case '--popular':
                result.popular = true;
                break;
            case '-h':
            case '--help':
                result.help = true;
                break;
        }
    }
    
    return result;
}

function showHelp() {
    console.log(`
예겜 이슈 생성 CLI

사용법:
  node create-issue.js [옵션]

옵션:
  -t, --title <제목>       이슈 제목 (필수)
  -c, --category <카테고리> 카테고리 (필수)
                           정치|스포츠|경제|코인|테크|엔터|날씨|해외
  -d, --end-date <날짜>    마감일 (필수, ISO 형식)
                           예: 2026-01-31 또는 2026-01-31T23:59
  -D, --description <설명> 이슈 설명
  -i, --image <경로/URL>   이미지 파일 또는 URL
  -p, --popular            인기 이슈로 설정
  -h, --help               도움말

예시:
  node create-issue.js -t "비트코인 10만달러?" -c 코인 -d 2026-01-31
  node create-issue.js -t "손흥민 골?" -c 스포츠 -d 2026-01-27T22:00 -p
  node create-issue.js -t "테스트" -c 테크 -d 2026-02-01 -i https://example.com/img.png
`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    
    if (args.help) {
        showHelp();
        process.exit(0);
    }
    
    // 필수값 검증
    if (!args.title || !args.category || !args.endDate) {
        console.error('❌ 제목(-t), 카테고리(-c), 마감일(-d)은 필수입니다.');
        console.error('   node create-issue.js --help 로 도움말을 확인하세요.');
        process.exit(1);
    }
    
    // 날짜 형식 보정
    let endDate = args.endDate;
    if (!endDate.includes('T')) {
        endDate += 'T23:59:00';
    }
    if (!endDate.endsWith('Z') && !endDate.includes('+')) {
        // KST로 가정
    }
    
    try {
        let imageUrl = null;
        
        // 이미지 처리
        if (args.image) {
            console.log('📷 이미지 처리 중...');
            
            let imagePath = args.image;
            
            // URL이면 다운로드
            if (args.image.startsWith('http://') || args.image.startsWith('https://')) {
                const ext = path.extname(new URL(args.image).pathname) || '.png';
                imagePath = path.join(os.tmpdir(), `yegam-img-${Date.now()}${ext}`);
                await downloadImage(args.image, imagePath);
                console.log(`   ↓ 다운로드 완료: ${imagePath}`);
            }
            
            // 업로드
            const uploadResult = await uploadImage(imagePath);
            if (uploadResult.success) {
                imageUrl = uploadResult.imageUrl;
                console.log(`   ↑ 업로드 완료: ${imageUrl}`);
            } else {
                console.error('   ⚠️ 이미지 업로드 실패:', uploadResult.message);
            }
            
            // 임시 파일 정리
            if (imagePath !== args.image && fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        // 이슈 생성
        console.log('📝 이슈 생성 중...');
        
        const result = await createIssue({
            title: args.title,
            category: args.category,
            endDate: endDate,
            description: args.description || '',
            popular: args.popular,
            imageUrl: imageUrl
        });
        
        if (result.success) {
            console.log('✅ 이슈 생성 완료!');
            console.log(`   ID: ${result.issue.id}`);
            console.log(`   제목: ${result.issue.title}`);
            console.log(`   카테고리: ${result.issue.category}`);
            console.log(`   마감: ${result.issue.end_date}`);
            console.log(`   인기: ${result.issue.is_popular ? 'O' : 'X'}`);
            if (result.issue.image_url) {
                console.log(`   이미지: ${result.issue.image_url}`);
            }
        } else {
            console.error('❌ 이슈 생성 실패:', result.message);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message || error);
        process.exit(1);
    }
}

main();
