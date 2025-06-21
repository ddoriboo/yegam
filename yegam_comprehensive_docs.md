# Yegam (예겜) 서비스 종합 기술 문서

## 📋 목차
1. [서비스 개요](#서비스-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [데이터베이스 설계](#데이터베이스-설계)
4. [베팅 메카니즘 및 플로우](#베팅-메카니즘-및-플로우)
5. [API 엔드포인트](#api-엔드포인트)
6. [프론트엔드 구조](#프론트엔드-구조)
7. [인증 및 보안](#인증-및-보안)
8. [배포 및 운영](#배포-및-운영)
9. [개발 히스토리](#개발-히스토리)
10. [트러블슈팅 가이드](#트러블슈팅-가이드)

---

## 📖 서비스 개요

### 💡 Yegam이란?
**Yegam(예겜)**은 한국어 예측 시장 플랫폼으로, 사용자들이 다양한 이슈에 대해 예측하고 가상 화폐인 **"감(GAM)"**을 이용해 참여할 수 있는 서비스입니다.

### 🎯 핵심 가치 제안
- **실시간 예측 시장**: 다양한 카테고리의 이슈에 대한 Yes/No 예측
- **GAM 경제 시스템**: 가상 화폐를 통한 안전한 예측 참여
- **커뮤니티 기반**: 댓글, 토론을 통한 집단 지성 활용
- **투명한 확률 시스템**: 베팅 현황에 따른 실시간 확률 업데이트

### 🏷️ 주요 카테고리 (8개)
| 카테고리 | 설명 | 색상 테마 |
|---------|------|-----------|
| 정치 | 선거, 정책, 정치적 이벤트 | 빨간색 그라데이션 |
| 스포츠 | 경기 결과, 시즌 성과 | 청록색 그라데이션 |
| 경제 | 주식, 환율, 경제 지표 | 초록색 그라데이션 |
| 코인 | 암호화폐 가격, 트렌드 | 노란색 그라데이션 |
| 테크 | 기술 트렌드, 제품 출시 | 보라색 그라데이션 |
| 엔터 | 연예계, 문화 콘텐츠 | 핑크색 그라데이션 |
| 날씨 | 기상 예보, 계절 예측 | 파란색 그라데이션 |
| 해외 | 국제 정치, 글로벌 이벤트 | 인디고 그라데이션 |

---

## 🏗️ 시스템 아키텍처

### 🔧 기술 스택

#### Frontend
```
HTML5/CSS3
├── Semantic Markup
├── Modern CSS (Grid, Flexbox)
├── Glassmorphism Design
└── Responsive Web Design

JavaScript (ES6+)
├── Vanilla JavaScript
├── Async/Await Patterns
├── Module System
├── DOM Manipulation
└── LocalStorage Management

UI Framework
├── Tailwind CSS (Utility-First)
├── Lucide Icons
└── Custom CSS Components
```

#### Backend
```
Node.js + Express
├── RESTful API Design
├── Middleware Architecture
├── Error Handling
└── Request Validation

Database
├── PostgreSQL (Production)
├── Connection Pooling
├── Query Optimization
└── Data Integrity

Authentication
├── JWT (JSON Web Tokens)
├── bcryptjs (Password Hashing)
├── Session Management
└── Rate Limiting

External Services
├── Cloudinary (Image Storage)
├── Railway (Hosting Platform)
└── Health Check System
```

### 📁 프로젝트 구조
```
yegam/
├── 📄 HTML Pages
│   ├── index.html              # 메인 페이지
│   ├── login.html              # 로그인/회원가입
│   ├── issues.html             # 전체 이슈 목록
│   ├── mypage.html             # 마이페이지
│   ├── admin.html              # 관리자 대시보드
│   ├── admin-login.html        # 관리자 로그인
│   └── tier_guide.html         # 티어 가이드
│
├── 🎨 Frontend Assets
│   ├── css/
│   │   └── style.css           # 커스텀 스타일
│   └── js/
│       ├── app.js              # 메인 애플리케이션 로직
│       ├── auth.js             # 인증 시스템
│       ├── backend.js          # 백엔드 인터페이스
│       └── data.js             # 초기 데이터
│
├── 🔧 Backend Core
│   ├── server.js               # Express 서버 진입점
│   ├── middleware/             # 미들웨어 모음
│   │   ├── auth.js             # 사용자 인증
│   │   ├── admin-auth-secure.js # 관리자 인증
│   │   ├── validation.js       # 입력값 검증
│   │   └── error-handler.js    # 에러 처리
│   │
│   ├── routes/                 # API 라우트
│   │   ├── auth.js             # 사용자 인증 API
│   │   ├── admin-auth-secure.js # 관리자 인증 API
│   │   ├── issues.js           # 이슈 관리 API
│   │   ├── bets.js             # 베팅 API
│   │   ├── comments.js         # 댓글 API
│   │   ├── notifications.js    # 알림 API
│   │   ├── gam.js              # GAM 거래 API
│   │   └── upload.js           # 파일 업로드 API
│   │
│   ├── database/               # 데이터베이스 관련
│   │   ├── database.js         # DB 연결 및 쿼리 헬퍼
│   │   ├── postgres.js         # PostgreSQL 설정
│   │   └── admin-schema.sql    # 관리자 테이블 스키마
│   │
│   ├── services/               # 비즈니스 로직
│   │   ├── gamService.js       # GAM 경제 시스템
│   │   ├── issueScheduler.js   # 이슈 자동 마감
│   │   └── notificationService.js # 알림 서비스
│   │
│   ├── utils/                  # 유틸리티
│   │   ├── health-check.js     # 서버 상태 점검
│   │   └── validators.js       # 입력값 검증
│   │
│   └── config/                 # 설정 파일
│       ├── constants.js        # 상수 정의
│       └── env.js              # 환경 변수 관리
│
├── 📊 DevOps & Config
│   ├── package.json            # Node.js 의존성
│   ├── railway.toml            # Railway 배포 설정
│   ├── .env.example            # 환경 변수 템플릿
│   ├── .gitignore              # Git 제외 파일
│   └── README.md               # 프로젝트 설명서
│
└── 🛠️ Scripts
    └── scripts/
        └── create-admin.js     # 관리자 계정 생성 스크립트
```

---

## 🗄️ 데이터베이스 설계

### 📊 ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    USERS ||--o{ BETS : "places"
    USERS ||--o{ COMMENTS : "writes"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ GAM_TRANSACTIONS : "performs"
    USERS ||--o{ REWARDS : "receives"
    ISSUES ||--o{ BETS : "has"
    ISSUES ||--o{ COMMENTS : "has"
    ISSUES ||--o{ REWARDS : "generates"
    COMMENTS ||--o{ COMMENTS : "replies_to"
    BETS ||--o{ REWARDS : "generates"

    USERS {
        int id PK
        string username UK
        string email UK
        string password_hash
        int gam_balance
        int correct_predictions
        timestamp created_at
        timestamp updated_at
    }

    ISSUES {
        int id PK
        string title
        text description
        string category
        string status
        timestamp end_date
        string result
        string image_url
        int yes_volume
        int no_volume
        int decided_by FK
        timestamp decided_at
        text decision_reason
        timestamp created_at
        timestamp updated_at
    }

    BETS {
        int id PK
        int user_id FK
        int issue_id FK
        string choice
        int amount
        timestamp created_at
    }

    COMMENTS {
        int id PK
        int user_id FK
        int issue_id FK
        int parent_id FK
        text content
        int likes
        int dislikes
        boolean is_hidden
        timestamp created_at
        timestamp updated_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        string type
        string title
        text message
        int related_id
        string related_type
        boolean is_read
        timestamp created_at
    }

    GAM_TRANSACTIONS {
        int id PK
        int user_id FK
        string type
        string category
        int amount
        text description
        int reference_id
        timestamp created_at
    }

    REWARDS {
        int id PK
        int user_id FK
        int issue_id FK
        int bet_id FK
        int reward_amount
        timestamp created_at
    }

    ADMINS {
        int id PK
        string username UK
        string email UK
        string password_hash
        string full_name
        string role
        boolean is_active
        timestamp last_login
        timestamp created_at
        timestamp updated_at
    }

    ADMIN_SESSIONS {
        int id PK
        int admin_id FK
        string token_hash UK
        timestamp expires_at
        string ip_address
        string user_agent
        boolean is_active
        timestamp created_at
    }

    ADMIN_ACTIVITY_LOGS {
        int id PK
        int admin_id FK
        string action
        string resource_type
        int resource_id
        jsonb details
        string ip_address
        string user_agent
        timestamp created_at
    }
```

### 🏷️ 테이블별 상세 정의

#### 👥 Users (사용자)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    gam_balance INTEGER DEFAULT 10000,  -- 초기 GAM: 10,000
    correct_predictions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**컬럼 설명:**
- `gam_balance`: 사용자의 GAM 잔액 (가상 화폐)
- `correct_predictions`: 맞춘 예측 횟수 (성취 시스템용)

#### 📋 Issues (이슈)
```sql
CREATE TABLE issues (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',  -- active, closed, settled
    end_date TIMESTAMP NOT NULL,
    result VARCHAR(10) DEFAULT NULL,      -- Yes, No, NULL
    image_url TEXT,
    yes_volume INTEGER DEFAULT 0,
    no_volume INTEGER DEFAULT 0,
    decided_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMP DEFAULT NULL,
    decision_reason TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**상태 정의:**
- `active`: 베팅 가능한 활성 이슈
- `closed`: 마감된 이슈 (결과 대기)
- `settled`: 정산 완료된 이슈

#### 🎲 Bets (베팅)
```sql
CREATE TABLE bets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    choice VARCHAR(10) NOT NULL,  -- Yes, No
    amount INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, issue_id)  -- 한 이슈당 한 번만 베팅 가능
);
```

#### 💬 Comments (댓글)
```sql
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    issue_id INTEGER NOT NULL REFERENCES issues(id),
    parent_id INTEGER REFERENCES comments(id),  -- 대댓글 지원
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 💰 GAM_Transactions (GAM 거래 내역)
```sql
CREATE TABLE gam_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'burn')),
    category VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    reference_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**거래 타입:**
- `earn`: GAM 획득 (회원가입, 베팅 승리, 댓글 작성 등)
- `burn`: GAM 소모 (베팅, 수수료 등)

**거래 카테고리:**
- `signup`: 회원가입 보너스
- `betting_win`: 베팅 승리
- `betting_loss`: 베팅 참여 (차감)
- `commission`: 수수료
- `comment_reward`: 댓글 작성 보상

#### 🔐 관리자 테이블들

**Admins (관리자)**
```sql
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'admin',  -- admin, super_admin
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Admin_Sessions (관리자 세션)**
```sql
CREATE TABLE admin_sessions (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎯 베팅 메카니즘 및 플로우

### 🔄 전체 베팅 플로우

```mermaid
graph TD
    A[사용자 이슈 선택] --> B{로그인 확인}
    B -->|미로그인| C[로그인 페이지 이동]
    B -->|로그인됨| D[베팅 페이지 진입]
    
    D --> E[베팅 선택 - Yes/No]
    E --> F[베팅 금액 입력]
    F --> G{GAM 잔액 확인}
    
    G -->|부족| H[잔액 부족 에러]
    G -->|충분| I[베팅 실행]
    
    I --> J[GAM 차감]
    J --> K[베팅 기록 저장]
    K --> L[이슈 볼륨 업데이트]
    L --> M[확률 재계산]
    M --> N[실시간 UI 업데이트]
    
    N --> O{이슈 마감 시점}
    O -->|진행중| P[대기]
    O -->|마감| Q[관리자 결과 결정]
    
    Q --> R{베팅 결과}
    R -->|승리| S[수익 계산 및 지급]
    R -->|패배| T[손실 확정]
    
    S --> U[GAM 지급]
    U --> V[수수료 차감 - 2%]
    V --> W[알림 전송]
    
    T --> W
    W --> X[정산 완료]
```

### 💡 확률 계산 알고리즘

**실시간 확률 계산:**
```javascript
// 베팅 볼륨 기반 확률 계산
const calculateProbability = (yesVolume, noVolume) => {
    const totalVolume = yesVolume + noVolume;
    if (totalVolume === 0) {
        return { yes: 50, no: 50 }; // 기본값
    }
    
    const yesPercentage = Math.round((yesVolume / totalVolume) * 100);
    const noPercentage = 100 - yesPercentage;
    
    return {
        yes: yesPercentage,
        no: noPercentage
    };
};
```

### 💰 수익 계산 시스템

**베팅 수익 공식:**
```javascript
// 승리 시 수익 계산
const calculateWinnings = (userBet, winnerVolume, loserVolume) => {
    // 승리 비율 계산
    const winRatio = userBet.amount / winnerVolume;
    
    // 수익 = 패배자 볼륨 × 승리 비율
    const profit = Math.floor(loserVolume * winRatio);
    
    // 총 획득액 = 원금 + 수익
    const totalWinAmount = userBet.amount + profit;
    
    // 수수료 계산 (2%)
    const commission = Math.floor(totalWinAmount * 0.02);
    
    // 최종 지급액
    const finalAmount = totalWinAmount - commission;
    
    return {
        originalBet: userBet.amount,
        profit: profit,
        commission: commission,
        finalAmount: finalAmount
    };
};
```

### 🔒 베팅 제약 조건
1. **중복 베팅 방지**: 한 이슈당 한 번만 베팅 가능
2. **최소 금액**: 1 GAM 이상
3. **최대 금액**: 보유 GAM 한도 내
4. **시간 제한**: 이슈 마감 시간 전까지만 가능
5. **계정 상태**: 활성화된 계정만 가능

---

## 🛠️ API 엔드포인트

### 🔐 인증 API (`/api/auth`)

#### POST `/api/auth/signup`
**회원가입**
```json
// Request
{
    "username": "yegamer123",
    "email": "user@example.com",
    "password": "securePassword123"
}

// Response (Success)
{
    "success": true,
    "message": "회원가입이 완료되었습니다!",
    "user": {
        "id": 1,
        "username": "yegamer123",
        "email": "user@example.com",
        "gamBalance": 10000
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST `/api/auth/login`
**로그인**
```json
// Request
{
    "email": "user@example.com",
    "password": "securePassword123"
}

// Response (Success)
{
    "success": true,
    "message": "로그인 성공",
    "user": {
        "id": 1,
        "username": "yegamer123",
        "gamBalance": 8500
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### GET `/api/auth/verify`
**토큰 검증**
```json
// Headers
{
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

// Response (Success)
{
    "success": true,
    "user": {
        "id": 1,
        "username": "yegamer123",
        "gamBalance": 8500
    }
}
```

### 📋 이슈 API (`/api/issues`)

#### GET `/api/issues`
**이슈 목록 조회**
```json
// Query Parameters (Optional)
// ?category=정치&status=active&page=1&limit=10

// Response
{
    "success": true,
    "issues": [
        {
            "id": 1,
            "title": "2025년 상반기 비트코인이 10만 달러를 넘을까?",
            "description": "현재 비트코인 가격 동향을 고려한 예측",
            "category": "코인",
            "status": "active",
            "endDate": "2025-06-30T23:59:59Z",
            "imageUrl": "https://cloudinary.com/...",
            "yesVolume": 15000,
            "noVolume": 8500,
            "probability": {
                "yes": 64,
                "no": 36
            },
            "createdAt": "2025-01-15T10:00:00Z"
        }
    ],
    "pagination": {
        "currentPage": 1,
        "totalPages": 5,
        "totalIssues": 47,
        "limit": 10
    }
}
```

#### POST `/api/issues`
**이슈 생성 (관리자)**
```json
// Request
{
    "title": "새로운 예측 이슈",
    "description": "상세 설명",
    "category": "테크",
    "endDate": "2025-12-31T23:59:59Z",
    "imageUrl": "https://cloudinary.com/..."
}

// Response
{
    "success": true,
    "message": "이슈가 성공적으로 생성되었습니다.",
    "issue": {
        "id": 42,
        "title": "새로운 예측 이슈",
        // ... other fields
    }
}
```

### 🎲 베팅 API (`/api/bets`)

#### POST `/api/bets`
**베팅하기**
```json
// Request
{
    "issueId": 1,
    "choice": "Yes",
    "amount": 1000
}

// Response (Success)
{
    "success": true,
    "message": "베팅이 완료되었습니다.",
    "bet": {
        "id": 123,
        "issueId": 1,
        "choice": "Yes",
        "amount": 1000,
        "createdAt": "2025-06-22T10:30:00Z"
    },
    "updatedBalance": 7500,
    "updatedProbability": {
        "yes": 66,
        "no": 34
    }
}
```

#### GET `/api/bets/my-bets`
**내 베팅 내역**
```json
// Response
{
    "success": true,
    "bets": [
        {
            "id": 123,
            "issue": {
                "id": 1,
                "title": "비트코인 10만 달러 돌파",
                "category": "코인",
                "status": "active"
            },
            "choice": "Yes",
            "amount": 1000,
            "createdAt": "2025-06-22T10:30:00Z",
            "result": null  // pending, win, lose
        }
    ]
}
```

#### GET `/api/bets/issue/:issueId/stats`
**이슈별 베팅 통계**
```json
// Response
{
    "success": true,
    "stats": {
        "issueId": 1,
        "totalVolume": 23500,
        "yesVolume": 15000,
        "noVolume": 8500,
        "totalBettors": 47,
        "yesBettors": 28,
        "noBettors": 19,
        "probability": {
            "yes": 64,
            "no": 36
        }
    }
}
```

### 💬 댓글 API (`/api/comments`)

#### GET `/api/comments/issue/:issueId`
**이슈별 댓글 조회**
```json
// Query: ?page=1&limit=10

// Response
{
    "success": true,
    "comments": [
        {
            "id": 1,
            "user": {
                "id": 5,
                "username": "crypto_expert"
            },
            "content": "기술적 분석을 보면 상승 가능성이 높아 보입니다.",
            "likes": 12,
            "dislikes": 3,
            "replies": [
                {
                    "id": 2,
                    "user": {
                        "id": 7,
                        "username": "skeptic_trader"
                    },
                    "content": "하지만 거시경제 상황을 고려하면...",
                    "likes": 5,
                    "dislikes": 1,
                    "createdAt": "2025-06-22T11:00:00Z"
                }
            ],
            "createdAt": "2025-06-22T10:45:00Z"
        }
    ],
    "pagination": {
        "currentPage": 1,
        "totalPages": 3,
        "totalComments": 28
    }
}
```

#### POST `/api/comments`
**댓글 작성**
```json
// Request
{
    "issueId": 1,
    "content": "흥미로운 예측이네요!",
    "parentId": null  // 대댓글인 경우 부모 댓글 ID
}

// Response
{
    "success": true,
    "message": "댓글이 작성되었습니다.",
    "comment": {
        "id": 42,
        "content": "흥미로운 예측이네요!",
        "createdAt": "2025-06-22T12:00:00Z"
    },
    "gamReward": 10  // 댓글 작성 보상
}
```

### 💰 GAM API (`/api/gam`)

#### GET `/api/gam/balance`
**GAM 잔액 조회**
```json
// Response
{
    "success": true,
    "balance": 8500,
    "user": {
        "id": 1,
        "username": "yegamer123"
    }
}
```

#### GET `/api/gam/transactions`
**GAM 거래 내역**
```json
// Response
{
    "success": true,
    "transactions": [
        {
            "id": 101,
            "type": "burn",
            "category": "betting_loss",
            "amount": 1000,
            "description": "베팅 참여: 비트코인 10만 달러 돌파",
            "createdAt": "2025-06-22T10:30:00Z"
        },
        {
            "id": 100,
            "type": "earn",
            "category": "comment_reward",
            "amount": 10,
            "description": "댓글 작성 보상",
            "createdAt": "2025-06-22T09:15:00Z"
        }
    ]
}
```

### 🔔 알림 API (`/api/notifications`)

#### GET `/api/notifications`
**알림 목록**
```json
// Response
{
    "success": true,
    "notifications": [
        {
            "id": 1,
            "type": "betting_result",
            "title": "베팅 결과 알림",
            "message": "비트코인 예측이 적중했습니다! 1,500 GAM을 획득했습니다.",
            "isRead": false,
            "relatedId": 1,
            "relatedType": "issue",
            "createdAt": "2025-06-22T08:00:00Z"
        }
    ],
    "unreadCount": 3
}
```

### 🛡️ 관리자 API (`/api/admin`)

#### POST `/api/admin-auth/login`
**관리자 로그인**
```json
// Request
{
    "username": "superadmin",
    "password": "SecureAdminPass123!"
}

// Response
{
    "success": true,
    "message": "관리자 로그인 성공",
    "admin": {
        "id": 1,
        "username": "superadmin",
        "role": "super_admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🎨 프론트엔드 구조

### 📱 페이지별 기능

#### 🏠 메인 페이지 (`index.html`)
**핵심 기능:**
- 최신 인기 이슈 표시 (카테고리별 필터링)
- 실시간 확률 게이지
- 빠른 베팅 인터페이스
- 트렌딩 이슈 섹션

**주요 컴포넌트:**
```javascript
// 이슈 카드 렌더링
const renderIssueCard = (issue) => {
    return `
        <div class="issue-card glassmorphism">
            <div class="category-badge ${getCategoryColor(issue.category)}">
                ${issue.category}
            </div>
            <h3>${issue.title}</h3>
            <div class="probability-gauge">
                <div class="gauge-bar">
                    <div class="gauge-fill" style="width: ${issue.probability.yes}%"></div>
                </div>
                <div class="probability-text">
                    Yes ${issue.probability.yes}% / No ${issue.probability.no}%
                </div>
            </div>
            <div class="betting-interface">
                <button class="bet-button yes" data-choice="Yes">
                    Yes 베팅
                </button>
                <button class="bet-button no" data-choice="No">
                    No 베팅
                </button>
            </div>
        </div>
    `;
};
```

#### 📝 이슈 상세 페이지
**핵심 기능:**
- 이슈 상세 정보 및 설명
- 베팅 인터페이스 (금액 입력)
- 실시간 베팅 통계
- 댓글 시스템 (계층형 댓글 지원)
- 좋아요/싫어요 시스템

#### 👤 마이페이지 (`mypage.html`)
**핵심 기능:**
- 사용자 프로필 정보
- GAM 잔액 및 거래 내역
- 내 베팅 현황 (진행중/완료)
- 예측 성공률 통계
- 알림 설정

#### 🔐 로그인/회원가입 (`login.html`)
**핵심 기능:**
- 사용자 인증 (이메일 + 비밀번호)
- 회원가입 (유효성 검증)
- 소셜 로그인 준비 (구글, 깃허브)

#### 🛠️ 관리자 대시보드 (`admin.html`)
**핵심 기능:**
- 이슈 관리 (생성, 수정, 삭제, 정산)
- 사용자 관리
- 댓글 관리 (숨김/복원)
- 시스템 통계
- 스케줄러 관리

### 🎨 디자인 시스템

#### 글래스모픽 스타일
```css
.glassmorphism {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.dark-glassmorphism {
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}
```

#### 카테고리 색상 시스템
```css
:root {
    --politics-gradient: linear-gradient(135deg, #EF4444, #F87171);
    --sports-gradient: linear-gradient(135deg, #06B6D4, #67E8F9);
    --economy-gradient: linear-gradient(135deg, #10B981, #34D399);
    --crypto-gradient: linear-gradient(135deg, #F59E0B, #FBBF24);
    --tech-gradient: linear-gradient(135deg, #8B5CF6, #A78BFA);
    --entertainment-gradient: linear-gradient(135deg, #EC4899, #F472B6);
    --weather-gradient: linear-gradient(135deg, #3B82F6, #60A5FA);
    --international-gradient: linear-gradient(135deg, #6366F1, #8B5CF6);
}
```

### 📱 반응형 디자인
```css
/* Mobile First Approach */
.container {
    padding: 1rem;
}

/* Tablet */
@media (min-width: 768px) {
    .container {
        padding: 2rem;
        max-width: 768px;
        margin: 0 auto;
    }
}

/* Desktop */
@media (min-width: 1024px) {
    .container {
        max-width: 1200px;
        padding: 3rem;
    }
    
    .issue-grid {
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 2rem;
    }
}
```

---

## 🔐 인증 및 보안

### 🔑 사용자 인증 시스템

#### JWT 토큰 구조
```javascript
// JWT Payload
{
    "userId": 123,
    "username": "yegamer123",
    "iat": 1624567890,
    "exp": 1625172690,
    "iss": "yegam-app",
    "aud": "yegam-users"
}
```

#### 인증 미들웨어
```javascript
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: '인증 토큰이 필요합니다.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await get('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '유효하지 않은 사용자입니다.' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: '토큰 검증에 실패했습니다.' 
        });
    }
};
```

### 🛡️ 관리자 보안 시스템

#### 이중 인증 구조
1. **관리자 계정 분리**: 일반 사용자와 완전 분리된 `admins` 테이블
2. **세션 관리**: `admin_sessions` 테이블로 토큰 추적
3. **활동 로그**: `admin_activity_logs`로 모든 관리자 행동 기록
4. **IP 추적**: 로그인 IP 및 User-Agent 저장

#### 관리자 인증 플로우
```mermaid
graph TD
    A[관리자 로그인 시도] --> B[계정 존재 확인]
    B --> C[비밀번호 검증]
    C --> D[JWT 토큰 생성]
    D --> E[세션 테이블에 기록]
    E --> F[활동 로그 기록]
    F --> G[클라이언트에 토큰 전송]
    
    G --> H[API 요청시]
    H --> I[토큰 검증]
    I --> J[세션 유효성 확인]
    J --> K[관리자 권한 확인]
    K --> L[요청 처리]
    L --> M[활동 로그 기록]
```

### 🚫 보안 대책

#### Rate Limiting
```javascript
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const MAX_ATTEMPTS = 5;

const checkRateLimit = (identifier) => {
    const attemptData = loginAttempts.get(identifier) || { count: 0 };
    if (attemptData.count >= MAX_ATTEMPTS) {
        return { blocked: true, timeLeft: /* 계산 */ };
    }
    return { blocked: false };
};
```

#### 입력값 검증
```javascript
const InputValidator = {
    validateEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    validatePassword: (password) => {
        return password.length >= 8 && 
               /[A-Z]/.test(password) && 
               /[a-z]/.test(password) && 
               /[0-9]/.test(password);
    },
    
    sanitizeInput: (input) => {
        return input.trim().replace(/[<>\"']/g, '');
    }
};
```

#### SQL Injection 방지
```javascript
// 모든 쿼리에서 파라미터화된 쿼리 사용
const result = await query(
    'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
    [email, hashedPassword]
);
```

---

## 🚀 배포 및 운영

### ☁️ Railway 배포 구성

#### `railway.toml` 설정
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"

[environments.production.variables]
NODE_ENV = "production"
JWT_SECRET = "yegame-production-secret-key-2025-very-secure-random-string"
SESSION_SECRET = "yegame-session-secret-2025-very-secure-random-string"
```

#### 환경 변수
```bash
# 필수 환경 변수
DATABASE_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-very-secure-secret-key
SESSION_SECRET=your-session-secret

# Cloudinary 설정
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# 선택적 환경 변수
NODE_ENV=production
PORT=3000
```

### 📊 Health Check 시스템

#### 기본 Health Check
```javascript
// GET /health
{
    "status": "healthy",
    "timestamp": "2025-06-22T10:30:00Z",
    "message": "Service is operational"
}
```

#### 상세 Health Check
```javascript
// GET /health/detailed
{
    "status": "healthy",
    "timestamp": "2025-06-22T10:30:00Z",
    "responseTime": "45ms",
    "version": "1.0.0",
    "environment": "production",
    "checks": [
        {
            "name": "database",
            "status": "healthy",
            "responseTime": "12ms",
            "details": "PostgreSQL connection successful"
        },
        {
            "name": "memory",
            "status": "healthy",
            "details": {
                "used": "45.2 MB",
                "total": "512 MB",
                "percentage": "8.8%"
            }
        }
    ]
}
```

### ⚙️ 자동화 스케줄러

#### 이슈 자동 마감 시스템
```javascript
const cron = require('node-cron');

// 매 시간마다 만료된 이슈 검사
cron.schedule('0 * * * *', async () => {
    console.log('🔍 만료된 이슈 검사 시작...');
    
    const expiredIssues = await query(`
        SELECT id, title 
        FROM issues 
        WHERE status = 'active' 
        AND end_date <= CURRENT_TIMESTAMP
    `);
    
    for (const issue of expiredIssues.rows) {
        await query(
            'UPDATE issues SET status = $1 WHERE id = $2',
            ['closed', issue.id]
        );
        
        console.log(`✅ 이슈 마감: ${issue.title}`);
    }
});
```

---

## 📚 개발 히스토리

### 🎯 Phase 1: 백엔드 구축 ✅

#### 핵심 성취
- **Node.js/Express 서버 구축**: RESTful API 아키텍처 설계
- **PostgreSQL 데이터베이스**: 확장 가능한 스키마 설계
- **JWT 인증 시스템**: 보안이 강화된 사용자 인증
- **베팅 시스템**: 실시간 확률 계산 및 정산 로직
- **댓글 시스템**: 계층형 댓글 및 상호작용 기능
- **GAM 경제 시스템**: 가상 화폐 거래 내역 추적

#### 주요 기술적 결정
1. **PostgreSQL 선택 이유**: SQLite에서 업그레이드, 동시성 및 확장성 고려
2. **JWT vs Session**: Stateless 아키텍처로 확장성 확보
3. **Cloudinary**: 이미지 저장소 외부화로 서버 부하 경감
4. **Rate Limiting**: 메모리 기반 단순 구현 (향후 Redis 고려)

### 🌐 Phase 2: 배포 및 운영 ✅

#### 인프라 구축
- **Railway 플랫폼**: 간편한 배포 및 관리
- **PostgreSQL 클라우드**: Railway 통합 데이터베이스
- **Cloudinary CDN**: 전 세계 이미지 최적화 배포
- **Health Check**: 서비스 상태 모니터링

#### 보안 강화
- **관리자 시스템 분리**: 이중 인증 구조 구현
- **활동 로그**: 모든 관리자 행동 추적
- **입력값 검증**: SQL Injection 및 XSS 방지
- **Rate Limiting**: 무차별 대입 공격 방지

### 🔮 Phase 3: 고도화 (진행 예정)

#### 예정 기능
- **WebSocket 실시간 업데이트**: 베팅 현황 즉시 반영
- **Push 알림**: 모바일 알림 서비스
- **고급 통계**: 사용자별 성과 분석
- **모바일 앱**: React Native 또는 PWA
- **소셜 기능**: 친구 시스템, 리더보드

---

## 🛠️ 트러블슈팅 가이드

### 🔧 일반적인 문제 해결

#### 1. 데이터베이스 연결 실패
```bash
# 증상
Error: connect ECONNREFUSED 127.0.0.1:5432

# 해결 방법
1. DATABASE_URL 환경 변수 확인
2. PostgreSQL 서비스 상태 확인
3. 방화벽 설정 확인
4. Railway 데이터베이스 상태 확인
```

#### 2. JWT 토큰 에러
```bash
# 증상
JsonWebTokenError: invalid signature

# 해결 방법
1. JWT_SECRET 환경 변수 확인
2. 토큰 만료 시간 확인
3. 클라이언트 토큰 저장 상태 확인
4. 서버 재시작 (메모리 세션 초기화)
```

#### 3. Cloudinary 업로드 실패
```bash
# 증상
CloudinaryError: Must supply api_key

# 해결 방법
1. Cloudinary 환경 변수 3개 모두 설정 확인
2. API 키 유효성 확인
3. 업로드 용량 제한 확인
4. Cloudinary 계정 상태 확인
```

#### 4. 관리자 로그인 실패
```bash
# 증상
관리자 인증 실패

# 해결 방법
1. /setup-admin 엔드포인트로 관리자 계정 재생성
2. admin_sessions 테이블 정리
3. 비밀번호 해시 확인
4. 관리자 테이블 스키마 확인
```

### 🔍 디버깅 명령어

#### 데이터베이스 상태 확인
```bash
# Railway CLI로 DB 접속
railway connect postgres

# 테이블 목록 확인
\dt

# 사용자 수 확인
SELECT COUNT(*) FROM users;

# 활성 이슈 수 확인
SELECT COUNT(*) FROM issues WHERE status = 'active';
```

#### 로그 확인
```bash
# Railway 로그 실시간 확인
railway logs --follow

# 특정 시간대 로그
railway logs --since 1h
```

#### Health Check
```bash
# 기본 상태 확인
curl https://yegam-production.up.railway.app/health

# 상세 상태 확인
curl https://yegam-production.up.railway.app/health/detailed
```

### 🚨 응급 복구 절차

#### 1. 서비스 완전 중단 시
```bash
1. Railway 대시보드에서 서비스 상태 확인
2. 최근 배포 롤백 고려
3. 데이터베이스 연결 상태 확인
4. 환경 변수 설정 재확인
5. 수동 재시작: railway restart
```

#### 2. 데이터 손실 위험 시
```bash
1. 즉시 Railway에서 데이터베이스 백업 생성
2. 문제 원인 파악 전까지 쓰기 작업 중단
3. 백업에서 복원 준비
4. 사용자 공지사항 게시
```

#### 3. 보안 문제 발견 시
```bash
1. 관련 기능 즉시 비활성화
2. 사용자 세션 강제 만료
3. 관리자 계정 비밀번호 변경
4. 로그 분석 및 영향 범위 파악
5. 패치 적용 및 재배포
```

---

## 📝 개발자 Quick Start

### 🚀 로컬 개발 환경 설정 (5분 가이드)

```bash
# 1. 저장소 클론
git clone https://github.com/ddoriboo/yegam.git
cd yegam

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정
cp .env.example .env
# .env 파일 편집하여 DATABASE_URL, JWT_SECRET 등 설정

# 4. 데이터베이스 초기화 (Railway PostgreSQL 권장)
npm run setup-db

# 5. 관리자 계정 생성
npm run create-admin

# 6. 개발 서버 시작
npm run dev

# 7. 브라우저에서 확인
open http://localhost:3000
```

### 🔑 필수 환경 변수

```bash
# 복사해서 .env 파일에 붙여넣기
DATABASE_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-super-secure-secret-key-here
SESSION_SECRET=your-session-secret-here
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-cloudinary-key
CLOUDINARY_API_SECRET=your-cloudinary-secret
NODE_ENV=development
PORT=3000
```

### 📋 Claude Code를 위한 핵심 정보

#### 프로젝트 컨텍스트
- **언어**: Node.js (Backend), Vanilla JavaScript (Frontend)
- **프레임워크**: Express.js, Tailwind CSS
- **데이터베이스**: PostgreSQL
- **인증**: JWT
- **배포**: Railway
- **이미지**: Cloudinary

#### 주요 파일 위치
- **서버 진입점**: `server.js`
- **데이터베이스 설정**: `database/database.js`, `database/postgres.js`
- **API 라우트**: `routes/` 디렉토리
- **프론트엔드 로직**: `js/app.js`
- **스타일**: `css/style.css` (커스텀), Tailwind CSS (프레임워크)

#### 데이터베이스 테이블 관계
- `users` ↔ `bets` (1:N)
- `issues` ↔ `bets` (1:N)
- `users` ↔ `comments` (1:N)
- `issues` ↔ `comments` (1:N)
- `users` ↔ `gam_transactions` (1:N)

#### 핵심 비즈니스 로직
- **베팅 시스템**: `routes/bets.js`
- **GAM 경제**: `services/gamService.js`
- **이슈 스케줄러**: `services/issueScheduler.js`
- **확률 계산**: 실시간 베팅 볼륨 기반

#### 자주 수정하는 부분
- 새 API 엔드포인트: `routes/` 디렉토리
- 프론트엔드 기능: `js/app.js`
- 데이터베이스 스키마: `database/postgres.js`
- 비즈니스 로직: `services/` 디렉토리

---

## 📞 연락처 및 지원

**GitHub Repository**: https://github.com/ddoriboo/yegam  
**Production URL**: https://yegam-production.up.railway.app/  
**Admin Panel**: https://yegam-production.up.railway.app/admin  

**기술 문의**: GitHub Issues 를 통해 문의해 주세요.  
**버그 리포트**: 상세한 재현 단계와 함께 이슈 등록  
**기능 제안**: Feature Request 라벨과 함께 이슈 등록  

---

*마지막 업데이트: 2025년 6월 22일*  
*문서 버전: v1.0*

**⚠️ 중요**: 이 문서는 Yegam 서비스의 전체 기술 사양을 포함하고 있습니다. 보안이 중요한 부분(JWT Secret, 관리자 비밀번호 등)은 절대 공개하지 마세요.