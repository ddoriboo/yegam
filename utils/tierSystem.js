// 예겜 티어 시스템
// 롤 스타일의 7단계 티어 시스템 구현

// 티어 정의
const TIERS = [
    {
        name: '신참',
        icon: '🔰',
        minGam: 0,
        maxGam: 4999,
        color: '#10B981', // 초록색
        bgColor: '#ECFDF5',
        borderColor: '#D1FAE5'
    },
    {
        name: '일반',
        icon: '🥉',
        minGam: 5000,
        maxGam: 9999,
        color: '#CD7F32', // 갈색/구리색
        bgColor: '#FEF3E2',
        borderColor: '#FDE68A'
    },
    {
        name: '베테랑',
        icon: '🥈',
        minGam: 10000,
        maxGam: 19999,
        color: '#6B7280', // 은색
        bgColor: '#F9FAFB',
        borderColor: '#E5E7EB'
    },
    {
        name: '전문가',
        icon: '🥇',
        minGam: 20000,
        maxGam: 39999,
        color: '#F59E0B', // 금색
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        name: '달인',
        icon: '💎',
        minGam: 40000,
        maxGam: 79999,
        color: '#06B6D4', // 청록색
        bgColor: '#ECFEFF',
        borderColor: '#CFFAFE'
    },
    {
        name: '고수',
        icon: '👑',
        minGam: 80000,
        maxGam: 159999,
        color: '#8B5CF6', // 보라색
        bgColor: '#F3F4F6',
        borderColor: '#E0E7FF'
    },
    {
        name: '전설',
        icon: '⭐',
        minGam: 160000,
        maxGam: Infinity,
        color: '#EF4444', // 빨간색
        bgColor: '#FEF2F2',
        borderColor: '#FECACA'
    }
];

/**
 * GAM 포인트를 기반으로 사용자 티어를 계산
 * @param {number} gamAmount - 사용자의 총 GAM 포인트
 * @returns {Object} 티어 정보 객체
 */
function calculateTier(gamAmount) {
    const tier = TIERS.find(tier => 
        gamAmount >= tier.minGam && gamAmount <= tier.maxGam
    );
    
    if (!tier) {
        // 기본값으로 첫 번째 티어 반환
        return { ...TIERS[0], gamAmount };
    }
    
    // 다음 티어까지 필요한 GAM 계산
    const nextTierIndex = TIERS.findIndex(t => t.name === tier.name) + 1;
    const nextTier = TIERS[nextTierIndex];
    const nextTierGam = nextTier ? nextTier.minGam : null;
    const remainingGam = nextTierGam ? nextTierGam - gamAmount : 0;
    
    // 현재 티어 내에서의 진행률 계산
    const tierProgress = tier.maxGam === Infinity ? 100 : 
        ((gamAmount - tier.minGam) / (tier.maxGam - tier.minGam + 1)) * 100;
    
    return {
        ...tier,
        gamAmount,
        nextTier: nextTier?.name || null,
        nextTierGam,
        remainingGam: Math.max(0, remainingGam),
        progress: Math.min(100, Math.max(0, tierProgress)),
        tierIndex: TIERS.findIndex(t => t.name === tier.name)
    };
}

/**
 * 티어 뱃지 HTML 생성
 * @param {Object} tierInfo - calculateTier()에서 반환된 티어 정보
 * @param {string} size - 'sm', 'md', 'lg' 중 하나 (기본값: 'md')
 * @returns {string} HTML 문자열
 */
function generateTierBadge(tierInfo, size = 'md') {
    const sizes = {
        sm: {
            container: 'px-2 py-1 text-xs',
            icon: 'text-sm',
            text: 'text-xs'
        },
        md: {
            container: 'px-3 py-1.5 text-sm',
            icon: 'text-base',
            text: 'text-sm'
        },
        lg: {
            container: 'px-4 py-2 text-base',
            icon: 'text-lg',
            text: 'text-base'
        }
    };
    
    const sizeClass = sizes[size] || sizes.md;
    
    return `
        <div class="inline-flex items-center space-x-1 rounded-full font-semibold ${sizeClass.container}"
             style="color: ${tierInfo.color}; background-color: ${tierInfo.bgColor}; border: 1px solid ${tierInfo.borderColor};">
            <span class="${sizeClass.icon}">${tierInfo.icon}</span>
            <span class="${sizeClass.text}">${tierInfo.name}</span>
        </div>
    `;
}

/**
 * 티어 프로그레스 바 HTML 생성
 * @param {Object} tierInfo - calculateTier()에서 반환된 티어 정보
 * @returns {string} HTML 문자열
 */
function generateTierProgress(tierInfo) {
    if (tierInfo.name === '전설') {
        return `
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="h-2 rounded-full" style="width: 100%; background-color: ${tierInfo.color};">
                </div>
            </div>
            <div class="flex justify-between text-xs text-gray-600 mt-1">
                <span>최고 티어 달성!</span>
                <span>${tierInfo.gamAmount.toLocaleString()} GAM</span>
            </div>
        `;
    }
    
    return `
        <div class="w-full bg-gray-200 rounded-full h-2">
            <div class="h-2 rounded-full transition-all duration-300" 
                 style="width: ${tierInfo.progress}%; background-color: ${tierInfo.color};">
            </div>
        </div>
        <div class="flex justify-between text-xs text-gray-600 mt-1">
            <span>${tierInfo.gamAmount.toLocaleString()} GAM</span>
            <span>${tierInfo.nextTier ? `${tierInfo.nextTier}까지 ${tierInfo.remainingGam.toLocaleString()} GAM` : '최고 티어!'}</span>
        </div>
    `;
}

/**
 * 모든 티어 목록 반환
 * @returns {Array} 전체 티어 배열
 */
function getAllTiers() {
    return [...TIERS];
}

/**
 * 특정 티어의 요구 조건 반환
 * @param {string} tierName - 티어 이름
 * @returns {Object|null} 티어 정보 또는 null
 */
function getTierRequirements(tierName) {
    return TIERS.find(tier => tier.name === tierName) || null;
}

// Node.js와 브라우저 환경 모두 지원
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateTier,
        generateTierBadge,
        generateTierProgress,
        getAllTiers,
        getTierRequirements,
        TIERS
    };
} else {
    // 브라우저 환경에서는 전역 객체로 노출
    window.TierSystem = {
        calculateTier,
        generateTierBadge,
        generateTierProgress,
        getAllTiers,
        getTierRequirements,
        TIERS
    };
}