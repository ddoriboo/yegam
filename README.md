# 예겜 (YeGame) - 예측 플랫폼

한국어 예측 시장 플랫폼으로, 사용자들이 다양한 이슈에 대해 예측하고 "감"을 이용해 참여할 수 있는 서비스입니다.

## 🚀 주요 기능

- **8개 카테고리**: 정치, 스포츠, 경제, 코인, 테크, 엔터, 날씨, 해외
- **예측 시스템**: Yes/No 형태의 예측 참여
- **감(Gam) 시스템**: 가상 화폐를 이용한 예측 참여
- **실시간 확률**: 참여자들의 예측에 따른 실시간 확률 업데이트
- **이슈별 토론 시스템**: 댓글 작성, 좋아요/싫어요, 대댓글 기능
- **관리자 페이지**: 이슈 생성/수정/삭제, 이미지 업로드, 댓글 관리
- **회원 시스템**: 로그인/회원가입, 마이페이지

## 🎨 UI/UX 특징

- **글래스모픽 디자인**: 반투명 효과와 블러 처리
- **반응형 디자인**: 모바일/데스크톱 최적화
- **카테고리별 색상 시스템**: 직관적인 카테고리 구분
- **실시간 게이지**: 예측 확률 시각화

## 🛠 기술 스택

### Frontend
- **HTML5/CSS3**: 시맨틱 마크업, 모던 CSS
- **JavaScript (ES6+)**: 모듈 시스템, 비동기 처리
- **Tailwind CSS**: 유틸리티 기반 스타일링
- **Lucide Icons**: 아이콘 시스템

### Backend
- **Node.js + Express**: 서버 프레임워크
- **PostgreSQL**: 데이터베이스 (개발/운영 환경 통일)
- **JWT**: 사용자 인증 
- **Cloudinary**: 이미지 저장소
- **Multer**: 파일 업로드

## 📁 프로젝트 구조

```
project/
├── index.html              # 메인 페이지
├── login.html              # 로그인/회원가입
├── issues.html             # 전체 이슈 목록
├── mypage.html             # 마이페이지
├── admin.html              # 관리자 페이지
├── css/
│   └── style.css           # 커스텀 스타일
├── js/
│   ├── app.js              # 메인 애플리케이션 로직
│   ├── auth.js             # 인증 시스템
│   ├── backend.js          # 백엔드 인터페이스
│   └── data.js             # 초기 데이터
└── README.md
```

## 🚀 시작하기

### 로컬 개발 환경 설정

1. 저장소 클론
```bash
git clone https://github.com/ddoriboo/yegam.git
cd yegam
```

2. 의존성 설치
```bash
npm install
```

3. 환경 변수 설정
```bash
cp .env.example .env
```

4. PostgreSQL 데이터베이스 설정

**Option 1: Docker 사용 (권장)**
```bash
# PostgreSQL 컨테이너 실행
docker run --name yegam-postgres \
  -e POSTGRES_DB=yegam \
  -e POSTGRES_USER=yegam \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:15

# .env 파일에 DATABASE_URL 추가
echo "DATABASE_URL=postgresql://yegam:password@localhost:5432/yegam" >> .env
```

**Option 2: 로컬 PostgreSQL 설치**
```bash
# macOS (Homebrew)
brew install postgresql
brew services start postgresql
createdb yegam

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createdb yegam

# .env 파일에 DATABASE_URL 추가 (사용자명과 비밀번호는 각자 설정에 맞게 수정)
echo "DATABASE_URL=postgresql://username:password@localhost:5432/yegam" >> .env
```

**Option 3: Railway 무료 PostgreSQL 사용**
1. [Railway](https://railway.app/) 계정 생성
2. 새 프로젝트 생성 → PostgreSQL 추가
3. DATABASE_URL을 .env 파일에 복사

5. Cloudinary 설정 (이미지 업로드용)
   - [Cloudinary](https://cloudinary.com/) 계정 생성
   - Dashboard에서 Cloud Name, API Key, API Secret 확인
   - `.env` 파일에 설정 추가:
```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

6. 로컬 서버 실행
```bash
npm run dev
```

7. 브라우저에서 접속
```
http://localhost:3000
```

### 배포된 서비스
- **Production URL**: https://yegam-production.up.railway.app/
- **관리자 페이지**: https://yegam-production.up.railway.app/admin

## 🔮 로드맵

### Phase 1: 백엔드 구축 ✅
- [x] Node.js/Express 서버 구축
- [x] 데이터베이스 스키마 설계
- [x] REST API 개발
- [x] 사용자 인증 시스템
- [x] 이슈별 토론 시스템 구현
- [x] 관리자 페이지 완성

### Phase 2: 배포 및 운영 ✅
- [x] 클라우드 배포 (Railway)
- [x] PostgreSQL 데이터베이스 연동
- [x] Cloudinary 이미지 저장소 구축
- [ ] 도메인 연결
- [ ] 모니터링 시스템

### Phase 3: 고도화
- [ ] 실시간 업데이트 (WebSocket)
- [ ] 알림 시스템
- [ ] 통계 및 분석 기능
- [ ] 모바일 앱

## 🤝 기여하기

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/새기능`)
3. 변경사항 커밋 (`git commit -m '새 기능 추가'`)
4. 브랜치에 Push (`git push origin feature/새기능`)
5. Pull Request 생성

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 있습니다.

## 📞 연락처

프로젝트에 대한 문의나 제안이 있으시면 이슈를 생성해주세요.

---

**주의사항**: 본 서비스는 실제 현금 거래를 지원하지 않는 예측 정보 플랫폼입니다. 모든 거래는 가상의 "감" 포인트로 이루어집니다.