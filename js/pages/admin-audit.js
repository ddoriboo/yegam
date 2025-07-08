/**
 * Admin Audit Page JavaScript
 * 관리자 감사 로그 및 보안 모니터링 페이지 스크립트
 */

class AdminAuditManager {
    constructor() {
        this.currentTab = 'logs';
        this.currentPage = 1;
        this.currentAlertId = null;
        this.autoRefreshInterval = null;
        
        this.init();
    }

    async init() {
        // 초기 데이터 로드
        await this.loadSystemStatus();
        await this.loadAuditLogs();
        
        // 자동 새로고침 시작 (30초마다)
        this.startAutoRefresh();
        
        console.log('✅ 관리자 감사 페이지 초기화 완료');
    }

    // ===================== 시스템 상태 =====================

    async loadSystemStatus() {
        try {
            const response = await fetch('/api/admin/audit/status', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('시스템 상태 조회 실패');

            const data = await response.json();
            if (data.success) {
                this.updateStatusDisplay(data.status);
            }
        } catch (error) {
            console.error('시스템 상태 로드 오류:', error);
            this.showError('시스템 상태를 불러오는데 실패했습니다.');
        }
    }

    updateStatusDisplay(status) {
        document.getElementById('totalLogs').textContent = status.totalAuditLogs.toLocaleString();
        document.getElementById('openAlerts').textContent = status.openAlerts.toLocaleString();
        document.getElementById('activeRules').textContent = status.activeRules.toLocaleString();
        document.getElementById('todayLogs').textContent = status.todayLogs.toLocaleString();
    }

    // ===================== 탭 관리 =====================

    switchTab(tabName) {
        // 탭 버튼 업데이트
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');

        // 탭 컨텐츠 업데이트
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        document.getElementById(`${tabName}Tab`).classList.remove('hidden');

        this.currentTab = tabName;

        // 탭별 데이터 로드
        switch (tabName) {
            case 'logs':
                this.loadAuditLogs();
                break;
            case 'alerts':
                this.loadAlerts();
                break;
            case 'rules':
                this.loadRules();
                break;
            case 'stats':
                this.loadStats();
                break;
        }
    }

    // ===================== 감사 로그 =====================

    async loadAuditLogs(page = 1) {
        try {
            this.showLoading('logs');
            
            const params = new URLSearchParams({
                page: page,
                limit: 20
            });

            // 필터 적용
            const action = document.getElementById('actionFilter')?.value;
            const fieldName = document.getElementById('fieldFilter')?.value;
            const startDate = document.getElementById('startDateFilter')?.value;
            const endDate = document.getElementById('endDateFilter')?.value;
            const issueId = document.getElementById('issueIdFilter')?.value;

            if (action) params.append('action', action);
            if (fieldName) params.append('field_name', fieldName);
            if (startDate) params.append('start_date', startDate + 'T00:00:00Z');
            if (endDate) params.append('end_date', endDate + 'T23:59:59Z');
            if (issueId) params.append('issue_id', issueId);

            const response = await fetch(`/api/admin/audit/logs?${params}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('감사 로그 조회 실패');

            const data = await response.json();
            if (data.success) {
                this.displayAuditLogs(data.data.logs);
                this.updatePagination(data.data.pagination, 'logs');
                document.getElementById('logsTotal').textContent = `총 ${data.data.pagination.total.toLocaleString()}개`;
            }
        } catch (error) {
            console.error('감사 로그 로드 오류:', error);
            this.showError('감사 로그를 불러오는데 실패했습니다.');
        } finally {
            this.hideLoading('logs');
        }
    }

    displayAuditLogs(logs) {
        const container = document.getElementById('logsList');
        
        if (logs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>조건에 맞는 감사 로그가 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = logs.map(log => this.createLogEntry(log)).join('');
    }

    createLogEntry(log) {
        const actionClass = this.getActionClass(log.action);
        const timeAgo = this.getTimeAgo(log.created_at);
        
        return `
            <div class="log-entry">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-3">
                        <span class="action-badge ${actionClass}">${this.getActionLabel(log.action)}</span>
                        ${log.issue_title ? `<span class="text-sm text-gray-300">이슈: ${log.issue_title}</span>` : ''}
                        ${log.field_name ? `<span class="text-xs bg-gray-700 px-2 py-1 rounded">${log.field_name}</span>` : ''}
                    </div>
                    <span class="text-xs text-gray-400">${timeAgo}</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                        <span class="text-gray-400">실행자:</span>
                        <span class="ml-2">${this.getActorName(log)}</span>
                    </div>
                    
                    ${log.old_value ? `
                        <div>
                            <span class="text-gray-400">이전 값:</span>
                            <span class="ml-2 text-red-300">${this.truncateText(log.old_value, 30)}</span>
                        </div>
                    ` : ''}
                    
                    ${log.new_value ? `
                        <div>
                            <span class="text-gray-400">새 값:</span>
                            <span class="ml-2 text-green-300">${this.truncateText(log.new_value, 30)}</span>
                        </div>
                    ` : ''}
                    
                    <div>
                        <span class="text-gray-400">소스:</span>
                        <span class="ml-2">${log.change_source}</span>
                    </div>
                    
                    ${log.ip_address ? `
                        <div>
                            <span class="text-gray-400">IP:</span>
                            <span class="ml-2">${log.ip_address}</span>
                        </div>
                    ` : ''}
                    
                    ${log.validation_status !== 'valid' ? `
                        <div>
                            <span class="text-gray-400">검증:</span>
                            <span class="ml-2 text-yellow-300">${log.validation_status}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${log.metadata ? `
                    <div class="mt-3 pt-3 border-t border-gray-700">
                        <details class="text-xs">
                            <summary class="cursor-pointer text-gray-400 hover:text-white">메타데이터 보기</summary>
                            <pre class="mt-2 bg-gray-800 p-2 rounded text-gray-300 overflow-x-auto">${JSON.stringify(JSON.parse(log.metadata), null, 2)}</pre>
                        </details>
                    </div>
                ` : ''}
            </div>
        `;
    }

    applyLogFilters() {
        this.currentPage = 1;
        this.loadAuditLogs(1);
    }

    // ===================== 보안 알림 =====================

    async loadAlerts() {
        try {
            this.showLoading('alerts');
            
            const status = document.getElementById('alertStatusFilter')?.value || 'open';
            
            const response = await fetch(`/api/admin/audit/alerts?status=${status}&limit=50`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('보안 알림 조회 실패');

            const data = await response.json();
            if (data.success) {
                this.displayAlerts(data.data.alerts);
            }
        } catch (error) {
            console.error('보안 알림 로드 오류:', error);
            this.showError('보안 알림을 불러오는데 실패했습니다.');
        } finally {
            this.hideLoading('alerts');
        }
    }

    displayAlerts(alerts) {
        const container = document.getElementById('alertsList');
        
        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fas fa-shield-alt text-4xl mb-4"></i>
                    <p>보안 알림이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = alerts.map(alert => this.createAlertCard(alert)).join('');
    }

    createAlertCard(alert) {
        const severityClass = `severity-${alert.severity}`;
        const timeAgo = this.getTimeAgo(alert.created_at);
        
        return `
            <div class="alert-card">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center space-x-3">
                        <span class="security-badge ${severityClass}">
                            ${this.getSeverityIcon(alert.severity)} ${alert.severity.toUpperCase()}
                        </span>
                        <span class="text-sm bg-gray-700 px-2 py-1 rounded">${alert.alert_type}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-400">${timeAgo}</span>
                        ${alert.status === 'open' ? `
                            <button onclick="auditManager.showResolveModal(${alert.id})" 
                                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
                                해결
                            </button>
                        ` : `
                            <span class="px-2 py-1 bg-green-600 text-white text-xs rounded">해결됨</span>
                        `}
                    </div>
                </div>
                
                <p class="text-white mb-4">${alert.description}</p>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    ${alert.related_username ? `
                        <div>
                            <span class="text-gray-400">관련 사용자:</span>
                            <span class="ml-2">${alert.related_username}</span>
                        </div>
                    ` : ''}
                    
                    ${alert.related_admin_username ? `
                        <div>
                            <span class="text-gray-400">관련 관리자:</span>
                            <span class="ml-2">${alert.related_admin_username}</span>
                        </div>
                    ` : ''}
                    
                    ${alert.related_issue_ids?.length ? `
                        <div>
                            <span class="text-gray-400">관련 이슈:</span>
                            <span class="ml-2">${alert.related_issue_ids.slice(0, 3).join(', ')}${alert.related_issue_ids.length > 3 ? '...' : ''}</span>
                        </div>
                    ` : ''}
                    
                    ${alert.resolved_by_username ? `
                        <div>
                            <span class="text-gray-400">해결자:</span>
                            <span class="ml-2">${alert.resolved_by_username}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${alert.detection_data ? `
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <details class="text-xs">
                            <summary class="cursor-pointer text-gray-400 hover:text-white">탐지 데이터 보기</summary>
                            <pre class="mt-2 bg-gray-800 p-2 rounded text-gray-300 overflow-x-auto">${JSON.stringify(alert.detection_data, null, 2)}</pre>
                        </details>
                    </div>
                ` : ''}
                
                ${alert.resolution_notes ? `
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <div class="text-sm">
                            <span class="text-gray-400">해결 사유:</span>
                            <p class="mt-1 text-gray-300">${alert.resolution_notes}</p>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async detectSuspiciousPatterns() {
        try {
            const response = await fetch('/api/admin/audit/alerts/detect', {
                method: 'POST',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('패턴 감지 실행 실패');

            const data = await response.json();
            if (data.success) {
                this.showSuccess(data.message);
                await this.loadAlerts();
                await this.loadSystemStatus();
            }
        } catch (error) {
            console.error('패턴 감지 오류:', error);
            this.showError('패턴 감지 실행에 실패했습니다.');
        }
    }

    showResolveModal(alertId) {
        this.currentAlertId = alertId;
        document.getElementById('resolveModal').classList.remove('hidden');
        document.getElementById('resolveModal').classList.add('flex');
        document.getElementById('resolutionNotes').value = '';
    }

    closeResolveModal() {
        this.currentAlertId = null;
        document.getElementById('resolveModal').classList.add('hidden');
        document.getElementById('resolveModal').classList.remove('flex');
    }

    async resolveAlert() {
        if (!this.currentAlertId) return;

        try {
            const resolutionNotes = document.getElementById('resolutionNotes').value;
            
            const response = await fetch(`/api/admin/audit/alerts/${this.currentAlertId}/resolve`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    resolution_notes: resolutionNotes
                })
            });

            if (!response.ok) throw new Error('알림 해결 처리 실패');

            const data = await response.json();
            if (data.success) {
                this.showSuccess('알림이 성공적으로 해결되었습니다.');
                this.closeResolveModal();
                await this.loadAlerts();
                await this.loadSystemStatus();
            }
        } catch (error) {
            console.error('알림 해결 오류:', error);
            this.showError('알림 해결 처리에 실패했습니다.');
        }
    }

    // ===================== 변경 규칙 =====================

    async loadRules() {
        try {
            const response = await fetch('/api/admin/audit/rules', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('변경 규칙 조회 실패');

            const data = await response.json();
            if (data.success) {
                this.displayRules(data.data.rules);
            }
        } catch (error) {
            console.error('변경 규칙 로드 오류:', error);
            this.showError('변경 규칙을 불러오는데 실패했습니다.');
        }
    }

    displayRules(rules) {
        const container = document.getElementById('rulesList');
        
        if (rules.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fas fa-cog text-4xl mb-4"></i>
                    <p>설정된 변경 규칙이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = rules.map(rule => this.createRuleCard(rule)).join('');
    }

    createRuleCard(rule) {
        const statusClass = rule.is_active ? 'text-green-400' : 'text-red-400';
        const statusIcon = rule.is_active ? 'fas fa-check-circle' : 'fas fa-times-circle';
        
        return `
            <div class="glass-effect rounded-lg p-4">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-semibold text-white">${rule.rule_name}</h4>
                        <div class="flex items-center space-x-3 mt-1">
                            <span class="text-sm bg-gray-700 px-2 py-1 rounded">${rule.rule_type}</span>
                            ${rule.field_name ? `<span class="text-xs bg-blue-600 px-2 py-1 rounded">${rule.field_name}</span>` : ''}
                            <span class="${statusClass}">
                                <i class="${statusIcon} mr-1"></i>
                                ${rule.is_active ? '활성' : '비활성'}
                            </span>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="auditManager.editRule(${rule.id})" 
                            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
                            수정
                        </button>
                        <button onclick="auditManager.deleteRule(${rule.id})" 
                            class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">
                            삭제
                        </button>
                    </div>
                </div>
                
                <div class="text-sm text-gray-300">
                    <span class="text-gray-400">제한 데이터:</span>
                    <pre class="mt-1 bg-gray-800 p-2 rounded text-xs overflow-x-auto">${JSON.stringify(rule.restriction_data, null, 2)}</pre>
                </div>
                
                <div class="flex justify-between items-center mt-3 text-xs text-gray-400">
                    <span>생성자: ${rule.created_by_username || 'Unknown'}</span>
                    <span>생성일: ${new Date(rule.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
            </div>
        `;
    }

    // ===================== 통계 =====================

    async loadStats() {
        try {
            const response = await fetch('/api/admin/audit/logs/stats?period=7d', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('통계 조회 실패');

            const data = await response.json();
            if (data.success) {
                this.displayStats(data.stats);
            }
        } catch (error) {
            console.error('통계 로드 오류:', error);
            this.showError('통계를 불러오는데 실패했습니다.');
        }
    }

    displayStats(stats) {
        // 간단한 차트 표시 (실제 프로덕션에서는 Chart.js 등 사용)
        this.displayActionStats(stats.actionStats);
        this.displayFieldStats(stats.fieldStats);
        this.displayDailyActivity(stats.dailyActivity);
        this.displayTopActors(stats.topActors);
    }

    displayActionStats(actionStats) {
        const container = document.getElementById('actionStatsChart');
        const total = actionStats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
        
        container.innerHTML = actionStats.map(stat => {
            const percentage = total > 0 ? (stat.count / total * 100).toFixed(1) : 0;
            return `
                <div class="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                    <span class="text-gray-300">${this.getActionLabel(stat.action)}</span>
                    <div class="flex items-center space-x-2">
                        <span class="text-white font-medium">${stat.count}</span>
                        <span class="text-gray-400">(${percentage}%)</span>
                    </div>
                </div>
            `;
        }).join('') || '<div class="text-center text-gray-400 py-8">데이터가 없습니다.</div>';
    }

    displayFieldStats(fieldStats) {
        const container = document.getElementById('fieldStatsChart');
        const total = fieldStats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
        
        container.innerHTML = fieldStats.map(stat => {
            const percentage = total > 0 ? (stat.count / total * 100).toFixed(1) : 0;
            return `
                <div class="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                    <span class="text-gray-300">${stat.field_name}</span>
                    <div class="flex items-center space-x-2">
                        <span class="text-white font-medium">${stat.count}</span>
                        <span class="text-gray-400">(${percentage}%)</span>
                    </div>
                </div>
            `;
        }).join('') || '<div class="text-center text-gray-400 py-8">데이터가 없습니다.</div>';
    }

    displayDailyActivity(dailyActivity) {
        const container = document.getElementById('dailyActivityChart');
        
        container.innerHTML = dailyActivity.map(day => {
            return `
                <div class="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                    <span class="text-gray-300">${new Date(day.date).toLocaleDateString('ko-KR')}</span>
                    <span class="text-white font-medium">${day.count}건</span>
                </div>
            `;
        }).join('') || '<div class="text-center text-gray-400 py-8">데이터가 없습니다.</div>';
    }

    displayTopActors(topActors) {
        const container = document.getElementById('topActorsChart');
        
        container.innerHTML = topActors.map(actor => {
            const actorTypeIcon = actor.actor_type === 'admin' ? 'fas fa-user-shield' : 
                                 actor.actor_type === 'user' ? 'fas fa-user' : 'fas fa-cog';
            const actorTypeColor = actor.actor_type === 'admin' ? 'text-red-400' : 
                                  actor.actor_type === 'user' ? 'text-blue-400' : 'text-gray-400';
            
            return `
                <div class="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                    <div class="flex items-center space-x-2">
                        <i class="${actorTypeIcon} ${actorTypeColor}"></i>
                        <span class="text-gray-300">${actor.actor_name}</span>
                        <span class="text-xs text-gray-400">(${actor.actor_type})</span>
                    </div>
                    <span class="text-white font-medium">${actor.activity_count}건</span>
                </div>
            `;
        }).join('') || '<div class="text-center text-gray-400 py-8">데이터가 없습니다.</div>';
    }

    // ===================== 유틸리티 함수 =====================

    getActionClass(action) {
        const actionMap = {
            'CREATE': 'action-create',
            'CREATE_ISSUE': 'action-create',
            'ADMIN_CREATE_ISSUE': 'action-create',
            'UPDATE': 'action-update',
            'UPDATE_ISSUE': 'action-update',
            'ADMIN_UPDATE_ISSUE': 'action-update',
            'FIELD_UPDATE': 'action-update',
            'DELETE': 'action-delete',
            'DELETE_ISSUE': 'action-delete',
            'DEADLINE_CHANGE': 'action-deadline',
            'STATUS_CHANGE': 'action-update',
            'TOGGLE_POPULAR': 'action-update'
        };
        return actionMap[action] || 'action-update';
    }

    getActionLabel(action) {
        const labelMap = {
            'CREATE': '생성',
            'CREATE_ISSUE': '이슈 생성',
            'ADMIN_CREATE_ISSUE': '관리자 이슈 생성',
            'UPDATE': '수정',
            'UPDATE_ISSUE': '이슈 수정',
            'ADMIN_UPDATE_ISSUE': '관리자 이슈 수정',
            'FIELD_UPDATE': '필드 수정',
            'DELETE': '삭제',
            'DELETE_ISSUE': '이슈 삭제',
            'DEADLINE_CHANGE': '마감시간 변경',
            'STATUS_CHANGE': '상태 변경',
            'TOGGLE_POPULAR': '인기 토글',
            'VALIDATION_FAILED': '검증 실패'
        };
        return labelMap[action] || action;
    }

    getSeverityIcon(severity) {
        const iconMap = {
            'critical': 'fas fa-exclamation-triangle',
            'high': 'fas fa-exclamation-circle',
            'medium': 'fas fa-exclamation',
            'low': 'fas fa-info-circle'
        };
        return iconMap[severity] || 'fas fa-info-circle';
    }

    getActorName(log) {
        if (log.admin_username) return `${log.admin_username} (관리자)`;
        if (log.username) return log.username;
        return 'System';
    }

    getTimeAgo(dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffInMinutes < 1) return '방금 전';
        if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
        if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}시간 전`;
        return `${Math.floor(diffInMinutes / 1440)}일 전`;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    updatePagination(pagination, type) {
        const container = document.getElementById(`${type}Pagination`);
        if (!container) return;

        const { page, pages, total } = pagination;
        
        if (pages <= 1) {
            container.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // 이전 페이지
        if (page > 1) {
            paginationHTML += `
                <button onclick="auditManager.loadAuditLogs(${page - 1})" 
                    class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
                    이전
                </button>
            `;
        }

        // 페이지 번호들
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === page;
            paginationHTML += `
                <button onclick="auditManager.loadAuditLogs(${i})" 
                    class="px-3 py-1 ${isActive ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'} text-white rounded transition-colors">
                    ${i}
                </button>
            `;
        }

        // 다음 페이지
        if (page < pages) {
            paginationHTML += `
                <button onclick="auditManager.loadAuditLogs(${page + 1})" 
                    class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
                    다음
                </button>
            `;
        }

        container.innerHTML = paginationHTML;
    }

    showLoading(type) {
        const loadingEl = document.getElementById(`${type}Loading`);
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
        }
    }

    hideLoading(type) {
        const loadingEl = document.getElementById(`${type}Loading`);
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }
    }

    showSuccess(message) {
        // 간단한 성공 메시지 표시
        console.log('✅', message);
        alert(message); // 실제로는 더 나은 토스트 알림 사용
    }

    showError(message) {
        console.error('❌', message);
        alert(message); // 실제로는 더 나은 에러 알림 사용
    }

    startAutoRefresh() {
        // 30초마다 자동 새로고침
        this.autoRefreshInterval = setInterval(async () => {
            await this.loadSystemStatus();
            
            // 현재 탭에 따라 데이터 새로고침
            if (this.currentTab === 'logs') {
                await this.loadAuditLogs(this.currentPage);
            } else if (this.currentTab === 'alerts') {
                await this.loadAlerts();
            }
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
}

// 전역 함수들
function switchTab(tabName) {
    auditManager.switchTab(tabName);
}

function applyLogFilters() {
    auditManager.applyLogFilters();
}

function refreshData() {
    auditManager.loadSystemStatus();
    if (auditManager.currentTab === 'logs') {
        auditManager.loadAuditLogs(auditManager.currentPage);
    } else if (auditManager.currentTab === 'alerts') {
        auditManager.loadAlerts();
    } else if (auditManager.currentTab === 'rules') {
        auditManager.loadRules();
    } else if (auditManager.currentTab === 'stats') {
        auditManager.loadStats();
    }
}

function detectSuspiciousPatterns() {
    auditManager.detectSuspiciousPatterns();
}

function closeResolveModal() {
    auditManager.closeResolveModal();
}

function resolveAlert() {
    auditManager.resolveAlert();
}

// 초기화
const auditManager = new AdminAuditManager();