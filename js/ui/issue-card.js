import * as auth from '../auth.js';
import * as backend from '../backend.js';
import { CATEGORY_COLORS, MESSAGES } from '../../config/constants.js';
import { formatVolume, timeUntil, getCategoryImage } from '../../utils/formatters.js';

export function createIssueCard(issue) {
    const yesPrice = issue.yesPrice;
    const noPrice = 100 - yesPrice;
    let userBetDisplay = '';
    
    if (auth.isLoggedIn()) {
        const user = auth.getCurrentUser();
        const userBets = backend.getUserBets(user.id);
        const existingBet = userBets.find(b => b.issueId === issue.id);
        if (existingBet) {
            userBetDisplay = `<div class="bet-feedback mt-4 text-center text-sm text-green-400 font-semibold"><strong>${existingBet.choice}</strong>에 <strong>${existingBet.amount.toLocaleString()}</strong> 감 예측 완료.</div>`;
        }
    }

    return `
    <div class="issue-card" data-id="${issue.id}">
        <div class="flex-grow">
            <div class="flex justify-between items-start mb-4">
                <span style="${getCategoryBadgeStyle(issue.category)} padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">${issue.category}</span>
                <span class="text-xs text-gray-500 flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1.5"></i>
                    ${timeUntil(issue.endDate)}
                </span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 leading-tight">${issue.title}</h3>
            
            <!-- Issue Image -->
            <img src="${getCategoryImage(issue.category)}" alt="${issue.category} 관련 이미지" class="issue-image" loading="lazy">
            
            <!-- Prediction Prices -->
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center space-x-2">
                    <span class="text-sm font-medium text-green-600">Yes</span>
                    <span class="text-lg font-bold text-green-600">${yesPrice}%</span>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-lg font-bold text-red-500">${noPrice}%</span>
                    <span class="text-sm font-medium text-red-500">No</span>
                </div>
            </div>
            
            <!-- Prediction Gauge -->
            <div class="relative mb-6">
                <div style="background: linear-gradient(90deg, #10B981 0%, #EF4444 100%); border-radius: 12px; height: 8px; position: relative; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1); width: 100%;">
                    <div style="position: absolute; top: -2px; left: calc(${yesPrice}% - 6px); width: 12px; height: 12px; background: white; border: 2px solid #3B82F6; border-radius: 50%; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); z-index: 10;"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-400 mt-2">
                    <span>${yesPrice}% Yes</span>
                    <span>${noPrice}% No</span>
                </div>
            </div>
        </div>
        
        <!-- Prediction Buttons -->
        <div class="mb-6">
            <div class="bet-controls ${userBetDisplay ? 'hidden' : ''}">
                <div class="flex space-x-3">
                    <button data-choice="Yes" class="bet-btn w-full" style="background: linear-gradient(135deg, #10B981, #059669); color: white; border: none; border-radius: 12px; padding: 0.875rem 1.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); transition: all 0.2s ease; position: relative; overflow: hidden;">
                        <span style="position: relative; z-index: 10;">Yes ${yesPrice}%</span>
                    </button>
                    <button data-choice="No" class="bet-btn w-full" style="background: linear-gradient(135deg, #EF4444, #DC2626); color: white; border: none; border-radius: 12px; padding: 0.875rem 1.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); transition: all 0.2s ease; position: relative; overflow: hidden;">
                        <span style="position: relative; z-index: 10;">No ${noPrice}%</span>
                    </button>
                </div>
            </div>
            ${userBetDisplay || '<div class="bet-feedback"></div>'}
        </div>
        
        <!-- Volume Info -->
        <div class="pt-4 border-t border-gray-200/50 flex justify-between items-center">
            <span class="volume-display">총 참여 감</span>
            <span class="font-semibold text-gray-900 flex items-center">
                 <i data-lucide="coins" class="w-4 h-4 mr-2 text-yellow-500"></i>
                ${formatVolume(issue.totalVolume)}
            </span>
        </div>
    </div>
    `;
}

export function updateCardAfterBet(cardElement, choice, amount) {
    const betControls = cardElement.querySelector('.bet-controls');
    const feedbackEl = cardElement.querySelector('.bet-feedback');
    
    if (betControls) betControls.classList.add('hidden');
    if (feedbackEl) {
        feedbackEl.innerHTML = `<strong>${choice}</strong>에 <strong>${amount.toLocaleString()}</strong> 감 예측 완료.`;
        feedbackEl.className = 'bet-feedback mt-4 text-center text-sm text-green-400 font-semibold';
    }
    
    const buttons = cardElement.querySelectorAll('.bet-btn');
    buttons.forEach(btn => btn.disabled = true);
}

function getCategoryBadgeStyle(category) {
    return CATEGORY_COLORS[category] || 'background: #F3F4F6; color: #6B7280;';
}