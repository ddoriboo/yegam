import * as auth from '../auth.js';

// 전역 상태
let currentPage = 1;
let currentCategory = 'all';
let currentSort = 'latest';
let currentSearch = '';
let categories = [];
let isAdmin = false;
let isConceptMode = false; // 개념글 모드

// 페이지 초기화
export async function renderDiscussionsPage() {
    console.log('renderDiscussionsPage called');
    
    try {
        // 관리자 권한 확인
        await checkAdminStatus();
        
        // 카테고리 로드 (fallback 보장)
        await loadCategories();
        
        // 카테고리가 로드되지 않았다면 강제로 fallback 실행
        if (!categories || categories.length === 0) {
            console.warn('카테고리 로드 실패, fallback 강제 실행');
            loadFallbackCategories();
            renderCategoryFilter();
            renderCategoryOptions();
        }
        
        // 인라인 글쓰기 박스 초기화
        initInlineWriteBox();
        
        // 인기글 로드
        await loadPopularPosts();
        
        // 게시글 로드
        await loadPosts();
        
        // 이벤트 리스너 설정
        setupEventListeners();
        
        console.log('✅ 분석방 페이지 초기화 완료');
        
    } catch (error) {
        console.error('❌ 분석방 페이지 초기화 실패:', error);
        
        // 에러 발생시 fallback으로 진행
        console.log('에러 발생으로 fallback 모드로 진행');
        loadFallbackCategories();
        renderCategoryFilter();
        renderCategoryOptions();
        initInlineWriteBox();
        setupEventListeners();
    }
}

// 인라인 글쓰기 박스 초기화 (PC + 모바일 FAB)
function initInlineWriteBox() {
    const writeBox = document.getElementById('inline-write-box');
    const collapsed = document.getElementById('write-box-collapsed');
    const expanded = document.getElementById('write-box-expanded');
    const collapseBtn = document.getElementById('collapse-write-box');
    const inlineForm = document.getElementById('inline-post-form');
    const mobileFab = document.getElementById('mobile-write-fab');
    
    // 로그인 상태 확인
    if (auth.isLoggedIn()) {
        // PC: 인라인 글쓰기 박스 표시 (md:block은 CSS로 처리, hidden만 제거)
        if (writeBox) {
            // 'hidden' 클래스를 제거하고 'md:block'만 유지
            writeBox.classList.remove('hidden');
            writeBox.classList.add('hidden', 'md:block');
        }
        
        // 모바일: FAB 표시
        if (mobileFab) {
            mobileFab.classList.remove('hidden');
        }
        
        // 사용자 티어 아이콘 설정
        const userInfo = auth.getCurrentUser();
        if (userInfo) {
            updateWriteBoxTierIcon(userInfo);
        }
        
        // 인라인 카테고리 옵션 렌더링
        renderInlineCategoryOptions();
    }
    
    // PC: 축소 상태 클릭 시 확장
    collapsed?.addEventListener('click', () => {
        if (!auth.isLoggedIn()) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }
        collapsed.classList.add('hidden');
        expanded.classList.remove('hidden');
        document.getElementById('inline-title')?.focus();
    });
    
    // PC: 취소 버튼 클릭 시 축소
    collapseBtn?.addEventListener('click', () => {
        expanded.classList.add('hidden');
        collapsed.classList.remove('hidden');
        inlineForm?.reset();
    });
    
    // PC: 인라인 폼 제출
    inlineForm?.addEventListener('submit', handleInlinePostSubmit);
    
    // 📱 모바일: FAB 클릭 시 모달 열기
    mobileFab?.addEventListener('click', () => {
        if (!auth.isLoggedIn()) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }
        openPostModal(false);
    });
}

// 인라인 카테고리 옵션 렌더링
function renderInlineCategoryOptions() {
    const selectElement = document.getElementById('inline-category');
    if (!selectElement || !categories || categories.length === 0) return;
    
    // 기존 옵션 제거 (첫 번째 유지)
    while (selectElement.children.length > 1) {
        selectElement.removeChild(selectElement.lastChild);
    }
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.icon || '📝'} ${category.name}`;
        selectElement.appendChild(option);
    });
}

// 글쓰기 박스 티어 아이콘 업데이트
function updateWriteBoxTierIcon(userInfo) {
    const tierIcon1 = document.getElementById('write-box-tier-icon');
    const tierIcon2 = document.getElementById('write-box-tier-icon-expanded');
    
    // 사용자의 GAM 잔액으로 티어 계산
    const gamBalance = userInfo.gam_balance || 0;
    const icon = getTierIconFromBalance(gamBalance);
    
    if (tierIcon1) tierIcon1.textContent = icon;
    if (tierIcon2) tierIcon2.textContent = icon;
}

// GAM 잔액으로 티어 아이콘 가져오기
function getTierIconFromBalance(balance) {
    if (balance >= 150000000) return '👁️‍🗨️';
    if (balance >= 100000000) return '🌌';
    if (balance >= 65000000) return '🌟';
    if (balance >= 40000000) return '☄️';
    if (balance >= 25000000) return '✨';
    if (balance >= 16000000) return '📔';
    if (balance >= 10000000) return '⏳';
    if (balance >= 6500000) return '🌳';
    if (balance >= 4000000) return '🐉';
    if (balance >= 2500000) return '📜';
    if (balance >= 1500000) return '👑';
    if (balance >= 1000000) return '🏆';
    if (balance >= 650000) return '🥇';
    if (balance >= 400000) return '🥈';
    if (balance >= 250000) return '🥉';
    if (balance >= 150000) return '⚔️';
    if (balance >= 90000) return '🛡️';
    if (balance >= 50000) return '⛓️';
    if (balance >= 25000) return '⛏️';
    if (balance >= 10000) return '🪨';
    return '⚪';
}

// 인라인 게시글 제출 처리
async function handleInlinePostSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('inline-submit-btn');
    const form = e.target;
    
    const postData = {
        title: document.getElementById('inline-title').value.trim(),
        content: document.getElementById('inline-content').value.trim(),
        category_id: document.getElementById('inline-category').value
    };
    
    if (!postData.title) {
        alert('제목을 입력해주세요.');
        return;
    }
    if (!postData.content) {
        alert('내용을 입력해주세요.');
        return;
    }
    if (!postData.category_id) {
        alert('카테고리를 선택해주세요.');
        return;
    }
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '게시 중...';
        
        const token = auth.getToken();
        const response = await fetch('/api/discussions/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(postData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 폼 초기화 및 축소
            form.reset();
            document.getElementById('write-box-expanded').classList.add('hidden');
            document.getElementById('write-box-collapsed').classList.remove('hidden');
            
            // 목록 새로고침
            currentPage = 1;
            await loadPosts();
            
            // 성공 알림
            alert('게시글이 작성되었습니다.');
        } else {
            alert(data.message || '작성 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('게시글 작성 오류:', error);
        alert('작성 중 오류가 발생했습니다.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '게시';
    }
}

// 인기글 로드
async function loadPopularPosts() {
    const section = document.getElementById('popular-posts-section');
    const container = document.getElementById('popular-posts-container');
    
    if (!section || !container) return;
    
    try {
        const response = await fetch('/api/discussions/posts/popular?limit=5');
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
            section.classList.remove('hidden');
            renderPopularPosts(data.data);
        } else {
            section.classList.add('hidden');
        }
    } catch (error) {
        console.error('인기글 로드 오류:', error);
        section.classList.add('hidden');
    }
}

// 인기글 렌더링
function renderPopularPosts(posts) {
    const container = document.getElementById('popular-posts-container');
    if (!container) return;
    
    const cardsHTML = posts.map(post => {
        const category = categories.find(c => c.id === post.category_id);
        const categoryColor = category?.color || post.category_color || '#6B7280';
        const tierIcon = post.tier_icon || '⚪';
        
        return `
            <div class="flex-shrink-0 w-64 bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                 onclick="goToPost(${post.id})">
                <div class="flex items-center space-x-2 mb-2">
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" 
                          style="background-color: ${categoryColor}15; color: ${categoryColor};">
                        ${post.category_icon || '📝'}
                    </span>
                    <span class="text-xs text-gray-500">${tierIcon} ${post.author_name || '익명'}</span>
                </div>
                <h3 class="text-sm font-medium text-gray-900 line-clamp-2 mb-2">${post.title}</h3>
                <div class="flex items-center justify-between text-xs text-gray-500">
                    <div class="flex items-center space-x-2">
                        <span class="flex items-center text-red-500">
                            <i data-lucide="heart" class="w-3 h-3 mr-1 fill-current"></i>
                            ${post.like_count || 0}
                        </span>
                        <span class="flex items-center">
                            <i data-lucide="message-circle" class="w-3 h-3 mr-1"></i>
                            ${post.comment_count || 0}
                        </span>
                    </div>
                    <span class="flex items-center">
                        <i data-lucide="eye" class="w-3 h-3 mr-1"></i>
                        ${post.view_count || 0}
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `<div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">${cardsHTML}</div>`;
    
    // Lucide 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 관리자 상태 확인
async function checkAdminStatus() {
    try {
        if (!auth.isLoggedIn()) {
            return;
        }
        
        // 임시로 관리자 버튼 숨김 처리 (실제 관리자 API 연동 후 수정 필요)
        const adminBtn = document.getElementById('admin-notice-btn');
        if (adminBtn) {
            adminBtn.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('관리자 상태 확인 오류:', error);
    }
}

// 카테고리 로드
async function loadCategories() {
    console.log('🔄 카테고리 로드 시작...');
    
    try {
        const response = await fetch('/api/discussions/categories');
        console.log('📡 카테고리 API 요청 상태:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📋 카테고리 API 응답:', data);
        
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            // API에서 받은 카테고리 데이터 사용
            categories = data.data;
            console.log('✅ 카테고리 API에서 로드 성공:', categories.length, '개');
            console.log('📝 API 카테고리 목록:', categories.map(c => `${c.name}(${c.id})`).join(', '));
            
            // '일반' 카테고리가 있는지 확인
            const generalCategory = categories.find(c => c.name === '일반');
            if (generalCategory) {
                console.log('✅ 일반 카테고리 확인됨:', generalCategory);
            } else {
                console.warn('⚠️ 일반 카테고리가 API 응답에 없음 - fallback으로 대체');
                loadFallbackCategories();
            }
            
            renderCategoryFilter();
            renderCategoryOptions();
            return true;
        } else {
            console.warn('⚠️ 카테고리 API 응답이 올바르지 않거나 비어있음');
            throw new Error('Invalid API response');
        }
        
    } catch (error) {
        console.error('❌ 카테고리 API 로드 실패:', error.message);
        console.log('🔄 Fallback 카테고리로 전환...');
        
        // API 실패 시 무조건 fallback 사용
        loadFallbackCategories();
        renderCategoryFilter();
        renderCategoryOptions();
        return false;
    }
}

// 기본 카테고리 데이터 (API 실패시 사용) - 일반 카테고리 추가
function loadFallbackCategories() {
    console.log('🔄 Fallback 카테고리 데이터 로드 중...');
    
    // 데이터베이스 스키마와 일치하는 카테고리 ID 사용
    categories = [
        // '전체'는 필터용이므로 실제 카테고리가 아님
        {id: 1, name: '일반', description: '일반적인 주제의 자유로운 토론', icon: '💬', color: '#6B7280', display_order: 1},
        {id: 2, name: '정치', description: '선거, 정책, 정치적 이벤트', icon: '🏛️', color: '#DC2626', display_order: 2},
        {id: 3, name: '스포츠', description: '경기 결과, 시즌 성과', icon: '⚽', color: '#0891B2', display_order: 3},
        {id: 4, name: '경제', description: '주식, 환율, 경제 지표', icon: '📈', color: '#059669', display_order: 4},
        {id: 5, name: '코인', description: '암호화폐 가격, 트렌드', icon: '₿', color: '#F59E0B', display_order: 5},
        {id: 6, name: '테크', description: '기술 트렌드, 제품 출시', icon: '💻', color: '#7C3AED', display_order: 6},
        {id: 7, name: '엔터', description: '연예계, 문화 콘텐츠', icon: '🎭', color: '#EC4899', display_order: 7},
        {id: 8, name: '날씨', description: '기상 예보, 계절 예측', icon: '🌤️', color: '#3B82F6', display_order: 8},
        {id: 9, name: '해외', description: '국제 정치, 글로벌 이벤트', icon: '🌍', color: '#4F46E5', display_order: 9}
    ];
    
    console.log('✅ Fallback 카테고리 로드 완료:', categories.length, '개');
    console.log('📋 로드된 카테고리:', categories.map(c => `${c.icon} ${c.name}(${c.id})`).join(', '));
}

// 카테고리 필터 렌더링
function renderCategoryFilter() {
    const desktopContainer = document.getElementById('category-filter-desktop');
    const mobileContainer = document.getElementById('category-filter-mobile');
    
    if (!desktopContainer) {
        console.error('desktop 카테고리 컨테이너를 찾을 수 없음');
        return;
    }
    if (!mobileContainer) {
        console.error('mobile 카테고리 컨테이너를 찾을 수 없음');
        return;
    }
    
    console.log('카테고리 렌더링 시작:', categories.length, '개 카테고리');
    console.log('카테고리 목록:', categories.map(c => `${c.icon} ${c.name}(ID:${c.id})`).join(', '));
    
    if (!categories || categories.length === 0) {
        console.warn('카테고리 데이터가 없음');
        return;
    }
    
    // 현재 활성화된 카테고리 저장
    const currentActive = currentCategory || 'all';
    console.log('현재 활성 카테고리:', currentActive);
    
    // 카테고리 버튼 생성 함수
    const createCategoryButtons = (container, containerType) => {
        console.log(`${containerType} 컨테이너 카테고리 버튼 생성 중...`);
        container.innerHTML = '';
        
        // '전체' 버튼 생성
        const allBtn = document.createElement('button');
        allBtn.className = `category-btn ${currentActive === 'all' ? 'active' : ''}`;
        allBtn.dataset.category = 'all';
        allBtn.innerHTML = '💬 전체';
        allBtn.style.whiteSpace = 'nowrap';
        container.appendChild(allBtn);
        console.log(`${containerType} - 전체 버튼 생성됨`);
        
        // 카테고리 버튼들 추가
        categories.forEach(category => {
            const btn = document.createElement('button');
            btn.className = `category-btn ${currentActive == category.id ? 'active' : ''}`;
            btn.dataset.category = category.id;
            btn.innerHTML = `${category.icon || '📝'} ${category.name}`;
            btn.style.whiteSpace = 'nowrap';
            
            container.appendChild(btn);
            console.log(`${containerType} - ${category.name} 버튼 생성됨`);
        });
        
        console.log(`${containerType} 컨테이너에 총 ${container.children.length}개 버튼 생성됨`);
    };
    
    // 데스크톱과 모바일 버전 모두 생성
    createCategoryButtons(desktopContainer, 'Desktop');
    createCategoryButtons(mobileContainer, 'Mobile');
    
    // 이벤트 위임으로 모든 카테고리 버튼 처리
    setupCategoryEventListeners();
    
    console.log('카테고리 버튼 생성 완료 (데스크톱/모바일)');
    console.log('Desktop 컨테이너 클래스:', desktopContainer.parentElement.className);
    console.log('Mobile 컨테이너 클래스:', mobileContainer.parentElement.className);
}

// 카테고리 이벤트 리스너 설정 (이벤트 위임 방식)
function setupCategoryEventListeners() {
    const desktopContainer = document.getElementById('category-filter-desktop');
    const mobileContainer = document.getElementById('category-filter-mobile');
    
    // 데스크톱 컨테이너 이벤트 리스너
    if (desktopContainer) {
        desktopContainer.removeEventListener('click', handleCategoryClick);
        desktopContainer.addEventListener('click', handleCategoryClick);
    }
    
    // 모바일 컨테이너 이벤트 리스너
    if (mobileContainer) {
        mobileContainer.removeEventListener('click', handleCategoryClick);
        mobileContainer.addEventListener('click', handleCategoryClick);
    }
}

// 카테고리 클릭 핸들러
function handleCategoryClick(event) {
    console.log('🔘 카테고리 영역 클릭 감지:', event.target);
    
    const clickedBtn = event.target.closest('.category-btn');
    if (!clickedBtn) {
        console.log('⚠️ 카테고리 버튼이 아닌 요소 클릭');
        return;
    }
    
    const categoryId = clickedBtn.dataset.category;
    console.log('🎯 카테고리 버튼 클릭됨:', {
        categoryId,
        buttonText: clickedBtn.textContent,
        dataset: clickedBtn.dataset
    });
    
    if (!categoryId) {
        console.error('❌ 카테고리 ID가 누락됨');
        return;
    }
    
    selectCategory(categoryId);
}

// 카테고리 옵션 렌더링 (모달용)
function renderCategoryOptions() {
    const selectElement = document.getElementById('post-category');
    if (!selectElement) {
        console.error('post-category 선택 요소를 찾을 수 없음 - 모달이 아직 로드되지 않음');
        return;
    }
    
    console.log('카테고리 옵션 렌더링 시작:', categories.length, '개');
    
    if (!categories || categories.length === 0) {
        console.warn('카테고리 데이터가 없어서 옵션을 렌더링할 수 없음');
        return;
    }
    
    // 기존 옵션들 제거 (첫 번째 option은 유지)
    while (selectElement.children.length > 1) {
        selectElement.removeChild(selectElement.lastChild);
    }
    
    // 카테고리 옵션 추가
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.icon || '📝'} ${category.name}`;
        selectElement.appendChild(option);
        console.log('카테고리 옵션 추가:', category.name, '(ID:', category.id, ')');
    });
    
    console.log('카테고리 옵션 렌더링 완료. 총 옵션 수:', selectElement.children.length);
    console.log('생성된 옵션들:', Array.from(selectElement.children).map(opt => `${opt.value}: ${opt.textContent}`).join(', '));
}

// 카테고리 선택
function selectCategory(categoryId) {
    console.log('🎯 카테고리 선택 시작:', categoryId);
    
    currentCategory = categoryId;
    currentPage = 1;
    
    // 모든 버튼에서 active 제거
    const allBtns = document.querySelectorAll('.category-btn');
    console.log('🔘 찾은 카테고리 버튼 수:', allBtns.length);
    
    allBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 선택된 버튼에 active 추가
    const selectedBtn = document.querySelector(`[data-category="${categoryId}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
        console.log('✅ 선택된 버튼에 active 추가:', selectedBtn.textContent);
    } else {
        console.error('❌ 선택된 버튼을 찾을 수 없음:', categoryId);
    }
    
    // 게시글 로드
    console.log('📄 게시글 로드 시작...');
    loadPosts();
}

// 개념글 모드 토글
function toggleConceptMode() {
    isConceptMode = !isConceptMode;
    currentPage = 1;
    
    const btn = document.getElementById('concept-posts-btn');
    const sortSelect = document.getElementById('sort-select');
    
    if (isConceptMode) {
        // 개념글 모드 활성화
        btn.classList.remove('border-gray-300', 'hover:bg-gray-50');
        btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
        btn.textContent = '개념글 ON';
        
        // 정렬을 인기순으로 고정
        currentSort = 'popular';
        sortSelect.value = 'popular';
        sortSelect.disabled = true;
        sortSelect.classList.add('bg-gray-100', 'text-gray-500');
    } else {
        // 개념글 모드 비활성화
        btn.classList.add('border-gray-300', 'hover:bg-gray-50');
        btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
        btn.textContent = '개념글';
        
        // 정렬 선택 활성화
        currentSort = 'latest';
        sortSelect.value = 'latest';
        sortSelect.disabled = false;
        sortSelect.classList.remove('bg-gray-100', 'text-gray-500');
    }
    
    loadPosts();
}

// 게시글 로드
async function loadPosts() {
    console.log('📄 게시글 로드 시작 - 상태:', {
        currentCategory,
        currentPage,
        currentSort,
        currentSearch,
        isConceptMode
    });
    
    try {
        showLoading();
        
        const params = new URLSearchParams({
            page: currentPage,
            limit: 20,
            sort: currentSort
        });
        
        // 카테고리 필터 (전체가 아닌 경우만)
        if (currentCategory && currentCategory !== 'all') {
            params.append('category_id', currentCategory);
            console.log('🏷️ 카테고리 필터 적용:', currentCategory);
        } else {
            console.log('🏷️ 전체 카테고리 선택됨');
        }
        
        if (currentSearch.trim()) {
            params.append('search', currentSearch.trim());
            console.log('🔍 검색어 적용:', currentSearch);
        }
        
        // 개념글 모드에서는 최소 좋아요 수 필터 추가
        if (isConceptMode) {
            params.append('min_likes', '10');
            console.log('💯 개념글 모드 활성화');
        }
        
        const apiUrl = `/api/discussions/posts?${params}`;
        console.log('📡 API 호출 URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        console.log('📶 API 응답 상태:', response.status, response.statusText);
        
        if (!response.ok) {
            console.error('❌ API 요청 실패:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📋 게시글 API 응답:', data);
        
        if (data.success && data.data) {
            console.log('✅ 게시글 로드 성공:', data.data.posts?.length || 0, '개');
            
            // 게시글이 없어도 정상 처리
            const posts = data.data.posts || [];
            const pagination = data.data.pagination || { page: 1, pages: 1 };
            
            renderPosts(posts);
            renderPagination(pagination);
            
            if (posts.length > 0) {
                showPosts();
            } else {
                showEmpty();
            }
        } else {
            console.warn('⚠️ 게시글 API 응답 형식 오류:', data);
            showEmpty();
        }
        
    } catch (error) {
        console.error('❌ 게시글 로드 오류:', error.message);
        console.error('❌ 에러 스택:', error.stack);
        showEmpty();
    }
}

// 로딩 표시
function showLoading() {
    document.getElementById('posts-loading').classList.remove('hidden');
    document.getElementById('posts-container').classList.add('hidden');
    document.getElementById('posts-empty').classList.add('hidden');
}

// 게시글 표시
function showPosts() {
    document.getElementById('posts-loading').classList.add('hidden');
    document.getElementById('posts-container').classList.remove('hidden');
    document.getElementById('posts-empty').classList.add('hidden');
}

// 빈 상태 표시
function showEmpty() {
    document.getElementById('posts-loading').classList.add('hidden');
    document.getElementById('posts-container').classList.add('hidden');
    document.getElementById('posts-empty').classList.remove('hidden');
}

// 시간 포맷 함수 - 당일: 시간만 (24시간), 다른 날: 날짜만
function formatPostTime(createdAt) {
    const date = new Date(createdAt);
    const now = new Date();
    
    // 한국 시간대로 변환
    const koreaOffset = 9 * 60; // UTC+9
    const localOffset = now.getTimezoneOffset();
    const offsetDiff = (koreaOffset + localOffset) * 60 * 1000;
    
    const koreaDate = new Date(date.getTime() + offsetDiff);
    const koreaToday = new Date(now.getTime() + offsetDiff);
    
    // 같은 날짜인지 확인
    const isSameDay = koreaDate.getFullYear() === koreaToday.getFullYear() &&
                      koreaDate.getMonth() === koreaToday.getMonth() &&
                      koreaDate.getDate() === koreaToday.getDate();
    
    if (isSameDay) {
        // 당일 글: 24시간 형식 시간만 (예: 13:06)
        const hours = koreaDate.getHours().toString().padStart(2, '0');
        const minutes = koreaDate.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } else {
        // 다른 날: 날짜만 (예: 1/30)
        const month = koreaDate.getMonth() + 1;
        const day = koreaDate.getDate();
        return `${month}/${day}`;
    }
}

// 게시글 렌더링 - 리디자인 버전 (제목 강조, 메타정보 톤다운)
function renderPosts(posts) {
    const container = document.getElementById('posts-list');
    if (!container) return;
    
    if (posts.length === 0) {
        showEmpty();
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const category = categories.find(c => c.id === post.category_id);
        
        // 시간 포맷 (당일: 시간만, 다른 날: 날짜만)
        const timeDisplay = formatPostTime(post.created_at);
        
        // 티어 아이콘과 닉네임
        const tierIcon = post.tier_icon || '⚪';
        const authorName = post.author_name || '익명';
        const categoryName = category?.name || '일반';
        
        return `
            <div class="discussion-post-item" onclick="goToPost(${post.id})">
                <!-- 제목 줄 -->
                <div class="flex items-start gap-2 mb-1">
                    ${post.is_notice ? `<span class="flex-shrink-0 text-xs font-medium text-purple-600">[공지]</span>` : ''}
                    ${post.is_pinned && !post.is_notice ? `<span class="flex-shrink-0 text-xs font-medium text-yellow-600">[고정]</span>` : ''}
                    <h3 class="post-title flex-1 min-w-0 truncate">
                        ${post.title}
                        ${post.media_urls && post.media_urls.length > 0 ? `<i data-lucide="image" class="inline w-3.5 h-3.5 ml-1 text-gray-400"></i>` : ''}
                        ${(post.comment_count || 0) > 0 ? `<span class="ml-1 text-blue-500 font-medium text-sm">[${post.comment_count}]</span>` : ''}
                    </h3>
                </div>
                
                <!-- 메타 정보 줄 -->
                <div class="post-meta">
                    <span class="post-category-tag">${categoryName}</span>
                    <span class="separator">·</span>
                    <span>${tierIcon} ${authorName}</span>
                    <span class="separator">·</span>
                    <span>${timeDisplay}</span>
                    <span class="separator">·</span>
                    <span class="post-stats">
                        <i data-lucide="eye" class="w-3 h-3"></i>
                        ${post.view_count || 0}
                    </span>
                    <button class="post-stats like-btn hover:text-red-500 transition-colors ${post.user_liked ? 'text-red-500' : ''}"
                            data-post-id="${post.id}"
                            data-liked="${post.user_liked ? 'true' : 'false'}"
                            onclick="event.stopPropagation(); toggleLike(${post.id}, this)">
                        <i data-lucide="heart" class="w-3 h-3 ${post.user_liked ? 'fill-current' : ''}"></i>
                        <span class="like-count">${post.like_count || 0}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Lucide 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}


// 페이지네이션 렌더링
function renderPagination(pagination) {
    const container = document.getElementById('pagination-container');
    if (!container) return;
    
    if (pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    const currentPage = pagination.page;
    const totalPages = pagination.pages;
    
    let paginationHTML = '<div class="flex items-center justify-center space-x-2">';
    
    // 이전 페이지
    if (currentPage > 1) {
        paginationHTML += `
            <button onclick="changePage(${currentPage - 1})" 
                    class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                이전
            </button>
        `;
    }
    
    // 페이지 번호들
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentPage;
        paginationHTML += `
            <button onclick="changePage(${i})" 
                    class="px-3 py-2 text-sm border rounded-md transition-colors
                           ${isActive ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}">
                ${i}
            </button>
        `;
    }
    
    // 다음 페이지
    if (currentPage < totalPages) {
        paginationHTML += `
            <button onclick="changePage(${currentPage + 1})" 
                    class="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                다음
            </button>
        `;
    }
    
    paginationHTML += '</div>';
    container.innerHTML = paginationHTML;
}

// 페이지 변경
window.changePage = function(page) {
    currentPage = page;
    loadPosts();
    
    // 페이지 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 게시글 상세 페이지로 이동
window.goToPost = function(postId) {
    window.location.href = `discussion-post.html?id=${postId}`;
};

// 좋아요 토글
window.toggleLike = async function(postId, buttonElement) {
    if (!auth.isLoggedIn()) {
        alert('로그인이 필요합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    try {
        const token = auth.getToken();
        const response = await fetch(`/api/discussions/posts/${postId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // 현재 좋아요 수 가져오기
            const likeCountSpan = buttonElement.querySelector('.like-count');
            let currentCount = parseInt(likeCountSpan.textContent) || 0;
            
            // 좋아요 상태 토글
            const isLiked = data.liked;
            
            // UI 업데이트
            if (isLiked) {
                buttonElement.classList.add('text-red-500');
                buttonElement.querySelector('i').classList.add('fill-current');
                likeCountSpan.textContent = currentCount + 1;
            } else {
                buttonElement.classList.remove('text-red-500');
                buttonElement.querySelector('i').classList.remove('fill-current');
                likeCountSpan.textContent = Math.max(0, currentCount - 1);
            }
            
            buttonElement.dataset.liked = isLiked ? 'true' : 'false';
            
            // 같은 게시글의 다른 버튼도 업데이트 (데스크톱/모바일)
            document.querySelectorAll(`[data-post-id="${postId}"]`).forEach(btn => {
                if (btn !== buttonElement) {
                    const otherCountSpan = btn.querySelector('.like-count');
                    if (isLiked) {
                        btn.classList.add('text-red-500');
                        btn.querySelector('i')?.classList.add('fill-current');
                        if (otherCountSpan) otherCountSpan.textContent = currentCount + 1;
                    } else {
                        btn.classList.remove('text-red-500');
                        btn.querySelector('i')?.classList.remove('fill-current');
                        if (otherCountSpan) otherCountSpan.textContent = Math.max(0, currentCount - 1);
                    }
                    btn.dataset.liked = isLiked ? 'true' : 'false';
                }
            });
        } else {
            alert(data.message || '좋아요 처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('좋아요 오류:', error);
        alert('좋아요 처리 중 오류가 발생했습니다.');
    }
};

// 이벤트 리스너 설정
function setupEventListeners() {
    // 카테고리 이벤트 리스너 설정
    setupCategoryEventListeners();
    
    // 새 글 작성 버튼
    const newPostBtn = document.getElementById('new-post-btn');
    newPostBtn?.addEventListener('click', () => {
        if (!auth.isLoggedIn()) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }
        openPostModal(false);
    });
    
    // 첫 번째 글 작성 버튼
    const firstPostBtn = document.getElementById('first-post-btn');
    firstPostBtn?.addEventListener('click', () => {
        if (!auth.isLoggedIn()) {
            alert('로그인이 필요합니다.');
            window.location.href = 'login.html';
            return;
        }
        openPostModal(false);
    });
    
    // 관리자 공지 작성 버튼
    const adminNoticeBtn = document.getElementById('admin-notice-btn');
    adminNoticeBtn?.addEventListener('click', () => {
        openPostModal(true);
    });
    
    // 검색
    const searchInput = document.getElementById('search-input');
    searchInput?.addEventListener('input', debounce((e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadPosts();
    }, 500));
    
    // 정렬
    const sortSelect = document.getElementById('sort-select');
    sortSelect?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        loadPosts();
    });
    
    // 개념글 버튼
    const conceptBtn = document.getElementById('concept-posts-btn');
    conceptBtn?.addEventListener('click', toggleConceptMode);
    
    // 모달 이벤트
    setupModalEventListeners();
}

// 모달 이벤트 리스너 설정
function setupModalEventListeners() {
    const modal = document.getElementById('post-modal');
    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const form = document.getElementById('post-form');
    
    // 모달 닫기
    const closeModal = () => {
        modal.classList.add('hidden');
        form.reset();
        clearMediaInputs();
    };
    
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    
    // 모달 외부 클릭 방지 (사용자가 실수로 닫지 않도록)
    // modal?.addEventListener('click', (e) => {
    //     if (e.target === modal) {
    //         closeModal();
    //     }
    // });
    
    // 폼 제출
    form?.addEventListener('submit', handlePostSubmit);
    
    // 미디어 관련 이벤트 리스너
    setupMediaEventListeners();
}

// 미디어 관련 이벤트 리스너 설정
function setupMediaEventListeners() {
    const container = document.getElementById('media-container');
    
    // 이벤트 위임으로 동적으로 추가되는 버튼들 처리
    container?.addEventListener('click', (e) => {
        if (e.target.closest('.add-media-btn')) {
            addMediaInput();
        } else if (e.target.closest('.remove-media-btn')) {
            removeMediaInput(e.target.closest('.media-input-group'));
        }
    });
    
    // 미디어 URL 입력시 미리보기
    container?.addEventListener('input', debounce((e) => {
        if (e.target.classList.contains('media-url-input')) {
            updateMediaPreview();
        }
    }, 500));
}

// 미디어 입력 필드 추가
function addMediaInput() {
    const container = document.getElementById('media-container');
    const newGroup = document.createElement('div');
    newGroup.className = 'media-input-group flex space-x-2';
    newGroup.innerHTML = `
        <input type="url" class="media-url-input flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="이미지 URL 또는 YouTube 링크를 입력하세요">
        <button type="button" class="remove-media-btn bg-red-100 hover:bg-red-200 text-red-600 px-3 py-2 rounded-lg transition-colors">
            <i data-lucide="minus" class="w-4 h-4"></i>
        </button>
    `;
    
    container.appendChild(newGroup);
    
    // 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 미디어 입력 필드 제거
function removeMediaInput(group) {
    group.remove();
    updateMediaPreview();
}

// 미디어 입력 필드 초기화
function clearMediaInputs() {
    const container = document.getElementById('media-container');
    const inputs = container.querySelectorAll('.media-input-group');
    
    // 첫 번째는 유지하고 나머지 제거
    for (let i = 1; i < inputs.length; i++) {
        inputs[i].remove();
    }
    
    // 첫 번째 입력 필드 초기화
    const firstInput = container.querySelector('.media-url-input');
    if (firstInput) {
        firstInput.value = '';
    }
    
    // 미리보기 숨기기
    const preview = document.getElementById('media-preview');
    preview?.classList.add('hidden');
}

// 미디어 미리보기 업데이트
function updateMediaPreview() {
    const inputs = document.querySelectorAll('.media-url-input');
    const urls = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(url => url);
    
    const preview = document.getElementById('media-preview');
    const previewContent = document.getElementById('media-preview-content');
    
    if (urls.length === 0) {
        preview?.classList.add('hidden');
        return;
    }
    
    preview?.classList.remove('hidden');
    previewContent.innerHTML = urls.map(url => {
        const mediaInfo = detectMediaType(url);
        return createMediaPreview(url, mediaInfo.type);
    }).join('');
}

// 미디어 타입 감지
function detectMediaType(url) {
    if (!url) return { type: 'unknown', url };
    
    // YouTube URL 패턴
    const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of youtubePatterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                type: 'youtube',
                url,
                videoId: match[1],
                embedUrl: `https://www.youtube.com/embed/${match[1]}`,
                thumbnailUrl: `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`
            };
        }
    }
    
    // 이미지 URL 패턴
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
    if (imageExtensions.test(url)) {
        return { type: 'image', url };
    }
    
    // 비디오 URL 패턴
    const videoExtensions = /\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i;
    if (videoExtensions.test(url)) {
        return { type: 'video', url };
    }
    
    return { type: 'unknown', url };
}

// 미디어 미리보기 생성
function createMediaPreview(url, type) {
    const mediaInfo = detectMediaType(url);
    
    switch (mediaInfo.type) {
        case 'youtube':
            return `
                <div class="border border-gray-200 rounded-lg p-3 bg-white">
                    <div class="flex items-start space-x-3">
                        <img src="${mediaInfo.thumbnailUrl}" alt="YouTube thumbnail" 
                             class="w-20 h-15 object-cover rounded" onerror="this.style.display='none'">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">YouTube 동영상</p>
                            <p class="text-xs text-gray-500 truncate">${url}</p>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 mt-1">
                                <i data-lucide="play" class="w-3 h-3 mr-1"></i>YouTube
                            </span>
                        </div>
                    </div>
                </div>
            `;
        case 'image':
            return `
                <div class="border border-gray-200 rounded-lg p-3 bg-white">
                    <div class="flex items-start space-x-3">
                        <img src="${url}" alt="이미지 미리보기" 
                             class="w-20 h-15 object-cover rounded" onerror="this.style.display='none'">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">이미지</p>
                            <p class="text-xs text-gray-500 truncate">${url}</p>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 mt-1">
                                <i data-lucide="image" class="w-3 h-3 mr-1"></i>이미지
                            </span>
                        </div>
                    </div>
                </div>
            `;
        case 'video':
            return `
                <div class="border border-gray-200 rounded-lg p-3 bg-white">
                    <div class="flex items-start space-x-3">
                        <div class="w-20 h-15 bg-gray-100 rounded flex items-center justify-center">
                            <i data-lucide="video" class="w-6 h-6 text-gray-400"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">동영상</p>
                            <p class="text-xs text-gray-500 truncate">${url}</p>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 mt-1">
                                <i data-lucide="video" class="w-3 h-3 mr-1"></i>동영상
                            </span>
                        </div>
                    </div>
                </div>
            `;
        default:
            return `
                <div class="border border-gray-200 rounded-lg p-3 bg-white">
                    <div class="flex items-start space-x-3">
                        <div class="w-20 h-15 bg-gray-100 rounded flex items-center justify-center">
                            <i data-lucide="link" class="w-6 h-6 text-gray-400"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-gray-900 truncate">링크</p>
                            <p class="text-xs text-gray-500 truncate">${url}</p>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 mt-1">
                                <i data-lucide="link" class="w-3 h-3 mr-1"></i>링크
                            </span>
                        </div>
                    </div>
                </div>
            `;
    }
}

// 게시글 작성 모달 열기
function openPostModal(isNotice = false) {
    const modal = document.getElementById('post-modal');
    const modalTitle = document.getElementById('modal-title');
    const noticeOptions = document.getElementById('notice-options');
    const submitBtn = document.getElementById('submit-btn');
    
    console.log('모달 열기. 카테고리 상태:', categories.length, '개');
    
    // 카테고리 옵션이 아직 렌더링되지 않았다면 다시 시도
    const selectElement = document.getElementById('post-category');
    if (selectElement && selectElement.children.length <= 1) {
        console.log('카테고리 옵션이 비어있음, 다시 렌더링 시도');
        renderCategoryOptions();
    }
    
    if (isNotice) {
        modalTitle.textContent = '공지사항 작성';
        noticeOptions.classList.remove('hidden');
        submitBtn.textContent = '공지 작성';
        submitBtn.className = 'px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors';
    } else {
        modalTitle.textContent = '새 글 작성';
        noticeOptions.classList.add('hidden');
        submitBtn.textContent = '작성';
        submitBtn.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors';
    }
    
    modal.dataset.isNotice = isNotice;
    modal.classList.remove('hidden');
}

// 게시글 제출 처리
async function handlePostSubmit(e) {
    e.preventDefault();
    
    const modal = document.getElementById('post-modal');
    const isNotice = modal.dataset.isNotice === 'true';
    const submitBtn = document.getElementById('submit-btn');
    
    const formData = new FormData(e.target);
    const postData = {
        title: formData.get('title'),
        content: formData.get('content'),
        category_id: formData.get('category_id')
    };
    
    console.log('게시글 제출 데이터:', postData);
    
    if (isNotice) {
        postData.is_pinned = formData.get('is_pinned') === 'on';
    }
    
    // 미디어 URL 수집
    const mediaInputs = document.querySelectorAll('.media-url-input');
    const mediaUrls = Array.from(mediaInputs)
        .map(input => input.value.trim())
        .filter(url => url);
    
    if (mediaUrls.length > 0) {
        postData.media_urls = mediaUrls;
        postData.media_types = mediaUrls.map(url => {
            const mediaInfo = detectMediaType(url);
            return mediaInfo.type;
        });
    }
    
    // 유효성 검사
    if (!postData.title.trim()) {
        alert('제목을 입력해주세요.');
        return;
    }
    if (!postData.content.trim()) {
        alert('내용을 입력해주세요.');
        return;
    }
    if (!postData.category_id) {
        alert('카테고리를 선택해주세요.');
        console.error('카테고리 선택 안됨. 사용 가능한 카테고리:', categories);
        return;
    }
    // '전체' 카테고리는 필터용이므로 글 작성 금지
    if (postData.category_id === 'all' || postData.category_id === '0') {
        alert('전체 카테고리에는 글을 작성할 수 없습니다. 다른 카테고리를 선택해주세요.');
        return;
    }
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = '작성 중...';
        
        const endpoint = isNotice ? '/api/discussions/posts/notice' : '/api/discussions/posts';
        const token = auth.getToken();
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(postData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(isNotice ? '공지글이 작성되었습니다.' : '게시글이 작성되었습니다.');
            modal.classList.add('hidden');
            e.target.reset();
            
            // 목록 새로고침
            currentPage = 1;
            await loadPosts();
        } else {
            alert(data.message || '작성 중 오류가 발생했습니다.');
        }
        
    } catch (error) {
        console.error('게시글 작성 오류:', error);
        alert('작성 중 오류가 발생했습니다.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isNotice ? '공지 작성' : '작성';
    }
}

// 디바운스 유틸리티
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 페이지 로드시 초기화
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('discussions.html')) {
        renderDiscussionsPage();
    }
});