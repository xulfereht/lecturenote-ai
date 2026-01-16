# LectureNote AI 개선 계획

## 📋 현재 상태 분석

### ✅ 구현되어 있는 것
- VTT/텍스트 파일 업로드 및 파싱
- Gemini 3 Flash를 통한 초기 스캔 (챕터링, 제목, 개요)
- 섹션별 상세 분석 (Deep Dive)
- 기본 UI (업로드, 프로세싱, 미리보기)
- 기본적인 프린트 기반 PDF 내보내기

### ❌ 부족한 부분 (사용자 피드백 + 디자인 브리프 기준)
1. **콘텐츠 깊이 부족**: 상세 분석 내용이 빈약함
2. **PDF 최적화 부족**: `window.print()` 방식은 품질이 낮음
3. **핵심 섹션 누락**: FAQ, 실패 모드/디버깅, 의사결정 규칙, 1페이지 요약 등
4. **탐색 장치 부재**: 클릭 가능한 목차, 인덱스, 내부 링크 없음
5. **근거 정책 미흡**: 타임스탬프 + 원문 발췌 표기가 일관되지 않음
6. **도표 시각화 미흡**: 실제 SVG/Canvas 기반 도표 대신 텍스트 리스트만 표시

---

## 🎯 개선 목표

> **"VTT → 재생 없이도 찾고, 이해하고, 실행할 수 있는 완결형 PDF 강의노트"**

### 성공 기준
1. 사용자가 "질문 5개"를 각 30초 내 PDF에서 찾아 근거 확인 가능
2. 모든 핵심 주장/정의/규칙에 근거(타임스탬프 + 원문 발췌) 포함
3. 일관된 템플릿 구조로 어떤 강의든 동일한 품질 출력

---

## 📦 구현 단계 (Implementation Plan)

### Phase 1: AI 프롬프트/스키마 강화 (콘텐츠 품질 향상)
**목표**: Deep Dive 분석의 콘텐츠 깊이와 근거 품질 대폭 향상

#### 1.1 스키마 확장
- [ ] `CHAPTER_DEEP_DIVE_SCHEMA` 확장
  - `decisionRules`: 의사결정 규칙 (A면 B, C면 D)
  - `failureModes`: 실패 모드 & 디버깅 가이드
  - `faqs`: 강의가 답한 질문들 (FAQ 형태)
  - `examplesAndCounterexamples`: 예시, 반례, 경계조건
  - `evidenceBoxes`: 원문 발췌 + 타임스탬프 강화

#### 1.2 프롬프트 개선
- [ ] Initial Scan 프롬프트 개선
  - 더 정확한 챕터 구분
  - 핵심 질문(FAQ 후보) 추출
  - 강의 메타데이터 (난이도, 대상, 추정 길이)

- [ ] Deep Dive 프롬프트 개선
  - 명시적 vs 추론됨 라벨 강제
  - 모든 주장에 근거 첨부 강제
  - 실행 가능한 체크리스트 생성

#### 1.3 타입 정의 확장 (`types.ts`)
```typescript
// 추가할 타입들
interface DecisionRule {
  condition: string;
  action: string;
  evidence: Evidence;
}

interface FailureMode {
  symptom: string;
  possibleCauses: string[];
  debugSteps: string[];
  evidence: Evidence;
}

interface FAQ {
  question: string;
  answer: string;
  evidence: Evidence;
}

interface ExampleCase {
  type: '예시' | '반례' | '경계조건';
  description: string;
  implication: string;
  evidence: Evidence;
}
```

---

### Phase 2: UI 개선 (프리뷰 품질 향상)
**목표**: PDF 출력에 최적화된 레이아웃 및 탐색 장치

#### 2.1 레이아웃 구조 재설계
- [ ] **1페이지 요약 (Cheat Sheet)** 섹션 추가
  - 핵심 프레임워크 한 장
  - 주요 개념 5개
  - 핵심 실행 3가지

- [ ] **목차 (Table of Contents)** 컴포넌트
  - 섹션/챕터 링크 (스크롤 이동)
  - PDF 북마크로 변환 가능

- [ ] **인덱스 (Index)** 컴포넌트 강화
  - 용어를 클릭하면 해당 정의로 점프
  - 카테고리별 그룹핑

#### 2.2 새로운 UI 섹션 추가
- [ ] **FAQ 섹션**: 질문-답변 형태로 구조화
- [ ] **실패 모드 / 디버깅 가이드** 섹션
- [ ] **의사결정 트리** 시각화 (SVG 기반)
- [ ] **비교 매트릭스** 테이블

#### 2.3 프린트/PDF 최적화 스타일
- [ ] A4 페이지 기준 레이아웃
- [ ] 페이지 넘김 제어 (`page-break-*`)
- [ ] 헤더/푸터 (강의 제목, 페이지 번호)
- [ ] 하이퍼링크 스타일 (프린트 시 URL 표시)

---

### Phase 3: PDF 생성 시스템 구축
**목표**: 고품질 PDF 생성 (북마크, 링크, 메타데이터 포함)

#### 3.1 PDF 라이브러리 선택 및 통합
- [ ] 옵션 A: **jsPDF + html2canvas** (클라이언트 사이드)
  - 장점: 서버 불필요, 빠른 구현
  - 단점: 링크/북마크 기능 제한

- [ ] 옵션 B: **Puppeteer/Playwright** (서버 사이드) ← **권장**
  - 장점: 완벽한 PDF 품질, 북마크/링크 지원
  - 단점: 서버 리소스 필요

#### 3.2 PDF 기능 구현
- [ ] 클릭 가능한 목차 (PDF 내부 링크)
- [ ] PDF 북마크/아웃라인 (사이드바에서 이동)
- [ ] 문서 메타데이터 (제목, 작성일, 태그)
- [ ] 페이지 번호, 헤더/푸터

#### 3.3 PDF 엔드포인트 (`/api/generate-pdf`)
```javascript
// server/index.js에 추가
app.post('/api/generate-pdf', async (req, res) => {
  const { html, title, metadata } = req.body;
  // Puppeteer로 PDF 생성
  // 북마크, 링크 추가
  // PDF 파일 반환
});
```

---

### Phase 4: 품질 게이트 & 검증 시스템
**목표**: 생성된 노트의 품질 보장

#### 4.1 품질 검증 규칙
- [ ] 근거 누락 검증: 핵심 주장에 타임스탬프/발췌 없으면 경고
- [ ] 추론 비율 제한: "추론됨" 라벨이 60% 이상이면 경고
- [ ] 필수 섹션 확인: 개요, 챕터, 용어집, 체크리스트 필수

#### 4.2 품질 리포트 UI
- [ ] 분석 완료 후 품질 점수 표시
- [ ] 누락된 섹션 / 근거 부족 항목 하이라이트
- [ ] 개선 제안 표시

---

## 📁 파일 구조 변경 계획

```
lecturenote-ai/
├── server/
│   ├── index.js              # 기존 (수정)
│   ├── schemas.js            # AI 스키마 분리 (신규)
│   └── pdfGenerator.js       # PDF 생성 모듈 (신규)
├── components/
│   ├── LecturePreview.tsx    # 기존 (대폭 수정)
│   ├── ProcessingUI.tsx      # 기존
│   ├── TableOfContents.tsx   # 목차 컴포넌트 (신규)
│   ├── CheatSheet.tsx        # 1페이지 요약 (신규)
│   ├── FAQSection.tsx        # FAQ 섹션 (신규)
│   ├── FailureModes.tsx      # 실패 모드 섹션 (신규)
│   ├── DiagramRenderer.tsx   # SVG 도표 렌더러 (신규)
│   └── PrintLayout.tsx       # 프린트 전용 레이아웃 (신규)
├── services/
│   └── geminiService.ts      # 기존
├── utils/
│   └── vttParser.ts          # 기존
├── types.ts                  # 기존 (확장)
├── App.tsx                   # 기존 (수정)
└── styles/
    └── print.css             # 프린트 전용 스타일 (신규)
```

---

## 🚀 우선순위 및 일정

| 단계 | 작업 | 우선순위 | 예상 시간 |
|------|------|---------|----------|
| **Phase 1.1** | 스키마 확장 | 🔴 높음 | 30분 |
| **Phase 1.2** | 프롬프트 개선 | 🔴 높음 | 30분 |
| **Phase 1.3** | 타입 정의 확장 | 🔴 높음 | 15분 |
| **Phase 2.1** | 1페이지 요약 + 목차 | 🟠 중간 | 1시간 |
| **Phase 2.2** | FAQ, 실패모드 섹션 | 🟠 중간 | 1시간 |
| **Phase 2.3** | 프린트 스타일 최적화 | 🟠 중간 | 30분 |
| **Phase 3** | 서버사이드 PDF 생성 | 🟡 낮음 | 2시간 |
| **Phase 4** | 품질 게이트 | 🟡 낮음 | 1시간 |

---

## ✅ 다음 단계

**Phase 1 (AI 콘텐츠 품질 향상)부터 시작하시겠습니까?**

이 단계에서는:
1. `server/index.js`의 스키마 확장
2. 프롬프트 개선으로 더 풍부한 분석 결과 생성
3. `types.ts` 확장으로 새로운 데이터 구조 지원

이후 UI를 순차적으로 개선해 나갈 수 있습니다.
