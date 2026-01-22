# LectureNote AI

VTT 자막 파일이나 강의 텍스트를 업로드하면 **Gemini AI**가 자동으로 챕터를 분할하고, 스토리텔링 형식의 상세한 강의 노트를 생성해주는 웹 애플리케이션입니다.

## 주요 기능

- **자동 챕터 분할**: 30분 단위 세그먼트로 나눈 뒤 Gemini AI가 주제별 챕터 자동 추출
- **스토리텔링 노트 생성**: 강사 인용문 + 타임스탬프 기반의 생생한 학습 노트
- **실시간 분석 상태**: 폴링 기반으로 챕터별 분석 진행 상황 표시
- **피드백 반영 재생성**: 특정 챕터에 피드백을 주면 AI가 반영하여 재작성
- **PDF 내보내기**: Puppeteer 기반 고품질 PDF 다운로드

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 19, TypeScript, Vite, Lucide Icons |
| Backend | Express.js 5, Node.js (ESM) |
| Database | SQLite3 |
| AI | Google Gemini API (`@google/genai`) |
| PDF | Puppeteer, Marked |

## 프로젝트 구조

```
lecturenote-ai/
├── App.tsx                 # 메인 React 컴포넌트 (강의 목록, 생성, 상세 뷰)
├── index.tsx               # React 엔트리포인트
├── index.html              # HTML 템플릿
├── types.ts                # TypeScript 타입 정의
├── components/
│   ├── LecturePreview.tsx  # 강의 노트 프리뷰 컴포넌트
│   └── ProcessingUI.tsx    # 분석 진행 상태 UI
├── services/
│   └── geminiService.ts    # Gemini API 호출 (클라이언트용, 현재 미사용)
├── utils/
│   └── vttParser.ts        # VTT 파싱 유틸리티
├── server/
│   ├── index.js            # Express 서버 (API 엔드포인트, Gemini 호출)
│   └── database.cjs        # SQLite DB 초기화 및 쿼리 함수
│                           # (lecture_notes.db는 서버 실행 시 자동 생성)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 설치 및 실행

### 1. 사전 요구사항

- **Node.js** 18 이상
- **Gemini API Key** ([Google AI Studio](https://ai.google.dev/)에서 발급)

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env.local` 파일에 Gemini API 키 설정:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. 서버 실행

**터미널 1: 백엔드 서버**
```bash
npm run server
# → http://localhost:3000
```

**터미널 2: 프론트엔드 개발 서버**
```bash
npm run dev
# → http://localhost:5173
```

### 5. 사용 방법

1. 브라우저에서 `http://localhost:5173` 접속
2. **New Lecture** 버튼 클릭
3. VTT 파일 업로드 또는 텍스트 붙여넣기
4. **분석 시작** 클릭
5. 챕터별 분석 진행 상황 확인
6. 완료 후 **PDF Export**로 다운로드

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/lectures` | 새 강의 생성 및 분석 시작 |
| `GET` | `/api/lectures` | 강의 목록 조회 |
| `GET` | `/api/lectures/:id` | 강의 상세 조회 (챕터 포함) |
| `GET` | `/api/lectures/:id/pdf` | PDF 다운로드 |
| `POST` | `/api/chapters/:id/regenerate` | 챕터 재생성 (피드백 반영) |

## 데이터베이스 스키마

```sql
-- lectures 테이블
CREATE TABLE lectures (
  id TEXT PRIMARY KEY,
  title TEXT,
  raw_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- chapters 테이블
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  lecture_id TEXT,
  chapter_number INTEGER,
  title TEXT,
  status TEXT DEFAULT 'pending',  -- pending, processing, completed, error
  narrative TEXT,
  detailed_note TEXT,             -- JSON string (전체 분석 결과)
  FOREIGN KEY (lecture_id) REFERENCES lectures(id)
);
```

---

## AI 에이전트용 가이드 (Claude Code / Antigravity)

이 섹션은 **Claude Code**, **Antigravity**, 또는 다른 AI 코딩 에이전트가 이 프로젝트를 이해하고 수정할 수 있도록 작성되었습니다.

### 핵심 파일 및 역할

| 파일 | 역할 | 수정 시 주의사항 |
|------|------|------------------|
| `server/index.js` | **핵심 로직** - Gemini 호출, 챕터 분할, DB CRUD | 스키마 변경 시 `CHAPTER_DEEP_DIVE_SCHEMA` 수정 필요 |
| `App.tsx` | React 메인 UI, 상태 관리, API 호출 | `lectureData` 상태 구조와 서버 응답 일치 확인 |
| `components/LecturePreview.tsx` | 강의 노트 렌더링 | `note` prop 타입 참조 (`types.ts`) |
| `types.ts` | 전체 TypeScript 타입 정의 | 서버 스키마 변경 시 동기화 필요 |
| `server/database.cjs` | SQLite 초기화 및 쿼리 함수 | CommonJS 모듈 (ESM 아님) |

### 주요 수정 시나리오

#### 1. Gemini 프롬프트 수정
`server/index.js`의 다음 위치 확인:
- **초기 스캔**: `INITIAL_SCAN_SCHEMA` (라인 34-58)
- **챕터 심층 분석**: `CHAPTER_DEEP_DIVE_SCHEMA` (라인 60-127)
- **프롬프트 텍스트**: `processLectureBackground` 함수 내 (라인 660-712)

#### 2. 새 필드 추가
1. `types.ts`에 타입 추가
2. `server/index.js`의 `CHAPTER_DEEP_DIVE_SCHEMA`에 스키마 추가
3. `App.tsx`의 데이터 가공 로직 수정 (라인 79-95)
4. `LecturePreview.tsx`에서 렌더링 추가

#### 3. API 엔드포인트 추가
`server/index.js`에서 `app.get()` 또는 `app.post()` 추가:
```javascript
app.post('/api/lectures/:id/custom', async (req, res) => {
  // 로직 구현
});
```

#### 4. DB 스키마 변경
`server/database.cjs`의 `initDB()` 함수 수정 후 기존 DB 파일 삭제:
```bash
rm server/lecture_notes.db
npm run server
```

### 디버깅 팁

```bash
# 서버 로그 확인 (챕터 분석 진행 상황)
npm run server

# DB 직접 조회
sqlite3 server/lecture_notes.db "SELECT * FROM lectures;"
sqlite3 server/lecture_notes.db "SELECT id, title, status FROM chapters;"
```

### 테스트용 VTT 샘플

```vtt
WEBVTT

00:00:00.000 --> 00:00:05.000
안녕하세요, 오늘은 AI 활용법에 대해 알아보겠습니다.

00:00:05.000 --> 00:00:15.000
첫 번째로 중요한 건 프롬프트 엔지니어링입니다.

00:00:15.000 --> 00:00:30.000
프롬프트를 잘 작성하면 결과물의 품질이 완전히 달라집니다.
```

### 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 | O |
| `API_KEY` | 대체 API 키 (GEMINI_API_KEY 없을 때) | X |

---

## 라이선스

MIT License

## 기여

이슈 및 PR 환영합니다.
