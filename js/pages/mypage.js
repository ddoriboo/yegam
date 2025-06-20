import * as auth from '../auth.js';
import { getUserTier, getNextTierInfo, formatNumber, createTierDisplay, addTierStyles } from '../utils/tier-utils.js';

export async function renderMyPage() {
    // 티어 스타일 추가
    addTierStyles();
    
    if (!auth.isLoggedIn()) {
        window.location.href = 'login.html';
        return;
    }

    const user = auth.getCurrentUser();
    if (!user) return;

    // 사용자 기본 정보 표시
    updateUserProfile(user);
    
    // 티어 정보 표시
    updateTierInfo(user);
    
    // 베팅 기록 로드
    await loadUserBets();
}

function updateUserProfile(user) {
    const userNameEl = document.getElementById('user-name');
    const userEmailEl = document.getElementById('user-email');
    const userCoinsEl = document.getElementById('user-coins');
    const userJoinedEl = document.getElementById('user-joined');

    if (userNameEl) userNameEl.textContent = user.username;
    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userCoinsEl) userCoinsEl.textContent = `${(user.coins || 0).toLocaleString()} GAM`;
    
    if (userJoinedEl && user.created_at) {
        const joinDate = new Date(user.created_at).toLocaleDateString('ko-KR');
        userJoinedEl.textContent = `가입일: ${joinDate}`;
    }
}

function updateTierInfo(user) {
    const userGam = user.coins || 0;
    const currentTier = getUserTier(userGam);
    const nextTierInfo = getNextTierInfo(userGam);
    
    // 이름 옆 티어 배지 표시
    const tierBadgeEl = document.getElementById('user-tier-badge');
    if (tierBadgeEl) {
        tierBadgeEl.innerHTML = createTierDisplay(currentTier, false);
        tierBadgeEl.classList.add('tier-display-large');
    }
    
    // 상세 티어 진행률 섹션 표시
    const tierProgressEl = document.getElementById('tier-progress-section');
    if (tierProgressEl) {
        let progressHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <div class="flex items-center space-x-4">
                        <div class="current-tier-display">
                            ${createTierDisplay(currentTier, true)}
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">현재 등급</p>
                            <p class="text-lg font-semibold text-gray-900">레벨 ${currentTier.level}</p>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg p-4 border border-gray-200">
                        <p class="text-sm text-gray-600 mb-1">보유 GAM</p>
                        <p class="text-2xl font-bold text-blue-600">${formatNumber(userGam)}</p>
                    </div>
                </div>
        `;
        
        if (nextTierInfo) {
            const progressPercent = Math.min(nextTierInfo.progress, 100);
            progressHtml += `
                <div class="space-y-4">
                    <div class="flex items-center space-x-4">
                        <div class="next-tier-display opacity-70">
                            ${createTierDisplay(nextTierInfo.nextTier, true)}
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">다음 등급</p>
                            <p class="text-lg font-semibold text-gray-900">레벨 ${nextTierInfo.nextTier.level}</p>
                        </div>
                    </div>
                    
                    <div class="bg-white rounded-lg p-4 border border-gray-200">
                        <div class="flex justify-between items-center mb-2">
                            <p class="text-sm text-gray-600">다음 등급까지</p>
                            <p class="text-sm font-semibold text-purple-600">${Math.round(progressPercent)}%</p>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
                            <div class="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500" 
                                 style="width: ${progressPercent}%"></div>
                        </div>
                        <p class="text-sm text-gray-600">
                            <span class="font-semibold text-red-500">${formatNumber(nextTierInfo.requiredGam)}</span> GAM 더 필요
                        </p>
                    </div>
                </div>
            `;
        } else {
            progressHtml += `
                <div class="space-y-4">
                    <div class="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg p-6 text-center">
                        <div class="text-4xl mb-2">🏆</div>
                        <p class="text-white font-bold text-lg">최고 등급 달성!</p>
                        <p class="text-yellow-100 text-sm mt-1">당신은 예측의 신입니다</p>
                    </div>
                </div>
            `;
        }
        
        progressHtml += '</div>';
        
        // 등급별 특별 메시지 추가
        let specialMessage = '';
        if (currentTier.level >= 20) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">✨ 모든 것을 보는 눈 ✨</p>
                    <p class="text-purple-100 text-sm">전설 속의 존재가 되었습니다!</p>
                </div>
            `;
        } else if (currentTier.level >= 15) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-yellow-500 to-red-500 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">🌟 전설 등급 달성! 🌟</p>
                    <p class="text-yellow-100 text-sm">놀라운 예측 능력을 보여주고 있습니다!</p>
                </div>
            `;
        } else if (currentTier.level >= 10) {
            specialMessage = `
                <div class="mt-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-4 text-center">
                    <p class="text-white font-semibold">👑 고급 등급 달성!</p>
                    <p class="text-blue-100 text-sm">뛰어난 통찰력을 인정받았습니다!</p>
                </div>
            `;
        }
        
        progressHtml += specialMessage;
        tierProgressEl.innerHTML = progressHtml;
    }
}

async function loadUserBets() {
    try {
        const response = await fetch('/api/bets/my-bets', {
            headers: {
                'Authorization': `Bearer ${auth.getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.bets) {
            updateBetStats(data.bets);
            renderBetHistory(data.bets);
        }
    } catch (error) {
        console.error('베팅 기록 로드 실패:', error);
    }
}

function updateBetStats(bets) {
    const totalBetsEl = document.getElementById('total-bets');
    const winRateEl = document.getElementById('win-rate');
    const totalRewardEl = document.getElementById('total-reward');
    
    if (totalBetsEl) totalBetsEl.textContent = bets.length;
    
    // 승률 계산 (결과가 나온 베팅만)
    const resolvedBets = bets.filter(bet => bet.result);
    const wonBets = resolvedBets.filter(bet => bet.choice === bet.result);
    const winRate = resolvedBets.length > 0 ? (wonBets.length / resolvedBets.length * 100) : 0;
    
    if (winRateEl) winRateEl.textContent = `${winRate.toFixed(1)}%`;
    
    // 총 보상 계산
    const totalReward = wonBets.reduce((sum, bet) => sum + (bet.reward || 0), 0);
    if (totalRewardEl) totalRewardEl.textContent = `${totalReward.toLocaleString()} GAM`;
}

function renderBetHistory(bets) {
    const betHistoryEl = document.getElementById('bet-history');
    if (!betHistoryEl) return;
    
    if (bets.length === 0) {
        betHistoryEl.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-4 text-gray-400"></i>
                <p>아직 예측 기록이 없습니다.</p>
                <a href="/" class="text-blue-600 hover:text-blue-700 font-medium">첫 예측하러 가기</a>
            </div>
        `;
        return;
    }
    
    const betHistoryHtml = bets.map(bet => {
        const statusClass = bet.result 
            ? (bet.choice === bet.result ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')
            : 'bg-yellow-100 text-yellow-800';
        
        const statusText = bet.result 
            ? (bet.choice === bet.result ? '성공' : '실패')
            : '진행중';
            
        return `
            <div class="bg-white rounded-lg border border-gray-200 p-4">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-medium text-gray-900 flex-1">${bet.issue_title}</h4>
                    <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">
                        ${statusText}
                    </span>
                </div>
                <div class="flex justify-between text-sm text-gray-600">
                    <span>선택: <strong>${bet.choice}</strong></span>
                    <span>베팅: ${bet.amount.toLocaleString()} GAM</span>
                </div>
                ${bet.reward ? `
                    <div class="mt-2 text-sm">
                        <span class="text-green-600 font-medium">보상: +${bet.reward.toLocaleString()} GAM</span>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    betHistoryEl.innerHTML = betHistoryHtml;
}

// 큰 티어 표시용 스타일 추가
function addMypageStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .tier-display-large .tier-icon {
            font-size: 1.5rem;
        }
        
        .tier-display-large .tier-name {
            font-size: 1rem;
            font-weight: 700;
        }
        
        .current-tier-display .tier-display {
            padding: 0.75rem 1rem;
            border-width: 2px;
        }
        
        .current-tier-display .tier-icon {
            font-size: 1.75rem;
        }
        
        .current-tier-display .tier-name {
            font-size: 1.1rem;
            font-weight: 700;
        }
    `;
    document.head.appendChild(style);
}

// 페이지 로드 시 스타일 추가
document.addEventListener('DOMContentLoaded', () => {
    addMypageStyles();
});