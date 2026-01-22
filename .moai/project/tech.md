# LectureNote AI - 기술 스택

## 기술 스택 개요

| 영역 | 기술 | 버전 |
|------|------|------|
| **언어** | TypeScript / JavaScript (ESM) | TS 5.8.2 |
| **프론트엔드 프레임워크** | React | 19.2.3 |
| **빌드 도구** | Vite | 6.2.0 |
| **백엔드 프레임워크** | Express.js | 5.2.1 |
| **데이터베이스** | SQLite | 5.1.7 (sqlite3) |
| **AI API** | Google Gemini | @google/genai 1.36.0 |
| **PDF 생성** | Puppeteer | 24.35.0 |

---

## 프레임워크 및 라이브러리 선택 이유

### 프론트엔드

#### React 19

**선택 이유**:
- 컴포넌트 기반 아키텍처로 복잡한 UI를 모듈화하여 관리
- `useState`, `useEffect` 훅을 통한 직관적인 상태 관리
- 대규모 생태계와 풍부한 라이브러리 지원
- React 19의 개선된 성능과 Concurrent Features 활용 가능성

#### Vite 6

**선택 이유**:
- 개발 서버 콜드 스타트가 Webpack 대비 10배 이상 빠름
- HMR(Hot Module Replacement)이 밀리초 단위로 반영
- ESM 기반 빌드로 최신 JavaScript 생태계와 호환
- 설정이 간단하고 React 플러그인 기본 제공

#### Lucide React

**선택 이유**:
- Feather Icons 기반의 일관된 디자인 언어
- 트리 쉐이킹으로 사용하는 아이콘만 번들에 포함
- SVG 기반으로 크기 조절 자유로움

### 백엔드

#### Express.js 5

**선택 이유**:
- Node.js 생태계에서 가장 성숙하고 안정적인 웹 프레임워크
- 미들웨어 패턴으로 유연한 요청 처리 파이프라인 구성
- 버전 5에서 Promise 기반 라우트 핸들러 지원 개선
- 간결한 API로 빠른 개발 속도

#### SQLite (sqlite3)

**선택 이유**:
- 별도 데이터베이스 서버 설치 불필요 (파일 기반)
- 개발 및 소규모 배포에 적합한 경량 데이터베이스
- 단일 사용자 애플리케이션에 충분한 성능
- 설정 없이 즉시 사용 가능

### AI 통합

#### Google Gemini API (@google/genai)

**선택 이유**:
- `gemini-2.5-flash` 모델의 빠른 응답 속도와 합리적인 비용
- 구조화된 JSON 출력(`responseMimeType: "application/json"`) 네이티브 지원
- `responseSchema`를 통한 엄격한 출력 형식 정의 가능
- 긴 컨텍스트(100K+ 토큰) 처리 능력

### 유틸리티

#### Puppeteer

**선택 이유**:
- 헤드리스 Chrome을 통한 정확한 HTML → PDF 렌더링
- CSS 스타일, 웹폰트, 그라데이션 등 완벽 지원
- 페이지 분할, 마진 설정 등 세밀한 PDF 옵션 제공

#### Marked

**선택 이유**:
- 빠르고 가벼운 마크다운 파서
- GFM(GitHub Flavored Markdown) 지원
- 커스텀 렌더러로 출력 형식 조절 가능

---

## 개발 환경 요구사항

### 필수 요구사항

| 항목 | 최소 버전 | 권장 버전 |
|------|----------|----------|
| Node.js | 18.0.0 | 20.x LTS |
| npm | 8.0.0 | 10.x |
| Git | 2.30.0 | 최신 |

### 운영체제 지원

- macOS 12.0 이상
- Windows 10/11 (WSL2 권장)
- Ubuntu 20.04 이상

### Puppeteer 추가 요구사항

Puppeteer는 Chromium을 자동 다운로드하지만, 일부 Linux 환경에서는 추가 의존성 설치가 필요할 수 있다:

```bash
# Ubuntu/Debian
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
  libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libxshmfence1 xdg-utils
```

---

## 빌드 및 실행 방법

### 프로젝트 설치

```bash
# 레포지토리 클론
git clone https://github.com/your-org/lecturenote-ai.git
cd lecturenote-ai

# 의존성 설치
npm install
```

### 개발 서버 실행

두 개의 터미널에서 프론트엔드와 백엔드를 각각 실행한다:

```bash
# 터미널 1: 프론트엔드 개발 서버 (Vite)
npm run dev
# → http://localhost:5173 에서 접근

# 터미널 2: 백엔드 API 서버 (Express)
npm run server
# → http://localhost:3000 에서 API 서비스
```

### 프로덕션 빌드

```bash
# 프론트엔드 빌드
npm run build
# → dist/ 디렉토리에 정적 파일 생성

# 빌드 결과 미리보기
npm run preview
```

### 스크립트 요약

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | Vite 개발 서버 실행 (HMR 활성화) |
| `npm run server` | Express 백엔드 서버 실행 |
| `npm run build` | 프로덕션 빌드 생성 |
| `npm run preview` | 빌드 결과 로컬 미리보기 |

---

## 환경 변수 설정

### 필수 환경 변수

Google Gemini API를 사용하기 위해 API 키가 필요하다.

1. 프로젝트 루트에 `.env.local` 파일 생성:

```bash
# .env.local (Git에서 제외됨)
GEMINI_API_KEY=your_google_gemini_api_key_here
```

2. 또는 `.env` 파일 사용:

```bash
# .env
API_KEY=your_google_gemini_api_key_here
```

### API 키 발급 방법

1. [Google AI Studio](https://aistudio.google.com/app/apikey) 접속
2. Google 계정으로 로그인
3. "Get API Key" 클릭
4. 새 프로젝트 생성 또는 기존 프로젝트 선택
5. 생성된 API 키 복사

### 환경 변수 우선순위

서버(`server/index.js`)는 다음 순서로 환경 변수를 로드한다:

1. `.env.local` (최우선, 로컬 개발용)
2. `.env` (기본)

```javascript
// server/index.js
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
```

---

## API 엔드포인트 요약

### 기본 URL

- 개발 환경: `http://localhost:3000`

### 엔드포인트 목록

| 메서드 | 경로 | 설명 | 요청 본문 |
|--------|------|------|----------|
| `POST` | `/api/lectures` | 새 강의 생성 및 분석 시작 | `{ transcript: string }` |
| `GET` | `/api/lectures` | 강의 목록 조회 | - |
| `GET` | `/api/lectures/:id` | 강의 상세 조회 (챕터 포함) | - |
| `GET` | `/api/lectures/:id/pdf` | 강의 노트 PDF 다운로드 | - |
| `POST` | `/api/chapters/:id/regenerate` | 피드백 기반 챕터 재생성 | `{ feedback: string }` |

### 응답 형식

#### `POST /api/lectures` 응답

```json
{
  "id": "lec_abc123xyz",
  "title": "AI 프롬프트 엔지니어링 마스터 클래스",
  "totalChapters": 6
}
```

#### `GET /api/lectures` 응답

```json
[
  {
    "id": "lec_abc123xyz",
    "title": "AI 프롬프트 엔지니어링 마스터 클래스",
    "created_at": "2025-01-22T10:30:00.000Z"
  }
]
```

#### `GET /api/lectures/:id` 응답

```json
{
  "id": "lec_abc123xyz",
  "title": "AI 프롬프트 엔지니어링 마스터 클래스",
  "raw_text": "...",
  "created_at": "2025-01-22T10:30:00.000Z",
  "chapters": [
    {
      "id": "lec_abc123xyz_1",
      "lecture_id": "lec_abc123xyz",
      "chapter_number": 1,
      "title": "프롬프트 엔지니어링 기초",
      "status": "completed",
      "narrative": "...",
      "content": {
        "keyMessage": "...",
        "narrative": "...",
        "quotesWithTimeline": [...],
        "keyTerms": [...],
        "keyPoints": [...],
        "practicalTips": [...]
      }
    }
  ]
}
```

---

## 데이터베이스 스키마

### `lectures` 테이블

강의 메타데이터를 저장한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT (PK) | 강의 고유 ID (`lec_` 접두사 + 랜덤 문자열) |
| `title` | TEXT | 강의 제목 (AI 생성) |
| `raw_text` | TEXT | 원본 트랜스크립트 전문 |
| `created_at` | DATETIME | 생성 시각 (기본값: 현재 시각) |

### `chapters` 테이블

챕터별 분석 결과를 저장한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT (PK) | 챕터 고유 ID (`{lecture_id}_{number}` 형식) |
| `lecture_id` | TEXT (FK) | 소속 강의 ID |
| `chapter_number` | INTEGER | 챕터 순번 |
| `title` | TEXT | 챕터 제목 |
| `summary` | TEXT | 챕터 요약 |
| `narrative` | TEXT | 스토리텔링 형식 내러티브 |
| `threeline_note` | TEXT | 3줄 요약 (현재 미사용) |
| `detailed_note` | TEXT | 상세 분석 결과 (JSON 문자열) |
| `quiz` | TEXT | 퀴즈 (현재 미사용) |
| `status` | TEXT | 처리 상태 (`pending`, `processing`, `completed`, `error`) |

### `detailed_note` JSON 구조

```json
{
  "id": "ch1",
  "title": "챕터 제목",
  "startTime": "00:00",
  "endTime": "30:00",
  "duration": 30,
  "keyMessage": "이 챕터의 핵심 메시지",
  "narrative": "마크다운 형식의 상세 내러티브...",
  "quotesWithTimeline": [
    {
      "timestamp": "05:23",
      "quote": "강사의 발언",
      "context": "발언의 맥락 설명"
    }
  ],
  "keyTerms": [
    {
      "term": "용어",
      "definition": "정의",
      "example": "예시"
    }
  ],
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2"],
  "practicalTips": ["실용 팁 1", "실용 팁 2"]
}
```

---

## 의존성 목록

### 프로덕션 의존성 (`dependencies`)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@google/genai` | 1.36.0 | Google Gemini AI API 클라이언트 |
| `cors` | 2.8.5 | Cross-Origin Resource Sharing 미들웨어 |
| `dotenv` | 17.2.3 | 환경 변수 로딩 |
| `express` | 5.2.1 | 웹 서버 프레임워크 |
| `lucide-react` | 0.562.0 | 아이콘 라이브러리 |
| `marked` | 17.0.1 | 마크다운 파서 |
| `puppeteer` | 24.35.0 | 헤드리스 브라우저 (PDF 생성) |
| `react` | 19.2.3 | UI 프레임워크 |
| `react-dom` | 19.2.3 | React DOM 렌더링 |
| `sqlite3` | 5.1.7 | SQLite 데이터베이스 드라이버 |

### 개발 의존성 (`devDependencies`)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@types/node` | 22.14.0 | Node.js 타입 정의 |
| `@vitejs/plugin-react` | 5.0.0 | Vite React 플러그인 |
| `typescript` | 5.8.2 | TypeScript 컴파일러 |
| `vite` | 6.2.0 | 프론트엔드 빌드 도구 |

---

*문서 최종 업데이트: 2025-01-22*
