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
    
    // 관리자 권한 확인
    await checkAdminStatus();
    
    // 카테고리 로드
    await loadCategories();
    
    // 게시글 로드
    await loadPosts();
    
    // 이벤트 리스너 설정
    setupEventListeners();
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
    try {
        const response = await fetch('/api/discussions/categories');
        const data = await response.json();
        
        if (data.success) {
            categories = data.data;
            renderCategoryFilter();
            renderCategoryOptions();
        }
        
    } catch (error) {
        console.error('카테고리 로드 오류:', error);
    }
}

// 카테고리 필터 렌더링
function renderCategoryFilter() {
    const filterContainer = document.getElementById('category-filter');
    if (!filterContainer) return;
    
    // 전체 버튼은 유지
    const allBtn = filterContainer.querySelector('[data-category="all"]');
    
    // 기존 카테고리 버튼들 제거
    const existingBtns = filterContainer.querySelectorAll('.category-btn:not([data-category="all"])');
    existingBtns.forEach(btn => btn.remove());
    
    // 새 카테고리 버튼들 추가
    categories.forEach(category => {
        if (category.name === '전체') return; // 전체는 이미 있음
        
        const btn = document.createElement('button');
        btn.className = 'category-btn px-3 py-1.5 rounded-full text-sm font-medium border transition-colors';
        btn.dataset.category = category.id;
        btn.style.borderColor = category.color;
        btn.innerHTML = `${category.icon || ''} ${category.name}`;
        
        btn.addEventListener('click', () => {
            selectCategory(category.id);
        });
        
        filterContainer.appendChild(btn);
    });
}

// 카테고리 옵션 렌더링 (모달용)
function renderCategoryOptions() {
    const selectElement = document.getElementById('post-category');
    if (!selectElement) return;
    
    // 기존 옵션들 제거 (첫 번째 option은 유지)
    while (selectElement.children.length > 1) {
        selectElement.removeChild(selectElement.lastChild);
    }
    
    // 카테고리 옵션 추가
    categories.forEach(category => {
        if (category.name === '전체') return; // 전체는 선택 불가
        
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.icon || ''} ${category.name}`;
        selectElement.appendChild(option);
    });
}

// 카테고리 선택
function selectCategory(categoryId) {
    currentCategory = categoryId;
    currentPage = 1;
    
    // 버튼 스타일 업데이트
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('border-gray-300', 'text-gray-600', 'hover:border-gray-400');
        btn.classList.remove('border-blue-500', 'text-blue-600', 'bg-blue-50');
    });
    
    const selectedBtn = document.querySelector(`[data-category="${categoryId}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
        selectedBtn.classList.remove('border-gray-300', 'text-gray-600', 'hover:border-gray-400');
        selectedBtn.classList.add('border-blue-500', 'text-blue-600', 'bg-blue-50');
    }
    
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
    try {
        showLoading();
        
        const params = new URLSearchParams({
            category_id: currentCategory,
            page: currentPage,
            limit: 20,
            sort: currentSort
        });
        
        if (currentSearch.trim()) {
            params.append('search', currentSearch.trim());
        }
        
        // 개념글 모드에서는 최소 좋아요 수 필터 추가
        if (isConceptMode) {
            params.append('min_likes', '10'); // 최소 10개 이상의 좋아요
        }
        
        const response = await fetch(`/api/discussions/posts?${params}`);
        const data = await response.json();
        
        if (data.success) {
            renderPosts(data.data.posts);
            renderPagination(data.data.pagination);
            showPosts();
        } else {
            showEmpty();
        }
        
    } catch (error) {
        console.error('게시글 로드 오류:', error);
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

// 게시글 렌더링
function renderPosts(posts) {
    const container = document.getElementById('posts-list');
    if (!container) return;
    
    if (posts.length === 0) {
        showEmpty();
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const category = categories.find(c => c.id === post.category_id);
        const categoryDisplay = category ? `${category.icon || ''} ${category.name}` : '';
        const categoryColor = category?.color || '#6B7280';
        
        // 미디어 미리보기 생성
        const mediaPreview = createPostMediaPreview(post.media_urls, post.media_types, post.id);
        
        return `
            <div class="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                <div class="p-4 md:p-6">
                    <div class="flex items-start space-x-4">
                        <div class="flex-1">
                            <!-- Post Header -->
                            <div class="flex items-center space-x-3 mb-3">
                                ${post.is_notice ? `
                                    <span class="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-medium">공지</span>
                                ` : ''}
                                ${post.is_pinned ? `
                                    <span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">고정</span>
                                ` : ''}
                                <span class="text-xs font-medium px-2 py-1 rounded-full" 
                                      style="background-color: ${categoryColor}20; color: ${categoryColor}">
                                    ${categoryDisplay}
                                </span>
                                <span class="text-xs text-gray-500">
                                    ${new Date(post.created_at).toLocaleDateString('ko-KR')}
                                </span>
                            </div>
                            
                            <!-- Post Title -->
                            <h3 class="text-lg font-semibold text-gray-900 mb-2 hover:text-blue-600 cursor-pointer transition-colors"
                                onclick="goToPost(${post.id})">
                                ${post.title}
                            </h3>
                            
                            <!-- Post Preview -->
                            <p class="text-gray-600 text-sm mb-3 line-clamp-2">
                                ${post.content_preview || ''}
                            </p>
                            
                            <!-- Media Preview -->
                            ${mediaPreview}
                            
                            <!-- Post Stats -->
                            <div class="flex items-center space-x-4 text-xs text-gray-500">
                                <span class="flex items-center">
                                    <i data-lucide="user" class="w-3 h-3 mr-1"></i>
                                    ${post.author_name || '익명'}
                                </span>
                                <span class="flex items-center">
                                    <i data-lucide="eye" class="w-3 h-3 mr-1"></i>
                                    ${post.view_count || 0}
                                </span>
                                <span class="flex items-center">
                                    <i data-lucide="message-circle" class="w-3 h-3 mr-1"></i>
                                    ${post.comment_count || 0}
                                </span>
                                <span class="flex items-center">
                                    <i data-lucide="heart" class="w-3 h-3 mr-1"></i>
                                    ${post.like_count || 0}
                                </span>
                                ${post.media_urls && post.media_urls.length > 0 ? `
                                    <span class="flex items-center text-blue-500">
                                        <i data-lucide="paperclip" class="w-3 h-3 mr-1"></i>
                                        ${post.media_urls.length}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Lucide 아이콘 초기화
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// 게시글 목록용 미디어 미리보기 생성
function createPostMediaPreview(mediaUrls, mediaTypes, postId) {
    if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
        return '';
    }
    
    // 첫 번째 미디어만 미리보기로 표시
    const firstUrl = mediaUrls[0];
    const firstType = mediaTypes?.[0] || 'unknown';
    const remainingCount = mediaUrls.length - 1;
    
    const mediaInfo = detectMediaType(firstUrl);
    
    let previewHtml = '';
    
    switch (mediaInfo.type) {
        case 'youtube':
            previewHtml = `
                <div class="mb-3">
                    <div class="relative">
                        <img src="${mediaInfo.thumbnailUrl}" alt="YouTube thumbnail" 
                             class="w-full h-32 object-cover rounded-lg cursor-pointer"
                             onclick="goToPost(${postId})"
                             onerror="this.style.display='none'">
                        <div class="absolute inset-0 bg-black bg-opacity-30 rounded-lg flex items-center justify-center">
                            <div class="bg-white bg-opacity-90 rounded-full p-2">
                                <i data-lucide="play" class="w-6 h-6 text-red-600"></i>
                            </div>
                        </div>
                        ${remainingCount > 0 ? `
                            <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                                +${remainingCount}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            break;
        case 'image':
            previewHtml = `
                <div class="mb-3">
                    <div class="relative">
                        <img src="${firstUrl}" alt="이미지 미리보기" 
                             class="w-full h-32 object-cover rounded-lg cursor-pointer"
                             onclick="goToPost(${postId})"
                             onerror="this.style.display='none'">
                        ${remainingCount > 0 ? `
                            <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                                +${remainingCount}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            break;
        case 'video':
            previewHtml = `
                <div class="mb-3">
                    <div class="relative">
                        <div class="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer"
                             onclick="goToPost(${postId})">
                            <i data-lucide="play-circle" class="w-8 h-8 text-gray-400"></i>
                        </div>
                        ${remainingCount > 0 ? `
                            <div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                                +${remainingCount}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            break;
        default:
            // 미디어가 있지만 미리보기가 불가능한 경우 작은 표시만
            if (mediaUrls.length > 0) {
                previewHtml = `
                    <div class="mb-2">
                        <div class="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                            <i data-lucide="link" class="w-3 h-3 mr-1"></i>
                            첨부파일 ${mediaUrls.length}개
                        </div>
                    </div>
                `;
            }
    }
    
    return previewHtml;
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

// 이벤트 리스너 설정
function setupEventListeners() {
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
    
    // 모달 외부 클릭시 닫기
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
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
    if (!postData.title.trim() || !postData.content.trim() || !postData.category_id) {
        alert('모든 필드를 입력해주세요.');
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