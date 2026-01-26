# 예겜 이슈 상세 페이지 기획

## 개요
- **라우트:** `/issue/:id`
- **형태:** 별도 페이지 (모달 X)
- **이유:** 모바일 친화적, URL 공유 가능, SEO, 확장성

---

## 페이지 구성

### 1. 헤더 영역
- 뒤로가기 버튼
- 공유 버튼

### 2. 이슈 정보
- 이슈 이미지 (히어로 이미지)
- 제목
- 카테고리 뱃지
- 마감일 카운트다운 (D-day)

### 3. 베팅 현황
- YES / NO 비율 바
- 총 참여자 수
- 총 베팅 포인트
- (내 베팅 상태 - 로그인 시)

### 4. 베팅 액션
- YES 버튼 / NO 버튼
- 포인트 입력
- 베팅하기 CTA

### 5. 공유 섹션
- 카카오톡 공유
- 트위터 공유
- 링크 복사

### 6. (Phase 2) 커뮤니티
- 댓글/의견 섹션
- 관련 뉴스 링크

---

## 메타태그 (SNS 공유용)

```html
<meta property="og:title" content="[이슈 제목] - 예겜" />
<meta property="og:description" content="YES 65% vs NO 35% | D-7" />
<meta property="og:image" content="[이슈 이미지]" />
<meta property="og:url" content="https://yegam.ai.kr/issue/123" />
```

---

## API 필요사항

### GET /api/issues/:id
```json
{
  "id": 123,
  "title": "비트코인 10만불 돌파?",
  "image": "https://...",
  "category": "경제",
  "deadline": "2026-02-28",
  "yesRatio": 65,
  "noRatio": 35,
  "totalParticipants": 1234,
  "totalPoints": 50000,
  "myBet": {
    "choice": "YES",
    "points": 100
  }
}
```

---

## 이슈 라이프사이클

### 상태 정의
| 상태 | 설명 | 베팅 |
|------|------|------|
| `active` | 진행 중 | ✅ 가능 |
| `closed` | 마감됨, 결과 대기 | ❌ 불가 |
| `settled` | 결과 확정, 정산 완료 | ❌ 불가 |

### 상세 페이지 UI 변화
- **active:** 베팅 버튼 활성화
- **closed:** "결과 대기 중 ⏳" 표시, 버튼 비활성화
- **settled:** "YES 승! 🎉" 또는 "NO 승!" 표시, 정산 결과

### 목록 페이지 탭 구조
```
[ 진행중 🔥 ] [ 종료됨 📊 ]
```
- 진행중: active 이슈만
- 종료됨: closed + settled 이슈 (최신순)

---

## 우선순위

**Phase 1 (MVP)**
- [x] 기획
- [x] 이슈 상세 API (`GET /api/issues/:id` 확장)
- [x] 상세 페이지 UI (`issue.html`)
- [x] 베팅 기능 연동
- [x] 공유 기능 (트위터, 링크 복사)
- [x] 목록 페이지 탭 분리 (기존 open-filter 활용)
- [x] 카드 클릭 시 상세 페이지 이동

**Phase 2**
- [ ] 댓글 기능
- [ ] 베팅 추이 그래프
- [ ] 관련 뉴스

---

*생성일: 2026-01-26*
