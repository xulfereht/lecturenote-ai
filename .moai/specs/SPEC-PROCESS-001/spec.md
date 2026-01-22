# SPEC-PROCESS-001: 강의노트 텍스트 정제 및 AI 설정 파이프라인

## 메타데이터

| 항목 | 값 |
|------|-----|
| **SPEC ID** | SPEC-PROCESS-001 |
| **제목** | 강의노트 텍스트 정제 및 AI 설정 파이프라인 |
| **생성일** | 2026-01-22 |
| **상태** | Planned |
| **우선순위** | High |
| **담당** | manager-ddd |
| **영향 파일** | server/index.js, utils/vttParser.ts, App.tsx, types.ts |

---

## 1. 배경 및 목표

### 1.1 현재 상태 분석

현재 LectureNote AI는 다음과 같은 한계점을 가지고 있다:

1. **전처리 부재**: VTT 파싱 시 기본적인 파싱만 수행하며, 입력 텍스트의 정규화/검증이 없음
2. **세그먼트 검증 미흡**: 30분/10,000자 분할 시 유효성 검사 없이 단순 분할만 수행
3. **AI 설정 고정**: `gemini-2.5-flash` 모델이 하드코딩되어 있으며, 사용자가 모델/파라미터를 변경할 수 없음
4. **후처리 미흡**: 스키마 검증만 수행하며, AI 응답의 오류 교정 로직이 없음
5. **설정 UI 부재**: API 키 및 모델 설정을 위한 사용자 인터페이스가 없음

### 1.2 목표

- 입력 텍스트의 품질을 향상시키는 전처리 파이프라인 구축
- AI 응답 품질을 개선하는 후처리 파이프라인 구축
- 사용자가 AI 제공자/모델을 선택할 수 있는 설정 UI 제공
- 베스트 프랙티스 기반의 오류 처리 및 재시도 로직 구현

### 1.3 비목표

- OpenAI, Anthropic 등 타사 API 통합 (향후 확장 가능하도록 설계만)
- 실시간 스트리밍 응답 처리
- 사용자 계정 시스템 및 API 키 클라우드 저장

---

## 2. EARS 요구사항

### 2.1 Ubiquitous (항상 적용)

| ID | 요구사항 |
|----|----------|
| U-001 | 시스템은 **항상** 모든 입력 텍스트를 처리 전에 정규화해야 한다 |
| U-002 | 시스템은 **항상** AI 응답을 스키마 및 필드 존재 여부로 검증해야 한다 |
| U-003 | 시스템은 **항상** 처리 로그를 기록해야 한다 |

### 2.2 Event-Driven (이벤트 기반)

| ID | 이벤트 | 응답 |
|----|--------|------|
| E-001 | **WHEN** 사용자가 텍스트를 업로드하면 **THEN** 시스템은 기본 정규화를 실행해야 한다 |
| E-002 | **WHEN** 기본 정규화가 완료되면 **THEN** 시스템은 세그먼트 분할을 수행해야 한다 |
| E-003 | **WHEN** 세그먼트가 생성되면 **THEN** 시스템은 LLM 기반 텍스트 교정을 실행해야 한다 |
| E-004 | **WHEN** LLM 교정이 완료되면 **THEN** 시스템은 교정된 세그먼트로 챕터 분석을 수행해야 한다 |
| E-005 | **WHEN** AI 응답을 수신하면 **THEN** 시스템은 후처리 파이프라인을 실행해야 한다 |
| E-006 | **WHEN** 사용자가 설정을 변경하면 **THEN** 시스템은 이후 API 호출에 새 설정을 적용해야 한다 |

### 2.3 State-Driven (상태 기반)

| ID | 조건 | 응답 |
|----|------|------|
| S-001 | **IF** 세그먼트가 처리 중이면 **THEN** 시스템은 품질 검사를 적용해야 한다 |
| S-002 | **IF** API 키가 설정되어 있으면 **THEN** 시스템은 해당 제공자의 API를 사용해야 한다 |
| S-003 | **IF** 타임스탬프가 없는 텍스트이면 **THEN** 시스템은 10,000자 단위로 분할해야 한다 |

### 2.4 Optional (선택적 기능)

| ID | 조건 | 응답 |
|----|------|------|
| O-001 | **가능하면** 설정 탭이 활성화된 경우 사용자가 AI 제공자/모델을 구성할 수 있어야 한다 |
| O-002 | **가능하면** 시스템은 품질 점수를 계산하여 표시해야 한다 |

### 2.5 Unwanted (금지 행위)

| ID | 조건 | 응답 |
|----|------|------|
| W-001 | 시스템은 검증 없이 AI 응답을 저장**하지 않아야 한다** |
| W-002 | 시스템은 API 키를 평문으로 로그에 기록**하지 않아야 한다** |
| W-003 | **IF** AI 응답이 검증에 실패하면 **THEN** 시스템은 지수 백오프로 재시도해야 한다 |

---

## 3. 기능 명세

### 3.1 전처리 모듈 (Preprocessing Module)

#### 3.1.1 기본 정규화 (코드 기반)

```typescript
interface BasicNormalizationConfig {
  normalizeEncoding: boolean;      // UTF-8 정규화
  stripWhitespace: boolean;        // 불필요한 공백 제거
  normalizeSpecialChars: boolean;  // 특수문자 정규화
  removeControlChars: boolean;     // 제어 문자 제거
}
```

#### 3.1.2 LLM 기반 텍스트 교정 (핵심 기능)

녹취록의 오타, 오청취, 전문용어 오류를 문맥 기반으로 교정한다.

```typescript
interface LLMCorrectionConfig {
  enabled: boolean;                 // LLM 교정 활성화
  processPerSegment: boolean;       // 세그먼트별 처리 (권장: true)
  correctionTypes: {
    typos: boolean;                 // 오타 교정 ("모댈" → "모델")
    misheard: boolean;              // 오청취 교정 ("인공 지능" → "인공지능")
    terminology: boolean;           // 전문용어 보정
    grammar: boolean;               // 문법 오류 교정
  };
  preserveTimestamps: boolean;      // 타임스탬프 보존 (필수: true)
}

interface LLMCorrectionResult {
  originalText: string;
  correctedText: string;
  corrections: Correction[];        // 교정 내역
  confidence: number;               // 교정 신뢰도 (0-1)
}

interface Correction {
  original: string;
  corrected: string;
  type: 'typo' | 'misheard' | 'terminology' | 'grammar';
  position: { start: number; end: number };
  confidence: number;
}
```

**LLM 교정 프롬프트 설계**:
```
당신은 강의 녹취록 교정 전문가입니다.
다음 텍스트에서 오타, 오청취, 전문용어 오류를 교정해주세요.

규칙:
1. 타임스탬프([HH:MM:SS])는 절대 수정하지 마세요
2. 문맥을 고려하여 오청취된 단어를 교정하세요
3. 전문용어는 올바른 표기로 통일하세요
4. 원문의 의미를 변경하지 마세요
5. 교정한 부분을 JSON으로 반환하세요

입력 텍스트:
{segment_text}
```

**처리 흐름**:
```
입력 텍스트
    ↓
기본 정규화 (코드 기반, 빠름)
    ↓
세그먼트 분할
    ↓
각 세그먼트 → LLM 교정 (병렬 처리)
    ↓
교정된 세그먼트 병합
    ↓
챕터 분석 (기존 로직)
```

#### 3.1.3 입력 정규화 결과

```typescript
interface NormalizedResult {
  text: string;
  originalLength: number;
  normalizedLength: number;
  basicChanges: NormalizationChange[];   // 코드 기반 변경
  llmCorrections: Correction[];          // LLM 기반 교정
  processingTime: {
    basicMs: number;
    llmMs: number;
  };
}
```

#### 3.1.2 세그먼트 검증

```typescript
interface SegmentValidation {
  minLength: number;      // 최소 길이 (기본: 100자)
  maxLength: number;      // 최대 길이 (기본: 15,000자)
  requireTimestamp: boolean;  // 타임스탬프 필수 여부
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
```

#### 3.1.3 중복 감지

```typescript
interface DuplicateDetection {
  enabled: boolean;
  similarityThreshold: number;  // 유사도 임계값 (0.0-1.0)
  mergeStrategy: 'first' | 'longest' | 'merge';
}
```

### 3.2 설정 탭 UI (Settings Tab)

#### 3.2.1 AI 제공자 설정

```typescript
interface AIProviderConfig {
  provider: 'google' | 'openai' | 'anthropic';  // 확장 가능
  apiKey: string;  // 암호화 저장
  model: string;
  temperature: number;
  maxTokens: number;
}

// 현재 지원: Google Gemini
interface GeminiConfig extends AIProviderConfig {
  provider: 'google';
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
}
```

#### 3.2.2 설정 저장

- 브라우저 localStorage에 암호화하여 저장 (AES-256)
- 서버 측 .env 파일은 기존 방식 유지

### 3.3 후처리 모듈 (Postprocessing Module)

#### 3.3.1 AI 응답 검증

```typescript
interface ResponseValidation {
  schemaValidation: boolean;      // JSON 스키마 검증
  fieldExistence: boolean;        // 필수 필드 존재 확인
  timestampValidation: boolean;   // 타임스탬프 형식 검증
  contentQuality: boolean;        // 내용 품질 검사
}
```

#### 3.3.2 오류 교정

```typescript
interface ErrorCorrection {
  fixTimestampFormat: boolean;    // "5:23" -> "05:23"
  fillMissingFields: boolean;     // 누락 필드 기본값 채우기
  removeDuplicateChapters: boolean;  // 중복 챕터 제거
}
```

#### 3.3.3 재시도 로직

```typescript
interface RetryConfig {
  maxRetries: number;           // 기본: 3
  baseDelayMs: number;          // 기본: 1000ms
  maxDelayMs: number;           // 기본: 10000ms
  backoffMultiplier: number;    // 기본: 2
}
```

#### 3.3.4 품질 점수

```typescript
interface QualityScore {
  overall: number;              // 0-100
  completeness: number;         // 필드 완성도
  timestampAccuracy: number;    // 타임스탬프 정확도
  contentLength: number;        // 내용 충실도
}
```

---

## 4. 기술 제약사항

### 4.1 기존 의존성 유지

- 새로운 npm 패키지 설치 **금지** (기존 @google/genai 활용)
- React 19, Express 5, TypeScript 5.8 스택 유지

### 4.2 하위 호환성

- 기존 `/api/lectures` 엔드포인트 동작 유지
- 기존 데이터베이스 스키마 변경 최소화

### 4.3 성능 요구사항

- 전처리: 10,000자 기준 100ms 이내
- 후처리: 응답당 50ms 이내
- 설정 저장/로드: 10ms 이내

### 4.4 향후 확장성

- AI 제공자 추가 가능한 추상화 레이어 설계
- OpenAI, Anthropic API 통합 준비 (인터페이스만 정의)

---

## 5. 추적성 태그

```
[SPEC-PROCESS-001] 강의노트 텍스트 정제 및 AI 설정 파이프라인
├── [SPEC-PROCESS-001-PRE] 전처리 모듈
│   ├── [SPEC-PROCESS-001-PRE-NORM] 입력 정규화
│   ├── [SPEC-PROCESS-001-PRE-VALID] 세그먼트 검증
│   └── [SPEC-PROCESS-001-PRE-DUP] 중복 감지
├── [SPEC-PROCESS-001-SET] 설정 탭 UI
│   ├── [SPEC-PROCESS-001-SET-PROVIDER] AI 제공자 선택
│   ├── [SPEC-PROCESS-001-SET-MODEL] 모델 선택
│   └── [SPEC-PROCESS-001-SET-PARAMS] 파라미터 구성
└── [SPEC-PROCESS-001-POST] 후처리 모듈
    ├── [SPEC-PROCESS-001-POST-VALID] 응답 검증
    ├── [SPEC-PROCESS-001-POST-FIX] 오류 교정
    ├── [SPEC-PROCESS-001-POST-RETRY] 재시도 로직
    └── [SPEC-PROCESS-001-POST-SCORE] 품질 점수
```

---

*문서 생성일: 2026-01-22*
*SPEC 버전: 1.0.0*
