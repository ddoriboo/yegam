import * as backend from '../backend.js';
import { CATEGORIES, CATEGORY_NAMES } from '../../config/constants.js';
import { createIssueCard } from './issue-card.js';

let currentCategory = CATEGORIES.ALL;

export function renderCategoryFilters() {
    const issues = backend.getIssues();
    const categories = [CATEGORIES.ALL, ...new Set(issues.map(issue => issue.category))];
    
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    filtersContainer.innerHTML = categories.map(category => `
        <button 
            class="category-filter-btn category-${category} ${category === CATEGORIES.ALL ? 'active' : ''}" 
            data-category="${category}"
        >
            ${CATEGORY_NAMES[category] || category}
        </button>
    `).join('');
}

export function setupCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    if (!filtersContainer) return;
    
    filtersContainer.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.category-filter-btn');
        if (!filterBtn) return;
        
        const category = filterBtn.dataset.category;
        
        // Update active state
        filtersContainer.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        filterBtn.classList.add('active');
        
        // Update current category and render filtered issues
        currentCategory = category;
        renderFilteredIssues(category);
    });
}

export function renderFilteredIssues(category) {
    const issues = backend.getIssues();
    let filteredIssues;
    
    // Update section title
    const sectionTitle = document.getElementById('section-title');
    const categoryTitles = {
        [CATEGORIES.ALL]: '인기 예측 이슈',
        [CATEGORIES.POLITICS]: '정치 예측 이슈',
        [CATEGORIES.SPORTS]: '스포츠 예측 이슈',
        [CATEGORIES.ECONOMY]: '경제 예측 이슈',
        [CATEGORIES.CRYPTO]: '코인 예측 이슈',
        [CATEGORIES.TECH]: '테크 예측 이슈',
        [CATEGORIES.ENTERTAINMENT]: '엔터 예측 이슈',
        [CATEGORIES.WEATHER]: '날씨 예측 이슈',
        [CATEGORIES.INTERNATIONAL]: '해외 예측 이슈'
    };
    
    if (sectionTitle) {
        sectionTitle.textContent = categoryTitles[category] || `${category} 예측 이슈`;
    }
    
    if (category === CATEGORIES.ALL) {
        filteredIssues = issues.filter(issue => issue.isPopular).slice(0, 2);
    } else {
        filteredIssues = issues.filter(issue => issue.category === category).slice(0, 2);
    }
    
    const grid = document.getElementById('popular-issues-grid');
    if (grid) {
        if (filteredIssues.length > 0) {
            grid.innerHTML = filteredIssues.map(createIssueCard).join('');
        } else {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i data-lucide="folder-search" class="w-16 h-16 mx-auto text-gray-400 mb-4"></i>
                    <p class="text-gray-500">해당 카테고리에 이슈가 없습니다.</p>
                </div>
            `;
        }
        lucide.createIcons();
    }
}