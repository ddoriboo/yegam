import * as auth from '../auth.js';
import * as backend from '../backend.js';
import { MESSAGES } from '../../config/constants.js';
import { updateCardAfterBet } from './issue-card.js';

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
        const result = await backend.placeBet(user.id, issueId, choice, amount);

        if (result.success) {
            alert(MESSAGES.SUCCESS.BET_PLACED);
            
            // 사용자 정보 업데이트
            const updatedUser = { ...user, gam_balance: result.updatedUser.gam_balance };
            auth.updateUserInSession(updatedUser);
            updateUserWallet();
            updateCardAfterBet(cardElement, choice, amount);
            
            // 전역 사용자 정보도 업데이트
            if (window.updateCurrentUser) {
                window.updateCurrentUser(updatedUser);
            }
            
            // 헤더 강제 업데이트
            if (window.forceUpdateHeader) {
                window.forceUpdateHeader();
            }
        } else {
            alert(`${MESSAGES.ERROR.BETTING_FAILED}: ${result.message}`);
        }
    } catch (error) {
        console.error('베팅 처리 오류:', error);
        alert('베팅 처리 중 오류가 발생했습니다.');
    }
}

function updateUserWallet() {
    const userCoinsEl = document.getElementById('user-coins');
    if (userCoinsEl && auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userCoinsEl.textContent = user.gam_balance.toLocaleString();
    }
}