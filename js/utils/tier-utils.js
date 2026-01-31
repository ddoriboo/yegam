// 티어 시스템 유틸리티 함수들

// 티어 데이터
export const tierData = [
    { level: 0, icon: '⚪', name: '티끌', nameEn: 'Mote', minGam: 0, maxGam: 9999 },
    { level: 1, icon: '🪨', name: '조약돌', nameEn: 'Pebble', minGam: 10000, maxGam: 24999 },
    { level: 2, icon: '⛏️', name: '원석 채굴자', nameEn: 'Miner', minGam: 25000, maxGam: 49999 },
    { level: 3, icon: '⛓️', name: '강철 연마가', nameEn: 'Steel Polisher', minGam: 50000, maxGam: 89999 },
    { level: 4, icon: '🛡️', name: '아이언 실드', nameEn: 'Iron Shield', minGam: 90000, maxGam: 149999 },
    { level: 5, icon: '⚔️', name: '스틸 소드', nameEn: 'Steel Sword', minGam: 150000, maxGam: 249999 },
    { level: 6, icon: '🥉', name: '브론즈 윙', nameEn: 'Bronze Wing', minGam: 250000, maxGam: 399999 },
    { level: 7, icon: '🥈', name: '실버 윙', nameEn: 'Silver Wing', minGam: 400000, maxGam: 649999 },
    { level: 8, icon: '🥇', name: '골드 윙', nameEn: 'Gold Wing', minGam: 650000, maxGam: 999999 },
    { level: 9, icon: '🏆', name: '플래티넘 챔피언', nameEn: 'Platinum Champion', minGam: 1000000, maxGam: 1499999 },
    { level: 10, icon: '👑', name: '황금 왕관', nameEn: 'Golden Crown', minGam: 1500000, maxGam: 2499999 },
    { level: 11, icon: '📜', name: '룬석 예언가', nameEn: 'Runestone Seer', minGam: 2500000, maxGam: 3999999 },
    { level: 12, icon: '🐉', name: '용기의 문장', nameEn: 'Crest of the Dragon', minGam: 4000000, maxGam: 6499999 },
    { level: 13, icon: '🌳', name: '세계수의 의지', nameEn: 'Will of the World Tree', minGam: 6500000, maxGam: 9999999 },
    { level: 14, icon: '⏳', name: '시간의 모래시계', nameEn: 'Hourglass of Time', minGam: 10000000, maxGam: 15999999 },
    { level: 15, icon: '📔', name: '아카식 레코드', nameEn: 'Akashic Records', minGam: 16000000, maxGam: 24999999 },
    { level: 16, icon: '✨', name: '별의 조각', nameEn: 'Stardust', minGam: 25000000, maxGam: 39999999 },
    { level: 17, icon: '☄️', name: '혜성의 인도자', nameEn: 'Comet Guide', minGam: 40000000, maxGam: 64999999 },
    { level: 18, icon: '🌟', name: '찬란한 성좌', nameEn: 'Constellation', minGam: 65000000, maxGam: 99999999 },
    { level: 19, icon: '🌌', name: '은하의 지배자', nameEn: 'Galaxy Lord', minGam: 100000000, maxGam: 149999999 },
    { level: 20, icon: '👁️‍🗨️', name: '모든 것을 보는 눈', nameEn: 'All-Seeing Eye', minGam: 150000000, maxGam: null }
];

/**
 * 사용자 GAM에 따른 티어 계산
 * @param {number} gam - 사용자의 총 GAM
 * @returns {object} 티어 정보 객체
 */
export function getUserTier(gam) {
    for (let i = tierData.length - 1; i >= 0; i--) {
        const tier = tierData[i];
        if (gam >= tier.minGam) {
            return tier;
        }
    }
    return tierData[0];
}

/**
 * 다음 티어까지 필요한 GAM 계산
 * @param {number} gam - 사용자의 총 GAM
 * @returns {object} 다음 티어 정보와 필요한 GAM
 */
export function getNextTierInfo(gam) {
    const currentTier = getUserTier(gam);
    const nextTierIndex = currentTier.level + 1;
    
    if (nextTierIndex >= tierData.length) {
        return null; // 최고 티어
    }
    
    const nextTier = tierData[nextTierIndex];
    const requiredGam = nextTier.minGam - gam;
    
    return {
        nextTier,
        requiredGam,
        progress: ((gam - currentTier.minGam) / (nextTier.minGam - currentTier.minGam)) * 100
    };
}

/**
 * 숫자를 K, M 형태로 포맷팅
 * @param {number} num - 포맷팅할 숫자
 * @returns {string} 포맷된 문자열
 */
export function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}

/**
 * 티어 표시 HTML 생성
 * @param {object} tier - 티어 정보 객체
 * @param {boolean} showName - 티어 이름 표시 여부
 * @returns {string} HTML 문자열
 */
export function createTierDisplay(tier, showName = true) {
    let tierClass = '';
    
    // 티어 레벨에 따른 특별 스타일
    if (tier.level >= 15) tierClass = 'tier-legendary';
    if (tier.level >= 18) tierClass = 'tier-mythic';
    if (tier.level >= 20) tierClass = 'tier-god';
    
    return `
        <div class="tier-display ${tierClass}" title="${tier.name} (${tier.nameEn})">
            <span class="tier-icon" style="font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;">${tier.icon}</span>
            ${showName ? `<span class="tier-name">${tier.name}</span>` : ''}
        </div>
    `;
}

/**
 * 사용자 정보에 티어 표시 업데이트
 * @param {number} gam - 사용자의 총 GAM
 * @param {string} targetElementId - 업데이트할 엘리먼트 ID
 */
export function updateUserTierDisplay(gam, targetElementId) {
    const element = document.getElementById(targetElementId);
    if (!element) return;
    
    const tier = getUserTier(gam);
    const nextTierInfo = getNextTierInfo(gam);
    
    let html = createTierDisplay(tier, true);
    
    // 다음 티어 정보 추가
    if (nextTierInfo) {
        html += `
            <div class="tier-progress" title="다음 등급까지 ${formatNumber(nextTierInfo.requiredGam)} GAM 필요">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(nextTierInfo.progress, 100)}%"></div>
                </div>
                <span class="progress-text">${Math.round(nextTierInfo.progress)}%</span>
            </div>
        `;
    }
    
    element.innerHTML = html;
}

/**
 * 티어 관련 CSS 추가
 */
export function addTierStyles() {
    if (document.getElementById('tier-styles')) return; // 이미 추가됨
    
    const style = document.createElement('style');
    style.id = 'tier-styles';
    style.textContent = `
        * {
            box-sizing: border-box;
        }
        
        body {
            overflow-x: hidden;
            width: 100%;
        }
        
        .tier-display {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0.5rem;
            border-radius: 0.5rem;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: fit-content;
            white-space: nowrap;
            flex-shrink: 0;
        }
        
        .tier-icon {
            font-size: 1.2rem;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        
        .tier-name {
            font-size: 0.875rem;
            font-weight: 600;
            color: #374151;
        }
        
        .tier-legendary {
            background: linear-gradient(135deg, rgba(253, 121, 168, 0.3), rgba(253, 203, 110, 0.3));
            animation: tier-legendary 3s ease-in-out infinite alternate;
        }
        
        .tier-mythic {
            background: linear-gradient(135deg, rgba(108, 92, 231, 0.3), rgba(162, 155, 254, 0.3));
            animation: tier-mythic 4s ease-in-out infinite alternate;
        }
        
        .tier-god {
            background: linear-gradient(135deg, rgba(240, 147, 251, 0.4), rgba(245, 87, 108, 0.4), rgba(79, 172, 254, 0.4));
            animation: tier-god 5s ease-in-out infinite;
        }
        
        @keyframes tier-legendary {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(60deg); }
        }
        
        @keyframes tier-mythic {
            0% { filter: hue-rotate(0deg) brightness(1); }
            50% { filter: hue-rotate(120deg) brightness(1.1); }
            100% { filter: hue-rotate(240deg) brightness(1); }
        }
        
        @keyframes tier-god {
            0%, 100% { filter: hue-rotate(0deg) brightness(1); }
            25% { filter: hue-rotate(90deg) brightness(1.2); }
            50% { filter: hue-rotate(180deg) brightness(1.1); }
            75% { filter: hue-rotate(270deg) brightness(1.15); }
        }
        
        .tier-progress {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-left: 0.5rem;
        }
        
        .progress-bar {
            width: 50px;
            height: 4px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 2px;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            transition: width 0.3s ease;
        }
        
        .progress-text {
            font-size: 0.75rem;
            color: #6b7280;
            font-weight: 500;
        }
    `;
    
    document.head.appendChild(style);
}