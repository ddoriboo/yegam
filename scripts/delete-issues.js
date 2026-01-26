#!/usr/bin/env node
/**
 * 예겜 이슈 삭제 CLI
 * 
 * 사용법:
 *   node delete-issues.js <id1> [id2] [id3] ...
 * 
 * 예시:
 *   node delete-issues.js 110
 *   node delete-issues.js 110 111 112
 */

const { deleteIssue, listIssues } = require('./lib/api-client');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`
예겜 이슈 삭제 CLI

사용법:
  node delete-issues.js <id1> [id2] [id3] ...
  node delete-issues.js --list              # 이슈 목록 보기

옵션:
  --list, -l    현재 이슈 목록 조회
  --help, -h    도움말

예시:
  node delete-issues.js 110
  node delete-issues.js 110 111 112
`);
        process.exit(0);
    }
    
    // 이슈 목록 조회
    if (args[0] === '--list' || args[0] === '-l') {
        try {
            const result = await listIssues();
            if (result.success && result.issues) {
                console.log('\n📋 현재 이슈 목록:\n');
                console.log('ID\t상태\t\t카테고리\t제목');
                console.log('─'.repeat(60));
                result.issues.forEach(issue => {
                    const status = issue.status.padEnd(10);
                    const category = (issue.category || '').padEnd(8);
                    console.log(`${issue.id}\t${status}\t${category}\t${issue.title}`);
                });
                console.log(`\n총 ${result.issues.length}개`);
            }
        } catch (error) {
            console.error('❌ 목록 조회 실패:', error.message);
        }
        process.exit(0);
    }
    
    // ID 추출
    const ids = args.filter(a => !a.startsWith('-')).map(a => parseInt(a)).filter(n => !isNaN(n));
    
    if (ids.length === 0) {
        console.error('❌ 삭제할 이슈 ID를 입력하세요.');
        process.exit(1);
    }
    
    console.log(`🗑️  ${ids.length}개 이슈 삭제 시작...\n`);
    
    const results = { success: [], failed: [] };
    
    for (const id of ids) {
        try {
            const result = await deleteIssue(id);
            if (result.success) {
                console.log(`✅ ID ${id} 삭제 완료`);
                results.success.push(id);
            } else {
                console.log(`❌ ID ${id} 삭제 실패: ${result.message}`);
                results.failed.push({ id, error: result.message });
            }
        } catch (error) {
            const msg = error.message || String(error);
            console.log(`❌ ID ${id} 오류: ${msg}`);
            results.failed.push({ id, error: msg });
        }
    }
    
    // 결과 요약
    console.log('\n' + '━'.repeat(40));
    console.log(`✅ 성공: ${results.success.length}개`);
    console.log(`❌ 실패: ${results.failed.length}개`);
}

main();
