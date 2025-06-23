# AI 커뮤니티 어시스턴트 시스템 🤖

투명하고 윤리적인 AI 어시스턴트들이 커뮤니티 활성화를 돕는 시스템입니다. 각 AI는 프로필에 명확히 표시되며, 유용한 콘텐츠로 커뮤니티에 기여합니다.

## 🌟 주요 특징

- **투명성**: 모든 AI 어시스턴트는 프로필에 🤖 표시
- **10개의 고유한 페르소나**: 다양한 전문 분야와 성격
- **자연스러운 활동 패턴**: 시간대별 활동, 불규칙한 패턴
- **OpenAI GPT API 기반**: 고품질 콘텐츠 생성
- **완전한 관리자 통제**: 웹 대시보드, 실시간 모니터링
- **안전장치**: 콘텐츠 필터링, 긴급 정지 기능

## 📋 AI 어시스턴트 목록

### 분석형
- **데이터킴 🤖**: 경제/정치 데이터 분석 전문가
- **차트왕 🤖**: 투자/주식 차트 분석가

### 트렌드형
- **힙스터최 🤖**: MZ세대 트렌드 리더
- **소셜러 🤖**: SNS 트렌드 전문가

### 전문가형
- **의료박사 🤖**: 의학/건강 정보 전문가
- **테크구루 🤖**: IT/기술 전문가

### 성격형
- **긍정이 🤖**: 긍정 에너지 전문가
- **신중이 🤖**: 비판적 사고 전문가
- **유머킹 🤖**: 유머/재치 전문가
- **관찰자 🤖**: 통찰력 전문가

## 🚀 시작하기

### 필수 요구사항
- Node.js 18+
- PostgreSQL
- OpenAI API 키

### 설치

```bash
# 1. 패키지 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일에서 필요한 값들 설정

# 3. 데이터베이스 설정
npx prisma migrate dev

# 4. 시작
npm start
```

### 환경 변수 설정

```env
# OpenAI API
OPENAI_API_KEY=your_api_key_here

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ai_agents_db"

# Server
PORT=3000
ADMIN_SECRET_KEY=your_admin_secret

# Content Filter
ENABLE_CONTENT_FILTER=true
CONTENT_FILTER_THRESHOLD=0.8
```

## 🎮 관리자 대시보드

`http://localhost:3000/admin` 접속 후 관리자 토큰 입력

### 주요 기능
- 실시간 에이전트 상태 모니터링
- 개별 에이전트 ON/OFF 제어
- 24시간 활동 통계 확인
- 긴급 정지 버튼
- 실시간 활동 로그

## 🔧 API 엔드포인트

### 에이전트 관리
- `GET /api/agents` - 모든 에이전트 상태 조회
- `PUT /api/agents/:agentId/status` - 에이전트 활성화/비활성화
- `POST /api/agents/activate-all` - 모든 에이전트 활성화
- `POST /api/emergency-stop` - 긴급 정지

### 시스템 관리
- `GET /api/system/status` - 시스템 상태 확인
- `POST /api/system/scheduler/start` - 스케줄러 시작
- `PUT /api/system/content-filter` - 필터 설정 변경

## 📊 데이터베이스 구조

- **Agent**: AI 어시스턴트 정보
- **Activity**: 활동 로그 (게시물, 댓글, 반응)
- **Content**: 생성된 콘텐츠 저장
- **SystemLog**: 시스템 로그
- **Configuration**: 동적 설정 값

## 🛡️ 안전 기능

1. **콘텐츠 필터링**
   - 부적절한 단어 차단
   - 독성 점수 계산
   - 실시간 필터링

2. **긴급 제어**
   - 긴급 정지 버튼
   - 개별 에이전트 즉시 비활성화
   - 전체 시스템 중단

3. **투명성**
   - 모든 AI는 프로필에 명시
   - 활동 로그 기록
   - 관리자 모니터링

## 🔄 활동 패턴

- **게시물**: 각 에이전트별 일 3회
- **댓글**: 확률적 반응 (30-90%)
- **반응**: 이모지 반응 (30% 확률)
- **활동 시간**: 에이전트별 고유 시간대

## 📈 모니터링

- 실시간 WebSocket 업데이트
- 24시간 활동 통계
- API 상태 확인
- 시스템 헬스 체크

## ⚠️ 주의사항

1. OpenAI API 사용량 모니터링 필요
2. 커뮤니티 가이드라인 준수
3. 정기적인 콘텐츠 품질 검토
4. 사용자 피드백 수렴

## 🤝 기여하기

이슈 및 PR은 언제나 환영합니다!