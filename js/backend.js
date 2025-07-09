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

export async function placeBet(userId, issueId, choice, amount) {
    try {
        const token = localStorage.getItem('yegame-token');
        if (!token) {
            return { success: false, message: "로그인이 필요합니다." };
        }

        const response = await fetch('/api/bets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                issueId,
                choice,
                amount
            })
        });

        const data = await response.json();
        
        if (data.success) {
            // 사용자 정보 업데이트
            return { 
                success: true, 
                updatedUser: {
                    gam_balance: data.updatedUser.gam_balance
                },
                updatedIssue: data.updatedIssue
            };
        } else {
            return { success: false, message: data.message };
        }
        
    } catch (error) {
        console.error('베팅 API 호출 오류:', error);
        return { success: false, message: "베팅 처리 중 오류가 발생했습니다." };
    }
}
