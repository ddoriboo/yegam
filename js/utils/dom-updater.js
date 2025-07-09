/**
 * GAM 잔액 업데이트를 위한 DOM 업데이터 유틸리티
 * 베팅 후 즉시 잔액 업데이트를 보장합니다.
 */

// 모든 GAM 표시 요소 선택자들
const GAM_SELECTORS = [
    '#user-coins',
    '[data-user-coins]',
    '.user-coins',
    '[id*="user-coins"]',
    '[id*="gam"]',
    '.gam-balance',
    '.user-balance'
];

/**
 * 모든 GAM 표시 요소를 즉시 업데이트합니다
 * @param {number} newBalance - 새로운 GAM 잔액
 * @param {string} username - 사용자명 (로깅용)
 */
export function updateAllGamElements(newBalance, username = '알 수 없음') {
    console.log(`🔧 DOM 업데이터 실행:`, { newBalance, username });
    
    let updatedCount = 0;
    const results = [];
    
    GAM_SELECTORS.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, index) => {
            try {
                const oldValue = element.textContent || element.innerText || '';
                const newValue = newBalance.toLocaleString();
                
                // 텍스트 업데이트
                element.textContent = newValue;
                
                // data 속성도 업데이트 (있는 경우)
                if (element.dataset.gamBalance !== undefined) {
                    element.dataset.gamBalance = newBalance;
                }
                
                updatedCount++;
                results.push({
                    selector,
                    elementIndex: index,
                    element: element.id || element.className || element.tagName,
                    oldValue,
                    newValue,
                    success: true
                });
                
                console.log(`✅ GAM 업데이트 성공 [${selector}][${index}]:`, {
                    element: element.id || element.className,
                    oldValue,
                    newValue
                });
                
            } catch (error) {
                console.error(`❌ GAM 업데이트 실패 [${selector}][${index}]:`, error);
                results.push({
                    selector,
                    elementIndex: index,
                    element: element.id || element.className || element.tagName,
                    error: error.message,
                    success: false
                });
            }
        });
    });
    
    console.log(`🎯 DOM 업데이터 완료 - 총 ${updatedCount}개 요소 업데이트`);
    
    return {
        updatedCount,
        results,
        newBalance,
        success: updatedCount > 0
    };
}

/**
 * 특정 시간 후 업데이트 상태를 확인하고 필요시 재시도합니다
 * @param {number} expectedBalance - 예상 잔액
 * @param {number} delayMs - 확인 지연 시간 (기본: 100ms)
 */
export function verifyAndRetryGamUpdate(expectedBalance, delayMs = 100) {
    setTimeout(() => {
        const primaryElement = document.getElementById('user-coins');
        
        if (primaryElement) {
            const currentDisplayed = primaryElement.textContent || '';
            const expectedDisplayed = expectedBalance.toLocaleString();
            
            if (currentDisplayed !== expectedDisplayed) {
                console.warn(`⚠️ GAM 표시 불일치 감지:`, {
                    현재표시: currentDisplayed,
                    예상표시: expectedDisplayed,
                    재시도: true
                });
                
                // 재시도
                updateAllGamElements(expectedBalance, 'verification-retry');
                
                // 한 번 더 확인 (더 긴 지연)
                setTimeout(() => {
                    const reCheckDisplayed = primaryElement.textContent || '';
                    if (reCheckDisplayed !== expectedDisplayed) {
                        console.error(`🚨 GAM 업데이트 최종 실패:`, {
                            현재표시: reCheckDisplayed,
                            예상표시: expectedDisplayed
                        });
                    } else {
                        console.log(`✅ GAM 업데이트 재시도 성공`);
                    }
                }, 200);
            } else {
                console.log(`✅ GAM 표시 정상 확인:`, expectedDisplayed);
            }
        } else {
            console.warn(`⚠️ 주요 GAM 표시 요소 (#user-coins) 없음`);
        }
    }, delayMs);
}

/**
 * 강제 GAM 업데이트 (모든 방법 동원)
 * @param {number} newBalance - 새로운 GAM 잔액
 * @param {Object} userInfo - 사용자 정보
 */
export function forceGamUpdate(newBalance, userInfo = {}) {
    console.log(`🚀 강제 GAM 업데이트 시작:`, { newBalance, userInfo });
    
    // 1. DOM 직접 업데이트
    const domResult = updateAllGamElements(newBalance, userInfo.username);
    
    // 2. 전역 상태 업데이트
    if (window.currentUser) {
        window.currentUser.gam_balance = newBalance;
        console.log(`🌐 window.currentUser 업데이트:`, newBalance);
    }
    
    // 3. localStorage 업데이트
    try {
        const storedUser = JSON.parse(localStorage.getItem('yegame-user') || '{}');
        storedUser.gam_balance = newBalance;
        localStorage.setItem('yegame-user', JSON.stringify(storedUser));
        console.log(`💾 localStorage 업데이트:`, newBalance);
    } catch (error) {
        console.warn(`⚠️ localStorage 업데이트 실패:`, error);
    }
    
    // 4. 헤더 모듈 호출 (있는 경우)
    if (window.updateUserWallet) {
        window.updateUserWallet(newBalance);
        console.log(`🔄 updateUserWallet 호출`);
    }
    
    // 5. 전역 업데이트 함수 호출 (있는 경우)
    if (window.updateCurrentUser) {
        window.updateCurrentUser({ ...userInfo, gam_balance: newBalance });
        console.log(`🌍 updateCurrentUser 호출`);
    }
    
    // 6. 검증 및 재시도
    verifyAndRetryGamUpdate(newBalance, 50);
    
    console.log(`🎯 강제 GAM 업데이트 완료`);
    
    return domResult;
}

export default {
    updateAllGamElements,
    verifyAndRetryGamUpdate,
    forceGamUpdate
};