# LectureNote AI - 프로젝트 구조

## 디렉토리 개요

```
lecturenote-ai/
├── index.html              # Vite 진입점 HTML
├── index.tsx               # React 애플리케이션 진입점
├── App.tsx                 # 메인 React 컴포넌트 (라우팅, 상태 관리)
├── types.ts                # TypeScript 타입 정의
├── vite.config.ts          # Vite 빌드 설정
├── tsconfig.json           # TypeScript 컴파일러 설정
├── package.json            # 의존성 및 스크립트 정의
│
├── components/             # React 프레젠테이션 컴포넌트
│   ├── LecturePreview.tsx  # 강의 노트 렌더링 (마크다운, PDF 스타일)
│   └── ProcessingUI.tsx    # 처리 상태 표시 UI
│
├── services/               # API 통합 서비스
│   └── geminiService.ts    # Google Gemini API 래퍼 (현재 미사용, 서버에서 직접 호출)
│
├── utils/                  # 유틸리티 함수
│   └── vttParser.ts        # VTT 자막 및 원시 텍스트 파서
│
└── server/                 # Express.js 백엔드 서버
    ├── index.js            # 서버 진입점, API 라우트, AI 처리 로직
    ├── database.cjs        # SQLite 데이터베이스 초기화 및 쿼리 함수
    └── lecture_notes.db    # SQLite 데이터베이스 파일 (런타임 생성)
```

---

## 주요 디렉토리 및 파일 설명

### 루트 디렉토리 (`/`)

프로젝트의 핵심 설정 파일과 React 애플리케이션의 진입점이 위치한다.

| 파일 | 목적 |
|------|------|
| `index.html` | Vite가 사용하는 HTML 템플릿. React 앱이 마운트되는 `#root` 요소 포함 |
| `index.tsx` | React 애플리케이션 부트스트랩. `App` 컴포넌트를 DOM에 렌더링 |
| `App.tsx` | 메인 애플리케이션 컴포넌트. 강의 목록 관리, 상세 조회, 생성 UI 포함 |
| `types.ts` | 프로젝트 전역 TypeScript 타입 정의 (`Chapter`, `LectureNote`, `KeyTerm` 등) |
| `vite.config.ts` | Vite 빌드 도구 설정. React 플러그인 및 개발 서버 구성 |
| `tsconfig.json` | TypeScript 컴파일러 옵션. 엄격 모드, 모듈 해석 방식 정의 |
| `package.json` | npm 의존성, 스크립트 (`dev`, `server`, `build`, `preview`) 정의 |

---

### `/components` - 프레젠테이션 컴포넌트

사용자에게 표시되는 UI 컴포넌트를 포함한다.

#### `LecturePreview.tsx` (약 890줄)

강의 노트의 전체 렌더링을 담당하는 핵심 컴포넌트.

**주요 기능**:
- 마크다운 콘텐츠를 React 요소로 변환 (`MarkdownContent` 내부 컴포넌트)
- 타임스탬프가 포함된 인용문을 특별한 스타일로 렌더링
- 챕터별 카드 형태로 내용 표시 (`ChapterCard` 컴포넌트)
- 인라인 편집 및 피드백 기반 재생성 UI 제공
- PDF 인쇄 최적화 CSS 포함
- 한글 숫자를 아라비아 숫자로 변환하는 텍스트 정제 유틸리티 포함

**Props**:
- `note`: 강의 노트 데이터 (`LectureNote` 타입)
- `onDownload`: PDF 다운로드 핸들러
- `onDeepDive`: 챕터 상세 분석 트리거
- `onRegenerateWithFeedback`: 피드백 기반 재생성 핸들러

#### `ProcessingUI.tsx`

강의 분석 진행 상태를 시각적으로 표시하는 컴포넌트 (현재 `App.tsx`에 통합).

---

### `/services` - API 서비스 레이어

외부 API와의 통신을 추상화하는 서비스 모듈.

#### `geminiService.ts`

Google Gemini API 호출을 위한 래퍼 함수를 정의한다.

**참고**: 현재 구현에서는 API 호출이 서버 사이드(`server/index.js`)에서 직접 이루어지므로, 이 파일은 미사용 상태이다.

---

### `/utils` - 유틸리티 함수

순수 함수 형태의 헬퍼 유틸리티.

#### `vttParser.ts`

VTT 자막 파일 및 원시 텍스트를 파싱하는 함수 모음.

**내보내는 함수**:
- `parseVTT(content: string): VTTLine[]` - VTT 형식의 자막을 파싱. `WEBVTT` 헤더와 `-->` 타임스탬프 패턴을 인식하여 시작/종료 시간과 텍스트를 추출
- `parseRawText(content: string): VTTLine[]` - 타임스탬프가 없는 일반 텍스트를 문단 단위로 분리. 빈 시간 필드와 함께 `VTTLine` 배열로 반환
- `vttToText(lines: VTTLine[]): string` - 파싱된 VTT 라인을 `[HH:MM:SS] 텍스트` 형식의 문자열로 변환

**자동 감지 로직**: 입력 텍스트에 VTT 헤더(`WEBVTT`)나 타임스탬프 패턴(`-->`)이 없으면 자동으로 `parseRawText`로 폴백한다.

---

### `/server` - Express.js 백엔드

REST API 서버와 데이터베이스 관리 코드.

#### `index.js` (약 900줄)

서버 진입점으로, 모든 API 라우트와 AI 처리 로직을 포함한다.

**주요 구성 요소**:

1. **환경 설정**
   - `.env.local` 또는 `.env`에서 `GEMINI_API_KEY` 로드
   - Express 앱 초기화, CORS 활성화, JSON 바디 파서 (50MB 제한)

2. **JSON 스키마 정의**
   - `INITIAL_SCAN_SCHEMA`: 초기 스캔 결과 스키마 (제목, 개요, 챕터 목록)
   - `CHAPTER_DEEP_DIVE_SCHEMA`: 챕터 상세 분석 스키마 (내러티브, 인용문, 핵심 용어)
   - `SEGMENT_CHAPTER_SCHEMA`: 세그먼트별 챕터 추출 스키마

3. **유틸리티 함수**
   - `generateId()`: 랜덤 강의 ID 생성
   - `parseTime(timeStr)`: 시간 문자열을 초 단위로 변환
   - `extractSlice(text, startStr, endStr)`: 특정 시간 범위의 텍스트 추출
   - `formatTime(totalSeconds)`: 초를 `MM:SS` 또는 `HH:MM:SS` 형식으로 변환
   - `splitIntoSegments(transcript, segmentMinutes, charsPerSegment)`: 텍스트를 세그먼트로 분할
   - `splitByCharCount(transcript, charsPerSegment)`: 타임스탬프 없는 텍스트를 문자 수 기준 분할

4. **API 라우트**
   - `POST /api/lectures`: 강의 생성 및 분석 시작
   - `GET /api/lectures`: 강의 목록 조회
   - `GET /api/lectures/:id`: 강의 상세 조회 (챕터 포함)
   - `GET /api/lectures/:id/pdf`: PDF 다운로드
   - `POST /api/chapters/:id/regenerate`: 피드백 기반 챕터 재생성

5. **백그라운드 처리**
   - `processLectureBackground(lectureId, initialScan, transcript)`: 챕터별 Deep Dive 분석을 비동기로 실행

6. **PDF 생성**
   - `generateMarkdown(note)`: 강의 노트를 마크다운으로 변환
   - `generateStyledPDFHtml(title, contentHtml)`: 스타일이 적용된 PDF용 HTML 생성
   - Puppeteer를 사용하여 HTML을 PDF로 렌더링

#### `database.cjs`

SQLite 데이터베이스 초기화 및 쿼리 헬퍼.

**내보내는 함수**:
- `initDB()`: 데이터베이스 테이블 생성 (lectures, chapters)
- `run(sql, params)`: INSERT, UPDATE, DELETE 쿼리 실행
- `get(sql, params)`: 단일 행 SELECT 쿼리
- `all(sql, params)`: 다중 행 SELECT 쿼리

**CommonJS 사용 이유**: SQLite3 패키지가 ESM을 완전히 지원하지 않아 CommonJS 형식으로 작성되었다. `server/index.js`에서 `createRequire`를 통해 로드한다.

#### `lecture_notes.db`

SQLite 데이터베이스 파일. 서버 첫 실행 시 자동 생성된다. Git에는 포함되지 않는 런타임 파일.

---

## 프론트엔드-백엔드 분리 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 (브라우저)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React 19 + Vite                                         │   │
│  │  - App.tsx: 상태 관리, API 호출, 폴링                     │   │
│  │  - LecturePreview.tsx: 강의 노트 렌더링                  │   │
│  │  - vttParser.ts: 클라이언트 사이드 파싱                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │ HTTP (localhost:5173 → :3000)     │
└──────────────────────────────│──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        서버 (Node.js)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express.js 5 (localhost:3000)                           │   │
│  │  - REST API 엔드포인트                                    │   │
│  │  - Google Gemini AI 호출                                  │   │
│  │  - Puppeteer PDF 생성                                     │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQLite (lecture_notes.db)                               │   │
│  │  - lectures 테이블                                        │   │
│  │  - chapters 테이블                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      외부 서비스                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Google Gemini API (gemini-2.5-flash)                    │   │
│  │  - 챕터 추출                                              │   │
│  │  - Deep Dive 분석                                         │   │
│  │  - 제목/개요 생성                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 모듈 조직 방식

### 프론트엔드 모듈 구조

```
프론트엔드
├── 진입점 (index.tsx)
│   └── 앱 컴포넌트 (App.tsx)
│       ├── 상태 관리 (useState, useEffect)
│       ├── API 통신 (fetch)
│       └── UI 렌더링
│           ├── 사이드바 (강의 목록)
│           ├── 생성 뷰 (입력 폼)
│           └── 상세 뷰 (LecturePreview)
│
├── 컴포넌트 (components/)
│   ├── LecturePreview.tsx
│   │   ├── MarkdownContent (내부)
│   │   ├── Section (내부)
│   │   └── ChapterCard (내부)
│   └── ProcessingUI.tsx
│
├── 유틸리티 (utils/)
│   └── vttParser.ts
│
└── 타입 (types.ts)
```

### 백엔드 모듈 구조

```
백엔드
└── 서버 (server/)
    ├── 진입점 (index.js)
    │   ├── 환경 설정
    │   ├── 스키마 정의
    │   ├── 유틸리티 함수
    │   ├── API 라우트
    │   │   ├── POST /api/lectures
    │   │   ├── GET /api/lectures
    │   │   ├── GET /api/lectures/:id
    │   │   ├── GET /api/lectures/:id/pdf
    │   │   └── POST /api/chapters/:id/regenerate
    │   └── 백그라운드 프로세서
    │
    └── 데이터베이스 (database.cjs)
        ├── initDB()
        ├── run()
        ├── get()
        └── all()
```

---

## 핵심 파일 위치 요약

| 기능 | 파일 경로 |
|------|----------|
| React 앱 진입점 | `/index.tsx` |
| 메인 앱 컴포넌트 | `/App.tsx` |
| 타입 정의 | `/types.ts` |
| 강의 노트 렌더링 | `/components/LecturePreview.tsx` |
| VTT 파싱 | `/utils/vttParser.ts` |
| 백엔드 서버 | `/server/index.js` |
| 데이터베이스 | `/server/database.cjs` |
| Vite 설정 | `/vite.config.ts` |
| 패키지 의존성 | `/package.json` |

---

*문서 최종 업데이트: 2025-01-22*
