import * as auth from './auth.js';
import initialIssues from './data.js';

const ISSUES_KEY = 'poli-view-issues';
const BETS_KEY_PREFIX = 'poli-view-bets-';

export async function init() {
    // 기존 캐시 완전히 제거하고 새 데이터 로드
    sessionStorage.removeItem(ISSUES_KEY);
    sessionStorage.setItem(ISSUES_KEY, JSON.stringify(initialIssues));
    console.log('Issues loaded:', initialIssues.map(issue => issue.category));
}

export function getIssues() {
    const issues = sessionStorage.getItem(ISSUES_KEY);
    return issues ? JSON.parse(issues) : [];
}

export function getIssue(id) {
    const issues = getIssues();
    return issues.find(issue => issue.id === id);
}

export function getUserBets(userId) {
    const bets = sessionStorage.getItem(BETS_KEY_PREFIX + userId);
    return bets ? JSON.parse(bets) : [];
}

export function placeBet(userId, issueId, choice, amount) {
    const user = auth.getCurrentUser();
    if (!user || user.id !== userId) {
        return { success: false, message: "인증 오류" };
    }

    if (user.coins < amount) {
        return { success: false, message: "코인 부족" };
    }

    const issues = getIssues();
    const issue = issues.find(i => i.id === issueId);
    if (!issue) {
        return { success: false, message: "존재하지 않는 이슈" };
    }

    const userBets = getUserBets(userId);
    if (userBets.some(bet => bet.issueId === issueId)) {
        return { success: false, message: "이미 베팅한 이슈" };
    }

    const updatedUser = { ...user, coins: user.coins - amount };
    
    issue.totalVolume += amount;
    if(choice === 'Yes') {
        issue.yesVolume = (issue.yesVolume || 0) + amount;
    } else {
        issue.noVolume = (issue.noVolume || 0) + amount;
    }
    const totalPool = (issue.yesVolume || 0) + (issue.noVolume || 0);
    issue.yesPrice = totalPool > 0 ? Math.round(((issue.yesVolume || 0) / totalPool) * 100) : 50;
    
    sessionStorage.setItem(ISSUES_KEY, JSON.stringify(issues));

    const newBet = { issueId, choice, amount, date: new Date().toISOString() };
    userBets.push(newBet);
    sessionStorage.setItem(BETS_KEY_PREFIX + userId, JSON.stringify(userBets));

    return { success: true, updatedUser };
}
