const fs = require('fs');
const path = require('path');

function analyzeIssueLogs() {
  const logFile = path.join(__dirname, '../logs/issue-modifications.log');
  
  if (!fs.existsSync(logFile)) {
    console.log('로그 파일이 존재하지 않습니다.');
    return;
  }
  
  const logs = fs.readFileSync(logFile, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(log => log !== null);
  
  console.log(`총 ${logs.length}개의 로그 항목 발견\n`);
  
  // 1. end_date 변경 로그만 필터링
  const endDateChanges = logs.filter(log => log.fieldName === 'end_date' && log.action === 'UPDATE_ISSUE');
  console.log(`=== 마감시간 변경 로그: ${endDateChanges.length}개 ===`);
  
  // 이슈별로 그룹화
  const changesByIssue = {};
  endDateChanges.forEach(log => {
    if (!changesByIssue[log.issueId]) {
      changesByIssue[log.issueId] = [];
    }
    changesByIssue[log.issueId].push(log);
  });
  
  // 각 이슈별 변경 패턴 분석
  Object.entries(changesByIssue).forEach(([issueId, changes]) => {
    console.log(`\n이슈 #${issueId}: ${changes.length}회 변경`);
    changes.forEach((change, index) => {
      const timestamp = new Date(change.timestamp);
      const kstTime = new Date(timestamp.getTime() + (9 * 60 * 60 * 1000));
      console.log(`  [${index + 1}] ${kstTime.toISOString().replace('T', ' ').substring(0, 19)} KST`);
      console.log(`      변경자: ${change.adminId ? `관리자 #${change.adminId}` : `사용자 #${change.userId}`}`);
      console.log(`      User-Agent: ${change.userAgent}`);
      console.log(`      IP: ${change.ipAddress}`);
      console.log(`      변경: ${change.oldValue} → ${change.newValue}`);
    });
  });
  
  // 2. 의심스러운 패턴 찾기
  console.log('\n=== 의심스러운 패턴 ===');
  
  // User-Agent별 분석
  const userAgentStats = {};
  logs.forEach(log => {
    const ua = log.userAgent || 'Unknown';
    if (!userAgentStats[ua]) {
      userAgentStats[ua] = 0;
    }
    userAgentStats[ua]++;
  });
  
  console.log('\nUser-Agent별 활동:');
  Object.entries(userAgentStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ua, count]) => {
      console.log(`  ${ua}: ${count}회`);
    });
  
  // 3. 짧은 시간 내 반복적인 변경 찾기
  console.log('\n=== 빠른 연속 변경 감지 ===');
  Object.entries(changesByIssue).forEach(([issueId, changes]) => {
    if (changes.length > 2) {
      const timeWindows = [];
      for (let i = 1; i < changes.length; i++) {
        const prevTime = new Date(changes[i-1].timestamp);
        const currTime = new Date(changes[i].timestamp);
        const diffMinutes = (currTime - prevTime) / (1000 * 60);
        if (diffMinutes < 60) {
          timeWindows.push({
            issueId,
            fromTime: prevTime,
            toTime: currTime,
            diffMinutes,
            count: 2
          });
        }
      }
      
      if (timeWindows.length > 0) {
        console.log(`\n이슈 #${issueId}에서 1시간 내 반복 변경 감지:`);
        timeWindows.forEach(window => {
          console.log(`  ${window.fromTime.toISOString()} ~ ${window.toTime.toISOString()} (${window.diffMinutes.toFixed(1)}분 간격)`);
        });
      }
    }
  });
  
  // 4. 특정 IP에서의 활동
  console.log('\n=== IP별 활동 분석 ===');
  const ipStats = {};
  logs.forEach(log => {
    const ip = log.ipAddress || 'Unknown';
    if (!ipStats[ip]) {
      ipStats[ip] = { count: 0, actions: [] };
    }
    ipStats[ip].count++;
    ipStats[ip].actions.push(`${log.action} on Issue #${log.issueId}`);
  });
  
  Object.entries(ipStats)
    .filter(([ip, stats]) => stats.count > 5)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([ip, stats]) => {
      console.log(`\n${ip}: ${stats.count}회 활동`);
    });
}

analyzeIssueLogs();