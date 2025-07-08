# Issue Logging System

이슈 마감시간 변경 추적을 위한 간단하지만 효과적인 로깅 시스템입니다. 복잡한 데이터베이스 연결 문제를 피하면서도 강력한 감사 기능을 제공합니다.

## 주요 기능

### 1. 이슈 수정 로깅
- 모든 이슈 생성, 수정, 삭제 추적
- 특히 마감시간 변경에 대한 상세 로깅
- 변경 전/후 값 비교
- 사용자/관리자 정보 및 IP 주소 기록

### 2. 실시간 보안 감지
- **급속한 수정**: 10분 내 10회 이상 수정 시 알림
- **다중 마감일 변경**: 1시간 내 3회 이상 마감일 변경 시 알림  
- **반복적 이슈 수정**: 동일 이슈 5회 이상 수정 시 알림
- **Rate Limiting**: 5분 내 20회 이상 수정 차단

### 3. 마감일 변경 검증
- 과거 날짜 설정 방지
- 30일 이상 큰 변경 시 경고
- 1시간 미만 급박한 마감일 경고
- 검증 실패 시 요청 차단

### 4. 관리자 대시보드
- 실시간 로그 조회 및 필터링
- 보안 알림 모니터링
- 통계 및 패턴 분석
- 검색 및 정렬 기능

## 파일 구조

```
/utils/issue-logging.js          # 핵심 로깅 클래스
/middleware/simple-issue-audit.js # Express 미들웨어
/routes/issue-logs.js            # 관리자 API 엔드포인트
/admin-issue-logs.html           # 관리자 대시보드 UI
/logs/                           # 로그 파일 저장소
  ├── issue-modifications.log   # 모든 이슈 수정 기록
  └── security-alerts.log       # 보안 알림 기록
```

## 사용 방법

### 미들웨어 적용

```javascript
const {
    logIssueModification,
    validateDeadlineChange,
    rateLimitIssueModifications
} = require('../middleware/simple-issue-audit');

// 이슈 수정 라우트에 적용
router.put('/issues/:id', 
    authMiddleware,
    rateLimitIssueModifications(),     // Rate limiting
    validateDeadlineChange(),          // 마감일 검증
    logIssueModification('UPDATE'),    // 로깅
    async (req, res) => {
        // 이슈 수정 로직
    }
);
```

### 수동 로깅

```javascript
const { issueLogger } = require('../utils/issue-logging');

issueLogger.logIssueModification({
    issueId: 123,
    action: 'UPDATE_ISSUE',
    fieldName: 'end_date',
    oldValue: '2025-07-08T10:00:00Z',
    newValue: '2025-07-15T15:00:00Z',
    adminId: 1,
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    endpoint: '/api/admin/issues/123'
});
```

### 검증 사용

```javascript
const validation = issueLogger.validateDeadlineChange(
    issueId, 
    oldDeadline, 
    newDeadline, 
    userId, 
    adminId
);

if (!validation.valid) {
    return res.status(400).json({
        success: false,
        message: 'Invalid deadline change',
        errors: validation.errors
    });
}
```

## API 엔드포인트

### 수정 로그 조회
```
GET /api/admin/logs/modifications?limit=100&issueId=123
```

### 보안 알림 조회
```
GET /api/admin/logs/alerts?limit=50
```

### 통계 조회
```
GET /api/admin/logs/stats
```

### 로그 검색
```
GET /api/admin/logs/search?action=UPDATE&severity=HIGH&userId=123
```

## 로그 형식

### 수정 로그
```json
{
    "timestamp": "2025-07-08T15:14:20.781Z",
    "issueId": 1,
    "action": "UPDATE_ISSUE",
    "fieldName": "end_date",
    "oldValue": "2025-07-10T10:00:00Z",
    "newValue": "2025-07-15T15:00:00Z",
    "userId": null,
    "adminId": 1,
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "endpoint": "/api/admin/issues/1",
    "severity": "HIGH"
}
```

### 보안 알림
```json
{
    "timestamp": "2025-07-08T15:14:23.787Z",
    "userKey": "999",
    "originalAction": { /* 원본 액션 정보 */ },
    "alerts": [
        {
            "type": "RAPID_MODIFICATIONS",
            "message": "User performed 12 actions in 10 minutes",
            "severity": "HIGH"
        }
    ],
    "ipAddress": "192.168.1.200",
    "userAgent": "Suspicious/1.0"
}
```

## 심각도 레벨

### HIGH (높음)
- 24시간 이상의 마감일 변경
- 이슈 생성/삭제
- 급속한 수정 패턴

### MEDIUM (보통)  
- 6-24시간의 마감일 변경
- 제목/상태 변경
- 반복적 수정

### LOW (낮음)
- 6시간 미만의 마감일 변경
- 기타 필드 변경

## 보안 알림 유형

1. **RAPID_MODIFICATIONS**: 짧은 시간 내 많은 수정
2. **MULTIPLE_DEADLINE_CHANGES**: 연속된 마감일 변경
3. **REPEATED_ISSUE_MODIFICATION**: 같은 이슈 반복 수정
4. **RATE_LIMIT_EXCEEDED**: Rate limit 초과

## 관리자 대시보드

웹 브라우저에서 `/admin-issue-logs` 접속:

- 📊 실시간 통계 표시
- 🔍 필터링 및 검색
- 📋 수정 로그 탭
- 🚨 보안 알림 탭
- 📱 반응형 디자인

## 설정 및 최적화

### 메모리 관리
- Rate limit 캐시 자동 정리 (1분마다)
- 오래된 활동 데이터 제거
- 메모리 사용량 최적화

### 로그 파일 관리
- 자동 로그 로테이션 미포함 (필요시 logrotate 사용)
- JSON 형식으로 구조화된 로그
- 파일 크기 모니터링 권장

### 성능 최적화
- 비동기 로깅 처리
- 캐시된 데이터 활용
- 백그라운드 패턴 감지

## 테스트

테스트 스크립트 실행:
```bash
node test-logging.js
```

## 장점

1. **단순성**: 복잡한 데이터베이스 설정 불요
2. **즉시 효과**: 설치 후 바로 작동
3. **파일 기반**: 데이터베이스 연결 문제 회피
4. **실시간 감지**: 즉각적인 보안 알림
5. **확장성**: 필요시 데이터베이스 연동 가능

## 제한사항

1. **파일 기반**: 대용량 환경에서는 성능 제약
2. **단일 서버**: 다중 서버 환경에서 로그 분산
3. **영구 저장**: 파일 삭제 시 로그 손실 가능

## 향후 개선 사항

1. **로그 로테이션**: 일/주/월 단위 로그 분할
2. **데이터베이스 연동**: 대용량 로그 처리
3. **실시간 알림**: 이메일/슬랙 통합
4. **고급 분석**: 머신러닝 기반 패턴 감지
5. **모바일 앱**: 관리자 모바일 대시보드

---

이 시스템은 복잡한 감사 시스템의 데이터베이스 연결 문제를 해결하면서도 효과적인 이슈 수정 추적과 보안 기능을 제공합니다.