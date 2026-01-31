// 예겜 티어 시스템
// 21단계 티어 시스템 (등급 안내 페이지와 일치)

// 티어 정의 - 등급 안내 페이지와 완전히 동일
const TIERS = [
    {
        level: 0,
        name: '티끌',
        nameEn: 'Mote',
        icon: '⚪',
        minGam: 0,
        maxGam: 9999,
        color: '#6B7280',
        bgColor: '#F9FAFB',
        borderColor: '#E5E7EB'
    },
    {
        level: 1,
        name: '조약돌',
        nameEn: 'Pebble',
        icon: '🔘',
        minGam: 10000,
        maxGam: 24999,
        color: '#78716C',
        bgColor: '#F5F5F4',
        borderColor: '#E7E5E4'
    },
    {
        level: 2,
        name: '원석 채굴자',
        nameEn: 'Miner',
        icon: '⛏️',
        minGam: 25000,
        maxGam: 49999,
        color: '#A16207',
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        level: 3,
        name: '강철 연마가',
        nameEn: 'Steel Polisher',
        icon: '🔗',
        minGam: 50000,
        maxGam: 89999,
        color: '#475569',
        bgColor: '#F8FAFC',
        borderColor: '#E2E8F0'
    },
    {
        level: 4,
        name: '아이언 실드',
        nameEn: 'Iron Shield',
        icon: '🛡️',
        minGam: 90000,
        maxGam: 149999,
        color: '#6B7280',
        bgColor: '#F9FAFB',
        borderColor: '#E5E7EB'
    },
    {
        level: 5,
        name: '스틸 소드',
        nameEn: 'Steel Sword',
        icon: '⚔️',
        minGam: 150000,
        maxGam: 249999,
        color: '#374151',
        bgColor: '#F9FAFB',
        borderColor: '#D1D5DB'
    },
    {
        level: 6,
        name: '브론즈 윙',
        nameEn: 'Bronze Wing',
        icon: '🥉',
        minGam: 250000,
        maxGam: 399999,
        color: '#CD7F32',
        bgColor: '#FEF3E2',
        borderColor: '#FDE68A'
    },
    {
        level: 7,
        name: '실버 윙',
        nameEn: 'Silver Wing',
        icon: '🥈',
        minGam: 400000,
        maxGam: 649999,
        color: '#6B7280',
        bgColor: '#F9FAFB',
        borderColor: '#E5E7EB'
    },
    {
        level: 8,
        name: '골드 윙',
        nameEn: 'Gold Wing',
        icon: '🥇',
        minGam: 650000,
        maxGam: 999999,
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        level: 9,
        name: '플래티넘 챔피언',
        nameEn: 'Platinum Champion',
        icon: '🏆',
        minGam: 1000000,
        maxGam: 1499999,
        color: '#06B6D4',
        bgColor: '#ECFEFF',
        borderColor: '#CFFAFE'
    },
    {
        level: 10,
        name: '황금 왕관',
        nameEn: 'Golden Crown',
        icon: '👑',
        minGam: 1500000,
        maxGam: 2499999,
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        level: 11,
        name: '룬석 예언가',
        nameEn: 'Runestone Seer',
        icon: '📜',
        minGam: 2500000,
        maxGam: 3999999,
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        borderColor: '#E0E7FF'
    },
    {
        level: 12,
        name: '용기의 문장',
        nameEn: 'Crest of the Dragon',
        icon: '🐉',
        minGam: 4000000,
        maxGam: 6499999,
        color: '#EF4444',
        bgColor: '#FEF2F2',
        borderColor: '#FECACA'
    },
    {
        level: 13,
        name: '세계수의 의지',
        nameEn: 'Will of the World Tree',
        icon: '🌳',
        minGam: 6500000,
        maxGam: 9999999,
        color: '#10B981',
        bgColor: '#ECFDF5',
        borderColor: '#D1FAE5'
    },
    {
        level: 14,
        name: '시간의 모래시계',
        nameEn: 'Hourglass of Time',
        icon: '⏳',
        minGam: 10000000,
        maxGam: 15999999,
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        level: 15,
        name: '아카식 레코드',
        nameEn: 'Akashic Records',
        icon: '📔',
        minGam: 16000000,
        maxGam: 24999999,
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        borderColor: '#E0E7FF'
    },
    {
        level: 16,
        name: '별의 조각',
        nameEn: 'Stardust',
        icon: '✨',
        minGam: 25000000,
        maxGam: 39999999,
        color: '#EC4899',
        bgColor: '#FDF2F8',
        borderColor: '#FBCFE8'
    },
    {
        level: 17,
        name: '혜성의 인도자',
        nameEn: 'Comet Guide',
        icon: '☄️',
        minGam: 40000000,
        maxGam: 64999999,
        color: '#06B6D4',
        bgColor: '#ECFEFF',
        borderColor: '#CFFAFE'
    },
    {
        level: 18,
        name: '찬란한 성좌',
        nameEn: 'Constellation',
        icon: '🌟',
        minGam: 65000000,
        maxGam: 99999999,
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        borderColor: '#FEF3C7'
    },
    {
        level: 19,
        name: '은하의 지배자',
        nameEn: 'Galaxy Lord',
        icon: '🌌',
        minGam: 100000000,
        maxGam: 149999999,
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        borderColor: '#E0E7FF'
    },
    {
        level: 20,
        name: '모든 것을 보는 눈',
        nameEn: 'All-Seeing Eye',
        icon: '🔮',
        minGam: 150000000,
        maxGam: null,
        color: '#EF4444',
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
    // 21단계 시스템에서 사용자 티어 찾기
    let tier = null;
    for (let i = TIERS.length - 1; i >= 0; i--) {
        const currentTier = TIERS[i];
        if (gamAmount >= currentTier.minGam) {
            // maxGam이 null인 경우 (최고 티어) 또는 maxGam 범위 내인 경우
            if (currentTier.maxGam === null || gamAmount <= currentTier.maxGam) {
                tier = currentTier;
                break;
            }
        }
    }
    
    if (!tier) {
        // 기본값으로 첫 번째 티어 반환
        tier = TIERS[0];
    }
    
    // 다음 티어까지 필요한 GAM 계산
    const currentTierIndex = TIERS.findIndex(t => t.level === tier.level);
    const nextTierIndex = currentTierIndex + 1;
    const nextTier = nextTierIndex < TIERS.length ? TIERS[nextTierIndex] : null;
    const nextTierGam = nextTier ? nextTier.minGam : null;
    const remainingGam = nextTierGam ? Math.max(0, nextTierGam - gamAmount) : 0;
    
    // 현재 티어 내에서의 진행률 계산
    let tierProgress = 0;
    if (tier.maxGam === null) {
        // 최고 티어인 경우 100%
        tierProgress = 100;
    } else {
        // 일반 티어인 경우 진행률 계산
        const tierRange = tier.maxGam - tier.minGam + 1;
        const currentProgress = gamAmount - tier.minGam;
        tierProgress = (currentProgress / tierRange) * 100;
    }
    
    return {
        ...tier,
        gamAmount,
        nextTier: nextTier?.name || null,
        nextTierGam,
        remainingGam,
        progress: Math.min(100, Math.max(0, tierProgress)),
        tierIndex: currentTierIndex
    };
}

/**
 * 티어 아이콘만 생성 (원형)
 * @param {Object} tierInfo - calculateTier()에서 반환된 티어 정보
 * @param {string} size - 'sm', 'md', 'lg' 중 하나 (기본값: 'md')
 * @returns {string} HTML 문자열
 */
function generateTierIcon(tierInfo, size = 'md') {
    const sizes = {
        sm: {
            container: 'w-6 h-6 text-xs',
            icon: 'text-sm'
        },
        md: {
            container: 'w-8 h-8 text-sm',
            icon: 'text-base'
        },
        lg: {
            container: 'w-12 h-12 text-base',
            icon: 'text-2xl'
        }
    };
    
    const sizeClass = sizes[size] || sizes.md;
    
    return `
        <div class="inline-flex items-center justify-center ${sizeClass.container} rounded-full font-semibold"
             style="color: ${tierInfo.color}; background-color: ${tierInfo.bgColor}; border: 2px solid ${tierInfo.borderColor};"
             title="${tierInfo.name} (${tierInfo.gamAmount.toLocaleString()} GAM)">
            <span class="${sizeClass.icon} tier-icon">${tierInfo.icon}</span>
        </div>
    `;
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
            <span class="${sizeClass.icon} tier-icon">${tierInfo.icon}</span>
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
    if (tierInfo.name === '모든 것을 보는 눈') {
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
        generateTierIcon,
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
        generateTierIcon,
        generateTierBadge,
        generateTierProgress,
        getAllTiers,
        getTierRequirements,
        TIERS
    };
}