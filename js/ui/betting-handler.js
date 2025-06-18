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

function placeBet(issueId, choice, cardElement) {
    const user = auth.getCurrentUser();
    const amountStr = prompt(`'${choice}'에 얼마나 예측하시겠습니까?\\n보유 감: ${user.coins.toLocaleString()}`, "100");

    if (amountStr === null) return;
    const amount = parseInt(amountStr);

    if (isNaN(amount) || amount <= 0) {
        alert(MESSAGES.ERROR.INVALID_AMOUNT);
        return;
    }
    
    if (amount > user.coins) {
        alert(MESSAGES.ERROR.INSUFFICIENT_COINS);
        return;
    }

    const result = backend.placeBet(user.id, issueId, choice, amount);

    if (result.success) {
        alert(MESSAGES.SUCCESS.BET_PLACED);
        auth.updateUserInSession(result.updatedUser);
        updateUserWallet();
        updateCardAfterBet(cardElement, choice, amount);
    } else {
        alert(`${MESSAGES.ERROR.BETTING_FAILED}: ${result.message}`);
    }
}

function updateUserWallet() {
    const userCoinsEl = document.getElementById('user-coins');
    if (userCoinsEl && auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        userCoinsEl.textContent = user.coins.toLocaleString();
    }
}