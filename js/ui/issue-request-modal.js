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
        // 모달 HTML 생성 - Polymarket 스타일
        const modalHTML = `
            <div id="issue-request-modal" class="betting-modal hidden">
                <div class="betting-modal-backdrop"></div>
                <div class="betting-modal-container" style="max-width: 480px;">
                    <div class="betting-modal-content">
                        <!-- 헤더 -->
                        <div class="flex items-center justify-between p-4 border-b border-gray-200">
                            <h2 class="text-lg font-semibold text-gray-900">이슈 신청</h2>
                            <button class="p-1 hover:bg-gray-100 rounded-lg transition-colors" id="issue-request-modal-close">
                                <i data-lucide="x" class="w-5 h-5 text-gray-500"></i>
                            </button>
                        </div>
                        
                        <!-- 안내 -->
                        <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                            승인 시 <span class="font-semibold text-gray-900">1,000 GAM</span> 지급
                        </div>
                        
                        <!-- 폼 -->
                        <form id="issue-request-form" class="p-4 space-y-4">
                            <!-- 제목 -->
                            <div>
                                <label for="issue-title" class="block text-sm font-medium text-gray-700 mb-1">제목</label>
                                <input type="text" id="issue-title" name="title" required
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                       placeholder="예측 질문을 입력하세요"
                                       maxlength="200">
                            </div>
                            
                            <!-- 카테고리 -->
                            <div>
                                <label for="issue-category" class="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                                <select id="issue-category" name="category" required
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                                    <option value="">선택</option>
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
                            
                            <!-- 설명 -->
                            <div>
                                <label for="issue-description" class="block text-sm font-medium text-gray-700 mb-1">설명 (선택)</label>
                                <textarea id="issue-description" name="description" rows="3"
                                          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                                          placeholder="판단 기준이나 참고 정보"
                                          maxlength="500"></textarea>
                            </div>
                            
                            <!-- 마감일 -->
                            <div>
                                <label for="issue-deadline" class="block text-sm font-medium text-gray-700 mb-1">마감일</label>
                                <input type="datetime-local" id="issue-deadline" name="deadline" required
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm">
                            </div>
                            
                            <!-- 버튼 -->
                            <div class="flex gap-3 pt-2">
                                <button type="button" class="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" id="issue-request-cancel">
                                    취소
                                </button>
                                <button type="submit" class="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors" id="issue-request-submit">
                                    신청하기
                                </button>
                            </div>
                        </form>
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
        
        // 백드롭 클릭으로 닫기 (내용 확인 후)
        this.modal.querySelector('.betting-modal-backdrop').addEventListener('click', () => this.closeWithConfirmation());
        
        // 폼 제출
        document.getElementById('issue-request-submit').addEventListener('click', (e) => {
            e.preventDefault();
            this.submitRequest();
        });
        
        // ESC 키로 닫기 (내용 확인 후)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeWithConfirmation();
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
        
        // 모바일 키보드 대응
        this.setupMobileKeyboardHandling();
    }
    
    // 폼 내용 확인
    hasFormContent() {
        const title = document.getElementById('issue-title').value.trim();
        const category = document.getElementById('issue-category').value;
        const description = document.getElementById('issue-description').value.trim();
        const deadline = document.getElementById('issue-deadline').value;
        
        return title || category || description || deadline;
    }
    
    // 확인 후 닫기
    closeWithConfirmation() {
        if (this.hasFormContent()) {
            const confirmed = confirm('작성 중인 내용이 있습니다. 정말 닫으시겠습니까?\n\n작성한 내용은 저장되지 않습니다.');
            if (confirmed) {
                this.close();
            }
        } else {
            this.close();
        }
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
            
            // 모바일 키보드 이벤트 정리
            this.cleanupMobileKeyboardHandling();
        }, 300);
    }
    
    // 모바일 키보드 대응 설정
    setupMobileKeyboardHandling() {
        if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
        
        const header = document.querySelector('header');
        const mobileMenu = document.getElementById('mobile-menu');
        const modalContainer = this.modal.querySelector('.betting-modal-container');
        
        // 원래 상태 저장
        this.originalHeaderState = {
            display: header ? header.style.display : '',
            position: header ? header.style.position : ''
        };
        
        // 입력 포커스 시 헤더 숨기기
        this.keyboardFocusHandler = () => {
            if (header) {
                header.style.display = 'none';
            }
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
            }
            
            // 모달 높이 조정
            modalContainer.style.maxHeight = '95vh';
            modalContainer.style.marginTop = '10px';
            modalContainer.style.marginBottom = '10px';
        };
        
        // 입력 포커스 해제 시 헤더 복원
        this.keyboardBlurHandler = () => {
            setTimeout(() => {
                if (header) {
                    header.style.display = this.originalHeaderState.display;
                }
                
                // 모달 높이 복원
                modalContainer.style.maxHeight = '85vh';
                modalContainer.style.marginTop = '';
                modalContainer.style.marginBottom = '';
            }, 300);
        };
        
        // 모든 입력 필드에 이벤트 등록
        const inputs = this.modal.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('focus', this.keyboardFocusHandler);
            input.addEventListener('blur', this.keyboardBlurHandler);
        });
        
        // 뷰포트 변경 감지 (추가 안전장치)
        this.viewportChangeHandler = () => {
            const vh = window.innerHeight * 0.01;
            modalContainer.style.setProperty('--vh', `${vh}px`);
        };
        
        window.addEventListener('resize', this.viewportChangeHandler);
        window.addEventListener('orientationchange', this.viewportChangeHandler);
    }
    
    // 모바일 키보드 이벤트 정리
    cleanupMobileKeyboardHandling() {
        if (this.keyboardFocusHandler) {
            const inputs = this.modal.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.removeEventListener('focus', this.keyboardFocusHandler);
                input.removeEventListener('blur', this.keyboardBlurHandler);
            });
        }
        
        if (this.viewportChangeHandler) {
            window.removeEventListener('resize', this.viewportChangeHandler);
            window.removeEventListener('orientationchange', this.viewportChangeHandler);
        }
        
        // 헤더 복원
        const header = document.querySelector('header');
        if (header && this.originalHeaderState) {
            header.style.display = this.originalHeaderState.display;
            header.style.position = this.originalHeaderState.position;
        }
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