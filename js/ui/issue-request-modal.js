// 이슈 신청 모달 시스템
class IssueRequestModal {
    constructor() {
        this.modal = null;
        this.isOpen = false;
        this.currentUser = null;
        
        this.createModal();
        this.setupEventListeners();
    }
    
    createModal() {
        // 모달 HTML 생성
        const modalHTML = `
            <div id="issue-request-modal" class="betting-modal hidden">
                <div class="betting-modal-backdrop"></div>
                <div class="betting-modal-container">
                    <div class="betting-modal-content">
                        <!-- 헤더 -->
                        <div class="betting-modal-header">
                            <div class="betting-modal-title">
                                <div class="betting-icon">💡</div>
                                <h2>이슈 신청</h2>
                            </div>
                            <button class="betting-modal-close" id="issue-request-modal-close">
                                <i data-lucide="x" class="w-6 h-6"></i>
                            </button>
                        </div>
                        
                        <!-- 안내 메시지 -->
                        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0">
                                    <i data-lucide="info" class="w-5 h-5 text-blue-600 mt-0.5"></i>
                                </div>
                                <div class="text-sm text-blue-800">
                                    <p class="font-semibold mb-1">이슈 신청 안내</p>
                                    <ul class="list-disc list-inside space-y-1 text-blue-700">
                                        <li>관리자 승인 후 정식 이슈로 등록됩니다</li>
                                        <li>승인 시 <strong>1,000 GAM</strong>을 받습니다</li>
                                        <li>명확하고 흥미로운 주제를 제안해주세요</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 이슈 신청 폼 -->
                        <form id="issue-request-form" class="space-y-6">
                            <!-- 제목 -->
                            <div class="form-group">
                                <label for="issue-title" class="block text-sm font-semibold text-gray-900 mb-2">
                                    <i data-lucide="edit-3" class="w-4 h-4 inline mr-1"></i>
                                    이슈 제목 *
                                </label>
                                <input type="text" id="issue-title" name="title" required
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                       placeholder="예: 2025년 상반기 비트코인 가격이 10만 달러를 넘을 것인가?"
                                       maxlength="200">
                                <div class="text-xs text-gray-500 mt-1">최대 200자</div>
                            </div>
                            
                            <!-- 카테고리 -->
                            <div class="form-group">
                                <label for="issue-category" class="block text-sm font-semibold text-gray-900 mb-2">
                                    <i data-lucide="tag" class="w-4 h-4 inline mr-1"></i>
                                    카테고리 *
                                </label>
                                <select id="issue-category" name="category" required
                                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                                    <option value="">카테고리를 선택하세요</option>
                                    <option value="정치">정치</option>
                                    <option value="스포츠">스포츠</option>
                                    <option value="경제">경제</option>
                                    <option value="코인">코인</option>
                                    <option value="테크">테크</option>
                                    <option value="엔터">엔터</option>
                                    <option value="날씨">날씨</option>
                                    <option value="해외">해외</option>
                                </select>
                            </div>
                            
                            <!-- 상세 설명 -->
                            <div class="form-group">
                                <label for="issue-description" class="block text-sm font-semibold text-gray-900 mb-2">
                                    <i data-lucide="file-text" class="w-4 h-4 inline mr-1"></i>
                                    상세 설명 *
                                </label>
                                <textarea id="issue-description" name="description" required rows="4"
                                          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                                          placeholder="이슈에 대한 구체적인 설명을 작성해주세요. 판단 기준, 참고 자료 등을 포함하면 좋습니다."
                                          maxlength="1000"></textarea>
                                <div class="text-xs text-gray-500 mt-1">최대 1,000자</div>
                            </div>
                            
                            <!-- 마감일 -->
                            <div class="form-group">
                                <label for="issue-deadline" class="block text-sm font-semibold text-gray-900 mb-2">
                                    <i data-lucide="calendar" class="w-4 h-4 inline mr-1"></i>
                                    예상 마감일 *
                                </label>
                                <input type="datetime-local" id="issue-deadline" name="deadline" required
                                       class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors">
                                <div class="text-xs text-gray-500 mt-1">결과를 확인할 수 있는 예상 시점을 선택해주세요</div>
                            </div>
                        </form>
                        
                        <!-- 버튼 -->
                        <div class="betting-actions mt-8">
                            <button class="betting-cancel-btn" id="issue-request-cancel">취소</button>
                            <button class="betting-confirm-btn" id="issue-request-submit">
                                <div class="btn-content">
                                    <span class="btn-icon">📝</span>
                                    <span class="btn-text">이슈 신청</span>
                                </div>
                                <div class="btn-glow"></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // DOM에 추가
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('issue-request-modal');
    }
    
    setupEventListeners() {
        // 모달 닫기
        document.getElementById('issue-request-modal-close').addEventListener('click', () => this.close());
        document.getElementById('issue-request-cancel').addEventListener('click', () => this.close());
        
        // 백드롭 클릭으로 닫기
        this.modal.querySelector('.betting-modal-backdrop').addEventListener('click', () => this.close());
        
        // 폼 제출
        document.getElementById('issue-request-submit').addEventListener('click', (e) => {
            e.preventDefault();
            this.submitRequest();
        });
        
        // ESC 키로 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
        
        // 최소 마감일 설정 (현재 시간부터 1시간 후)
        this.setMinDeadline();
    }
    
    setMinDeadline() {
        const now = new Date();
        now.setHours(now.getHours() + 1); // 최소 1시간 후
        const minDateTime = now.toISOString().slice(0, 16);
        
        const deadlineInput = document.getElementById('issue-deadline');
        if (deadlineInput) {
            deadlineInput.min = minDateTime;
            // 기본값을 1주일 후로 설정
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 7);
            deadlineInput.value = defaultDate.toISOString().slice(0, 16);
        }
    }
    
    open(currentUser) {
        if (!currentUser) {
            // 로그인이 필요하다는 알림
            if (typeof window.showPremiumToast === 'function') {
                window.showPremiumToast('error', '로그인이 필요합니다', '이슈를 신청하려면 먼저 로그인해주세요.');
            } else {
                alert('로그인이 필요합니다.');
            }
            return;
        }
        
        this.currentUser = currentUser;
        
        // 폼 초기화
        document.getElementById('issue-request-form').reset();
        this.setMinDeadline();
        
        // 모달 표시
        this.modal.classList.remove('hidden');
        this.modal.classList.add('show');
        this.isOpen = true;
        
        // 첫 번째 입력 필드에 포커스
        document.getElementById('issue-title').focus();
        
        // 바디 스크롤 방지
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        this.modal.classList.remove('show');
        this.modal.classList.add('hiding');
        
        setTimeout(() => {
            this.modal.classList.add('hidden');
            this.modal.classList.remove('hiding');
            this.isOpen = false;
            
            // 바디 스크롤 복원
            document.body.style.overflow = '';
        }, 300);
    }
    
    async submitRequest() {
        const form = document.getElementById('issue-request-form');
        const formData = new FormData(form);
        
        // 폼 유효성 검사
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        const submitBtn = document.getElementById('issue-request-submit');
        const originalContent = submitBtn.innerHTML;
        
        // 로딩 상태
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <div class="btn-content">
                <span class="btn-spinner">⏳</span>
                <span class="btn-text">신청 중...</span>
            </div>
        `;
        
        try {
            // 한국 시간대로 마감일 처리 (관리자 페이지와 동일한 방식)
            const deadlineLocal = formData.get('deadline');
            const deadlineKST = deadlineLocal ? new Date(deadlineLocal + '+09:00').toISOString() : null;
            
            const requestData = {
                title: formData.get('title'),
                category: formData.get('category'),
                description: formData.get('description'),
                deadline: deadlineKST,
                userId: this.currentUser.id
            };
            
            const response = await fetch('/api/issue-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('yegame-token')}`
                },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success || response.ok) {
                // 성공 메시지
                if (typeof window.showPremiumToast === 'function') {
                    window.showPremiumToast('success', '이슈 신청 완료!', '관리자 승인 후 정식 이슈로 등록됩니다.');
                } else {
                    alert('이슈 신청이 완료되었습니다!');
                }
                
                this.close();
            } else {
                throw new Error(data.message || '이슈 신청에 실패했습니다.');
            }
            
        } catch (error) {
            console.error('이슈 신청 실패:', error);
            
            if (typeof window.showPremiumToast === 'function') {
                window.showPremiumToast('error', '신청 실패', error.message);
            } else {
                alert('이슈 신청 중 오류가 발생했습니다: ' + error.message);
            }
            
            // 버튼 복원
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalContent;
        }
    }
}

// 전역 인스턴스 생성
window.issueRequestModal = new IssueRequestModal();

// 전역 함수로 노출 (기존 코드 호환성)
window.openIssueRequestModal = (currentUser) => {
    window.issueRequestModal.open(currentUser);
};