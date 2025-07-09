/**
 * 클라이언트 사이드 end_date 일관성 검증 시스템
 */
class EndDateValidator {
    constructor() {
        this.validationCache = new Map();
        this.inconsistencyCount = 0;
        this.autoRefreshEnabled = true;
        this.validationInterval = null;
        
        // 주기적 검증 시작 (5분마다)
        this.startPeriodicValidation();
        
        // 페이지 가시성 변경 시 검증
        this.setupVisibilityChangeValidation();
    }

    /**
     * 이슈의 마감시간 일관성 검증
     * @param {number} issueId - 이슈 ID
     * @param {string} displayedEndDate - 화면에 표시된 마감시간
     * @returns {Promise<Object>} 검증 결과
     */
    async validateIssueEndDate(issueId, displayedEndDate) {
        try {
            // 서버에서 최신 마감시간 조회
            const response = await fetch(`/api/issues/${issueId}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success || !data.issue) {
                throw new Error('Invalid server response');
            }

            const serverEndDate = data.issue.end_date;
            const displayedTime = new Date(displayedEndDate).getTime();
            const serverTime = new Date(serverEndDate).getTime();
            
            // 1초 이상 차이나면 불일치로 판단
            const timeDifference = Math.abs(displayedTime - serverTime);
            const isConsistent = timeDifference < 1000;

            const result = {
                issueId,
                isConsistent,
                displayedEndDate,
                serverEndDate,
                timeDifference,
                lastValidated: new Date()
            };

            // 캐시에 결과 저장
            this.validationCache.set(issueId, result);

            if (!isConsistent) {
                this.handleInconsistency(result);
            }

            return result;

        } catch (error) {
            console.error(`End date validation failed for issue ${issueId}:`, error);
            return {
                issueId,
                isConsistent: null,
                error: error.message,
                lastValidated: new Date()
            };
        }
    }

    /**
     * 여러 이슈의 마감시간 일관성 일괄 검증
     * @param {Array} issues - 검증할 이슈들 [{id, end_date}, ...]
     * @returns {Promise<Object>} 검증 결과 요약
     */
    async validateMultipleIssues(issues) {
        const validationPromises = issues.map(issue => 
            this.validateIssueEndDate(issue.id, issue.end_date)
        );

        const results = await Promise.allSettled(validationPromises);
        
        const summary = {
            totalIssues: issues.length,
            validatedCount: 0,
            consistentCount: 0,
            inconsistentCount: 0,
            errorCount: 0,
            inconsistentIssues: [],
            timestamp: new Date()
        };

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const validation = result.value;
                summary.validatedCount++;
                
                if (validation.isConsistent === true) {
                    summary.consistentCount++;
                } else if (validation.isConsistent === false) {
                    summary.inconsistentCount++;
                    summary.inconsistentIssues.push({
                        issueId: validation.issueId,
                        timeDifference: validation.timeDifference,
                        displayedEndDate: validation.displayedEndDate,
                        serverEndDate: validation.serverEndDate
                    });
                } else {
                    summary.errorCount++;
                }
            } else {
                summary.errorCount++;
            }
        });

        console.log('📊 End date validation summary:', summary);
        return summary;
    }

    /**
     * 불일치 감지 시 처리
     * @param {Object} inconsistency - 불일치 정보
     */
    handleInconsistency(inconsistency) {
        this.inconsistencyCount++;
        
        console.warn('🚨 End date inconsistency detected:', {
            issueId: inconsistency.issueId,
            displayed: inconsistency.displayedEndDate,
            server: inconsistency.serverEndDate,
            difference: `${inconsistency.timeDifference}ms`,
            count: this.inconsistencyCount
        });

        // 불일치 로그를 서버로 전송
        this.reportInconsistency(inconsistency);

        // 자동 새로고침이 활성화된 경우 즉시 새로고침
        if (this.autoRefreshEnabled) {
            this.refreshIssueData(inconsistency.issueId);
        }

        // 불일치가 3회 이상이면 경고 표시
        if (this.inconsistencyCount >= 3) {
            this.showConsistencyWarning();
        }
    }

    /**
     * 불일치 정보를 서버로 보고
     * @param {Object} inconsistency - 불일치 정보
     */
    async reportInconsistency(inconsistency) {
        try {
            await fetch('/api/admin/audit/report-inconsistency', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    type: 'END_DATE_INCONSISTENCY',
                    issueId: inconsistency.issueId,
                    clientEndDate: inconsistency.displayedEndDate,
                    serverEndDate: inconsistency.serverEndDate,
                    timeDifference: inconsistency.timeDifference,
                    userAgent: navigator.userAgent,
                    timestamp: new Date()
                })
            });
        } catch (error) {
            console.error('Failed to report inconsistency:', error);
        }
    }

    /**
     * 특정 이슈의 데이터 새로고침
     * @param {number} issueId - 이슈 ID
     */
    async refreshIssueData(issueId) {
        try {
            console.log(`🔄 Refreshing data for issue ${issueId}...`);
            
            // 이슈 카드 요소 찾기
            const issueElement = document.querySelector(`[data-issue-id="${issueId}"]`);
            if (!issueElement) {
                console.warn(`Issue element not found for ID: ${issueId}`);
                return;
            }

            // 서버에서 최신 데이터 가져오기
            const response = await fetch(`/api/issues/${issueId}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch issue data: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success || !data.issue) {
                throw new Error('Invalid issue data received');
            }

            // DOM 업데이트
            this.updateIssueElement(issueElement, data.issue);
            
            console.log(`✅ Issue ${issueId} data refreshed successfully`);

        } catch (error) {
            console.error(`Failed to refresh issue ${issueId}:`, error);
        }
    }

    /**
     * 이슈 DOM 요소 업데이트
     * @param {Element} element - 이슈 DOM 요소
     * @param {Object} issueData - 최신 이슈 데이터
     */
    updateIssueElement(element, issueData) {
        // 마감시간 업데이트
        const endDateElement = element.querySelector('[data-end-date]');
        if (endDateElement) {
            endDateElement.setAttribute('data-end-date', issueData.end_date);
            endDateElement.textContent = this.formatEndDate(issueData.end_date);
        }

        // 다른 필드들도 필요시 업데이트
        const titleElement = element.querySelector('.issue-title');
        if (titleElement && issueData.title) {
            titleElement.textContent = issueData.title;
        }

        // 데이터 속성 업데이트
        element.setAttribute('data-last-updated', new Date().toISOString());
    }

    /**
     * 마감시간 포맷팅
     * @param {string} endDate - ISO 날짜 문자열
     * @returns {string} 포맷된 날짜 문자열
     */
    formatEndDate(endDate) {
        const date = new Date(endDate);
        const now = new Date();
        const diff = date - now;

        if (diff < 0) {
            return '마감됨';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days}일 ${hours}시간 후`;
        } else if (hours > 0) {
            return `${hours}시간 ${minutes}분 후`;
        } else {
            return `${minutes}분 후`;
        }
    }

    /**
     * 일관성 경고 표시
     */
    showConsistencyWarning() {
        // 기존 경고가 있으면 제거
        const existingWarning = document.querySelector('.end-date-consistency-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        // 새 경고 생성
        const warning = document.createElement('div');
        warning.className = 'end-date-consistency-warning';
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            cursor: pointer;
        `;
        
        warning.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">⚠️ 데이터 불일치 감지</div>
            <div style="font-size: 12px;">마감시간 정보가 일치하지 않습니다. 페이지를 새로고침해주세요.</div>
            <div style="font-size: 11px; margin-top: 5px; opacity: 0.8;">클릭하여 닫기</div>
        `;

        warning.addEventListener('click', () => {
            warning.remove();
        });

        document.body.appendChild(warning);

        // 10초 후 자동 제거
        setTimeout(() => {
            if (warning.parentNode) {
                warning.remove();
            }
        }, 10000);
    }

    /**
     * 주기적 검증 시작
     */
    startPeriodicValidation() {
        // 기존 인터벌 제거
        if (this.validationInterval) {
            clearInterval(this.validationInterval);
        }

        // 5분마다 활성 이슈들 검증
        this.validationInterval = setInterval(() => {
            this.validateVisibleIssues();
        }, 5 * 60 * 1000);
    }

    /**
     * 화면에 보이는 이슈들만 검증
     */
    async validateVisibleIssues() {
        const issueElements = document.querySelectorAll('[data-issue-id][data-end-date]');
        const issues = Array.from(issueElements).map(element => ({
            id: parseInt(element.getAttribute('data-issue-id')),
            end_date: element.getAttribute('data-end-date')
        })).filter(issue => issue.id && issue.end_date);

        if (issues.length > 0) {
            console.log(`🔍 Validating ${issues.length} visible issues...`);
            const summary = await this.validateMultipleIssues(issues);
            
            if (summary.inconsistentCount > 0) {
                console.warn(`⚠️ Found ${summary.inconsistentCount} inconsistent issues`);
            }
        }
    }

    /**
     * 페이지 가시성 변경 시 검증 설정
     */
    setupVisibilityChangeValidation() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 페이지가 다시 보이게 되면 검증 실행
                setTimeout(() => {
                    this.validateVisibleIssues();
                }, 1000);
            }
        });
    }

    /**
     * 자동 새로고침 토글
     * @param {boolean} enabled - 활성화 여부
     */
    setAutoRefresh(enabled) {
        this.autoRefreshEnabled = enabled;
        console.log(`🔄 Auto-refresh ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * 검증 통계 조회
     * @returns {Object} 검증 통계
     */
    getValidationStats() {
        return {
            totalValidations: this.validationCache.size,
            inconsistencyCount: this.inconsistencyCount,
            autoRefreshEnabled: this.autoRefreshEnabled,
            cacheSize: this.validationCache.size,
            lastValidation: Math.max(...Array.from(this.validationCache.values())
                .map(v => v.lastValidated?.getTime()).filter(Boolean)) || null
        };
    }

    /**
     * 캐시 정리
     */
    clearCache() {
        this.validationCache.clear();
        this.inconsistencyCount = 0;
        console.log('🧹 Validation cache cleared');
    }

    /**
     * 검증 시스템 종료
     */
    destroy() {
        if (this.validationInterval) {
            clearInterval(this.validationInterval);
            this.validationInterval = null;
        }
        this.clearCache();
        console.log('🛑 End date validator destroyed');
    }
}

// 전역 인스턴스 생성
window.endDateValidator = new EndDateValidator();

// 개발자 도구용 헬퍼 함수들
window.validateEndDates = () => window.endDateValidator.validateVisibleIssues();
window.getValidationStats = () => window.endDateValidator.getValidationStats();
window.toggleAutoRefresh = (enabled) => window.endDateValidator.setAutoRefresh(enabled);

// 🔧 UTC 시간을 올바르게 KST로 처리하는 함수
window.getTimeLeft = function(endDate) {
    if (!endDate) return "마감";
    
    // 🔍 현재 로컬 시간 (KST)
    const now = new Date();
    
    // 🔍 UTC 시간을 파싱 (JavaScript가 자동으로 로컬 시간대로 변환)
    const future = new Date(endDate);
    
    // 시간 차이 계산
    const diff = future.getTime() - now.getTime();
    
    // 🔍 상세 디버깅 로그
    console.log('🔍 UTC→KST 시간 계산:', {
        input_utc: endDate,
        now_kst: now.toLocaleString('ko-KR'),
        future_kst: future.toLocaleString('ko-KR'),
        diff_hours: (diff / (1000 * 60 * 60)).toFixed(2),
        diff_days: (diff / (1000 * 60 * 60 * 24)).toFixed(2)
    });
    
    if (diff <= 0) return "마감";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    
    let result;
    if (days > 0) result = `${days}일 남음`;
    else if (hours > 0) result = `${hours}시간 남음`;
    else result = `${minutes}분 남음`;
    
    console.log('⏰ 최종 결과:', result);
    return result;
};

window.formatEndDate = function(endDate) {
    if (!endDate) return '';
    
    const d = new Date(endDate);
    if (isNaN(d.getTime())) return '';
    
    // 🇰🇷 DB에서 받은 KST 데이터를 그대로 표시
    return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(/\. /g, '.').replace(/\.$/, '').replace(/ /g, ' ');
};

console.log('🔧 End date validation system initialized');

// 🔧 단순화된 시간 처리 시스템 완료
console.log('✅ 타임존 double conversion 문제 해결 완료');