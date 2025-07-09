import * as auth from '../auth.js';
import * as backend from '../backend.js';
import { MESSAGES } from '../../config/constants.js';
import { updateCardAfterBet } from './issue-card.js';
import { updateUserWallet } from './header.js';
import { forceGamUpdate, verifyAndRetryGamUpdate } from '../utils/dom-updater.js';

export function setupBettingEventListeners() {
    const grid = document.querySelector('#popular-issues-grid, #all-issues-grid');
    if (grid) {
        grid.addEventListener('click', handleBettingClick);
    }
}

function handleBettingClick(event) {
    const betButton = event.target.closest('.bet-btn');
    if (!betButton || betButton.disabled) return;

    if (!auth.isLoggedIn()) {
        alert(MESSAGES.ERROR.LOGIN_REQUIRED);
        window.location.href = 'login.html';
        return;
    }

    const card = betButton.closest('.issue-card');
    const issueId = parseInt(card.dataset.id);
    const choice = betButton.dataset.choice;
    placeBet(issueId, choice, card);
}

async function placeBet(issueId, choice, cardElement) {
    const user = auth.getCurrentUser();
    const amountStr = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\\n보유 GAM: ${user.gam_balance.toLocaleString()}`, "100");

    if (amountStr === null) return;
    const amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) {
        alert(MESSAGES.ERROR.INVALID_AMOUNT);
        return;
    }
    
    if (amount > user.gam_balance) {
        alert('보유 GAM이 부족합니다.');
        return;
    }

    try {
        console.log('🎯 베팅 시작:', { userId: user.id, issueId, choice, amount, currentBalance: user.gam_balance });
        
        const result = await backend.placeBet(user.id, issueId, choice, amount);
        
        console.log('🔄 베팅 API 응답:', result);

        if (result.success) {
            console.log('✅ 베팅 성공 - 업데이트 시작');
            
            const newBalance = result.updatedUser.gam_balance;
            console.log('💰 새로운 GAM 잔액:', newBalance, '(이전:', user.gam_balance, ')');
            
            // 1. 업데이트된 사용자 정보 생성
            const updatedUser = { ...user, gam_balance: newBalance };
            
            // 2. 강제 GAM 업데이트 실행 (모든 방법 동원)
            console.log('🚀 강제 GAM 업데이트 시작...');
            forceGamUpdate(newBalance, updatedUser);
            
            // 3. 기존 업데이트 방법들도 병행 실행 (이중 보장)
            auth.updateUserInSession(updatedUser);
            localStorage.setItem('yegame-user', JSON.stringify(updatedUser));
            
            // 4. 전역 상태 업데이트
            if (window.updateCurrentUser) {
                console.log('🔄 전역 사용자 정보 업데이트 호출');
                window.updateCurrentUser(updatedUser);
            }
            
            // 5. 헤더 업데이트
            updateUserWallet(newBalance);
            if (window.forceUpdateHeader) {
                console.log('🔄 헤더 강제 업데이트 호출');
                window.forceUpdateHeader();
            }
            
            // 6. 카드 UI 업데이트
            updateCardAfterBet(cardElement, choice, amount);
            
            // 7. 검증 및 재시도 (100ms, 300ms, 500ms 후)
            verifyAndRetryGamUpdate(newBalance, 100);
            verifyAndRetryGamUpdate(newBalance, 300);
            verifyAndRetryGamUpdate(newBalance, 500);
            
            alert(MESSAGES.SUCCESS.BET_PLACED);
        } else {
            console.error('❌ 베팅 실패:', result.message);
            alert(`${MESSAGES.ERROR.BETTING_FAILED}: ${result.message}`);
        }
    } catch (error) {
        console.error('💥 베팅 처리 오류:', error);
        alert('베팅 처리 중 오류가 발생했습니다.');
    }
}

