import * as auth from '../auth.js';
import * as backend from '../backend.js';
import { CATEGORY_COLORS, MESSAGES } from '../../config/constants.js';
import { formatVolume, getCategoryImage } from '../../utils/formatters.js';

// 🔧 동적 시간 함수 (로딩 순서 독립적)
function timeUntil(endDate) {
    // 전역 함수가 있으면 우선 사용
    if (typeof window.getTimeLeft === 'function') {
        console.log('🎯 전역 getTimeLeft 함수 사용');
        return window.getTimeLeft(endDate);
    }
    
    // fallback 함수
    console.log('⚠️ fallback timeUntil 함수 사용');
    if (!endDate) return "마감";
    const now = new Date();
    const future = new Date(endDate);
    const diff = future.getTime() - now.getTime();
    if (diff <= 0) return "마감";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    if (days > 0) return `${days}일 남음`;
    if (hours > 0) return `${hours}시간 남음`;
    return `${minutes}분 남음`;
}

function formatDate(endDate) {
    // 전역 함수가 있으면 우선 사용
    if (typeof window.formatEndDate === 'function') {
        console.log('🎯 전역 formatEndDate 함수 사용');
        return window.formatEndDate(endDate);
    }
    
    // fallback 함수
    console.log('⚠️ fallback formatDate 함수 사용');
    if (!endDate) return '';
    const d = new Date(endDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'Asia/Seoul'
    }).replace(/\. /g, '.').replace(/\.$/, '').replace(/ /g, ' ');
}

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
                <div class="text-xs text-gray-500 flex items-center">
                    <i data-lucide="clock" class="w-3 h-3 mr-1.5 flex-shrink-0"></i>
                    <div class="flex flex-col leading-tight">
                        <span class="font-medium">${timeUntil(issue.end_date || issue.endDate)}</span>
                        <span class="text-gray-400 text-[10px]">${formatDate(issue.end_date || issue.endDate)}</span>
                    </div>
                </div>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4 leading-tight">${issue.title}</h3>
            
            <!-- Issue Image -->
            ${issue.image_url || issue.imageUrl ? 
                `<div class="issue-image-container mb-4">
                    <img src="${issue.image_url || issue.imageUrl}" alt="${issue.title}" loading="lazy" onerror="this.style.display='none'">
                </div>` : 
                `<img src="${getCategoryImage(issue.category)}" alt="${issue.category} 관련 이미지" class="issue-image" loading="lazy">`
            }
            
            ${issue.description ? 
                `<div class="mb-4 p-3 rounded-lg issue-description">
                    <p class="text-sm text-gray-700 leading-relaxed">${issue.description}</p>
                </div>` : ''
            }
            
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
        
        <!-- Comments Section -->
        <div class="pt-4 border-t border-gray-200/50 mt-4">
            <button class="comments-toggle-btn w-full flex items-center justify-center space-x-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors" data-issue-id="${issue.id}">
                <i data-lucide="message-circle" class="w-4 h-4 text-gray-600"></i>
                <span class="text-sm font-medium text-gray-700">토론 참여하기 <span class="text-xs text-gray-500">(${issue.commentCount || 0})</span></span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 transform transition-transform"></i>
            </button>
            <div class="comments-section hidden mt-4" data-issue-id="${issue.id}">
                <div class="comments-loading text-center py-4 text-gray-500">
                    <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto mb-2"></i>
                    <span>댓글을 불러오는 중...</span>
                </div>
                <div class="comments-container hidden"></div>
                <div class="comment-form-container hidden"></div>
            </div>
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
    const categoryColors = {
        '정치': 'background: linear-gradient(135deg, #EF4444, #F87171); color: white;',
        '스포츠': 'background: linear-gradient(135deg, #06B6D4, #67E8F9); color: white;',
        '경제': 'background: linear-gradient(135deg, #10B981, #34D399); color: white;',
        '코인': 'background: linear-gradient(135deg, #F59E0B, #FBBF24); color: white;',
        '테크': 'background: linear-gradient(135deg, #8B5CF6, #A78BFA); color: white;',
        '엔터': 'background: linear-gradient(135deg, #EC4899, #F472B6); color: white;',
        '날씨': 'background: linear-gradient(135deg, #3B82F6, #60A5FA); color: white;',
        '해외': 'background: linear-gradient(135deg, #6366F1, #8B5CF6); color: white;'
    };
    
    return categoryColors[category] || 'background: linear-gradient(135deg, #6B7280, #9CA3AF); color: white;';
}