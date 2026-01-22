# SPEC-PROCESS-001: 구현 계획

## 추적성

**관련 SPEC**: [SPEC-PROCESS-001](./spec.md)
**관련 수락 기준**: [acceptance.md](./acceptance.md)

---

## 1. 마일스톤 개요

### Primary Goal (1차 목표)

전처리 파이프라인 구축 및 기본 설정 UI

| 태스크 | 설명 | 파일 | 복잡도 |
|--------|------|------|--------|
| T-001A | 기본 텍스트 정규화 함수 (코드 기반) | `server/utils/textNormalizer.js` | Medium |
| T-001B | **LLM 기반 텍스트 교정** (핵심) | `server/utils/llmCorrector.js` | **High** |
| T-002 | 세그먼트 검증 로직 추가 | `server/index.js` | Medium |
| T-003 | 설정 탭 UI 컴포넌트 생성 | `components/SettingsTab.tsx` | Medium |
| T-004 | 설정 상태 관리 (localStorage) | `hooks/useSettings.ts` | Low |

### Secondary Goal (2차 목표)

후처리 파이프라인 및 AI 추상화

| 태스크 | 설명 | 파일 | 복잡도 |
|--------|------|------|--------|
| T-005 | AI 응답 검증 함수 구현 | `server/utils/responseValidator.js` | Medium |
| T-006 | 오류 교정 로직 구현 | `server/utils/errorCorrector.js` | Medium |
| T-007 | 재시도 로직 (지수 백오프) | `server/utils/retryHandler.js` | Low |
| T-008 | AI 제공자 추상화 레이어 | `server/ai/aiProvider.js` | High |

### Final Goal (최종 목표)

품질 점수 및 통합 테스트

| 태스크 | 설명 | 파일 | 복잡도 |
|--------|------|------|--------|
| T-009 | 품질 점수 계산 로직 | `server/utils/qualityScorer.js` | Medium |
| T-010 | 중복 챕터 감지/병합 | `server/utils/duplicateHandler.js` | Medium |
| T-011 | 타입 정의 업데이트 | `src/types.ts` | Low |
| T-012 | 통합 테스트 | `tests/integration/` | High |

---

## 2. 기술 접근 방식

### 2.1 전처리 파이프라인 아키텍처 (LLM 기반)

```
[사용자 입력 (녹취록/VTT)]
    │
    ▼
┌─────────────────────────────────────────┐
│      Phase 1: 기본 정규화 (코드 기반)    │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ UTF-8 정규화 │→│ 공백/특수문자 정리│  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│      세그먼트 분할 (30분 / 10,000자)     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│    Phase 2: LLM 기반 텍스트 교정 ★핵심   │
│  ┌─────────────────────────────────┐    │
│  │    세그먼트별 병렬 처리 (배치 3개)   │    │
│  │  ┌─────────┐  ┌─────────────┐  │    │
│  │  │오타 교정 │  │ 오청취 보정  │  │    │
│  │  └─────────┘  └─────────────┘  │    │
│  │  ┌─────────┐  ┌─────────────┐  │    │
│  │  │전문용어 │  │  문법 교정   │  │    │
│  │  └─────────┘  └─────────────┘  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  프롬프트: "녹취록 교정 전문가"           │
│  출력: 교정된 텍스트 + 교정 내역 JSON    │
└─────────────────────────────────────────┘
    │
    ▼
[교정된 세그먼트] → [챕터 분석 (기존 로직)]
```

**LLM 교정 처리 흐름**:
```
세그먼트 1 ─┐
세그먼트 2 ─┼─→ [LLM 교정 병렬 호출] ─→ 교정된 세그먼트 병합
세그먼트 3 ─┘     (배치 3개씩)
```

### 2.2 후처리 파이프라인 아키텍처

```
[AI 응답]
    │
    ▼
┌─────────────────────────────────────────┐
│          후처리 파이프라인               │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ 스키마 검증  │→│  필드 존재 확인  │  │
│  └─────────────┘  └─────────────────┘  │
│         │                  │            │
│         ▼                  ▼            │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │타임스탬프 검증│→│  오류 자동 교정  │  │
│  └─────────────┘  └─────────────────┘  │
│         │                  │            │
│         ▼                  ▼            │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │ 중복 제거   │→│   품질 점수      │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
    │
    ├── [성공] → 저장
    └── [실패] → 재시도 (지수 백오프)
```

### 2.3 설정 UI 컴포넌트 구조

```
<App>
  └── <Tabs>
        ├── <MainTab>         // 기존 강의 업로드 UI
        └── <SettingsTab>     // 새로 추가
              ├── <APISettings>
              │     ├── <ProviderSelector>
              │     ├── <APIKeyInput>
              │     └── <ModelSelector>
              └── <ProcessingSettings>
                    ├── <TemperatureSlider>
                    └── <MaxTokensInput>
```

### 2.4 AI 제공자 추상화 설계

```typescript
// server/ai/aiProvider.js

interface AIProvider {
  name: string;
  generateContent(prompt: string, config: GenerationConfig): Promise<AIResponse>;
  validateResponse(response: any): ValidationResult;
}

class GeminiProvider implements AIProvider {
  name = 'google';
  // 기존 Gemini API 로직 캡슐화
}

// 향후 확장을 위한 인터페이스
class OpenAIProvider implements AIProvider {
  name = 'openai';
  // 미구현 - 인터페이스만 정의
}

class AIProviderFactory {
  static create(config: AIProviderConfig): AIProvider {
    switch (config.provider) {
      case 'google': return new GeminiProvider(config);
      // case 'openai': return new OpenAIProvider(config);
      default: throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

---

## 3. 파일 변경 상세

### 3.1 신규 파일

| 파일 경로 | 목적 | 예상 라인 |
|-----------|------|----------|
| `server/utils/textNormalizer.js` | 기본 텍스트 정규화 (코드 기반) | ~150 |
| `server/utils/llmCorrector.js` | **LLM 기반 텍스트 교정** (핵심) | ~250 |
| `server/utils/responseValidator.js` | AI 응답 검증 | ~120 |
| `server/utils/errorCorrector.js` | 오류 자동 교정 | ~100 |
| `server/utils/retryHandler.js` | 재시도 로직 | ~80 |
| `server/utils/qualityScorer.js` | 품질 점수 계산 | ~100 |
| `server/utils/duplicateHandler.js` | 중복 감지/병합 | ~120 |
| `server/ai/aiProvider.js` | AI 제공자 추상화 | ~200 |
| `components/SettingsTab.tsx` | 설정 탭 UI | ~250 |
| `hooks/useSettings.ts` | 설정 상태 훅 | ~80 |

### 3.2 수정 파일

| 파일 경로 | 변경 사항 | 영향도 |
|-----------|----------|--------|
| `server/index.js` | 전처리/후처리 파이프라인 통합, AI 제공자 적용 | High |
| `utils/vttParser.ts` | 정규화 로직 호출 추가 | Medium |
| `src/App.tsx` | 설정 탭 추가, 탭 네비게이션 | Medium |
| `src/types.ts` | 새 인터페이스 타입 추가 | Low |

---

## 4. 위험 요소 및 대응

### 4.1 기술적 위험

| 위험 | 발생 가능성 | 영향도 | 대응 방안 |
|------|------------|--------|----------|
| AI 응답 형식 변경 | Medium | High | 스키마 검증 강화, 버전 관리 |
| 성능 저하 | Low | Medium | 벤치마크 테스트, 캐싱 적용 |
| localStorage 용량 초과 | Low | Low | 설정만 저장 (최소 데이터) |

### 4.2 의존성 위험

| 위험 | 발생 가능성 | 영향도 | 대응 방안 |
|------|------------|--------|----------|
| Gemini API 변경 | Medium | High | 추상화 레이어로 격리 |
| 브라우저 호환성 | Low | Medium | Polyfill 준비 |

---

## 5. 구현 순서 권장

```
Phase 1: 기반 구축 (Primary Goal)
├── T-001A: 기본 텍스트 정규화 (코드 기반)
├── T-004: useSettings 훅
├── T-003: 설정 탭 UI
├── T-008: AI 제공자 추상화 ★ LLM 교정 의존
└── T-001B: LLM 기반 텍스트 교정 ★★ 핵심 기능

Phase 2: 검증 및 후처리 (Secondary Goal)
├── T-002: 세그먼트 검증
├── T-005: 응답 검증
├── T-006: 오류 교정
└── T-007: 재시도 로직

Phase 3: 품질 개선 (Final Goal)
├── T-009: 품질 점수
├── T-010: 중복 처리
├── T-011: 타입 정의
└── T-012: 통합 테스트
```

**LLM 교정 구현 우선순위**:
- T-008 (AI 추상화) → T-001B (LLM 교정) 순서 필수
- LLM 교정은 설정 탭의 모델 선택과 연동됨

---

## 6. 베스트 프랙티스 적용

### 6.1 입력 정규화 (Industry Standard)

| 항목 | 적용 방법 |
|------|----------|
| 인코딩 정규화 | UTF-8 NFC 정규화 (`string.normalize('NFC')`) |
| 공백 정리 | 연속 공백 단일화, 앞뒤 trim |
| 특수문자 | 유니코드 대체 문자 처리, BOM 제거 |
| 제어문자 | ASCII 0x00-0x1F 제거 (개행 제외) |

### 6.2 응답 검증 (AI Integration Best Practice)

| 항목 | 적용 방법 |
|------|----------|
| 스키마 검증 | JSON Schema 또는 Zod (기존 의존성 내) |
| 필드 검증 | 필수 필드 존재 + 타입 확인 |
| 타임스탬프 | 정규식 `^\d{2}:\d{2}(:\d{2})?$` |
| 내용 검증 | 최소 길이, 빈 문자열 체크 |

### 6.3 재시도 로직 (Exponential Backoff)

```javascript
// 재시도 간격: 1s, 2s, 4s (최대 3회)
const delay = Math.min(
  baseDelay * Math.pow(backoffMultiplier, attempt),
  maxDelay
);
```

### 6.4 오류 교정 패턴

| 오류 유형 | 교정 방법 |
|----------|----------|
| 타임스탬프 `5:23` | `05:23`으로 패딩 |
| 누락된 `keyPoints` | 빈 배열 `[]` 삽입 |
| 중복 챕터 제목 | 첫 번째만 유지 또는 병합 |
| 빈 `narrative` | 경고 로그 + 기본 텍스트 |

---

## 7. 품질 게이트

### 7.1 코드 품질

- [ ] 모든 새 함수에 JSDoc 주석 추가
- [ ] TypeScript 타입 정의 완료
- [ ] 에러 핸들링 일관성 검증

### 7.2 테스트 요구사항

- [ ] 전처리 함수 단위 테스트 (최소 5개 케이스)
- [ ] 후처리 함수 단위 테스트 (최소 5개 케이스)
- [ ] 통합 테스트 (E2E 시나리오 3개)

### 7.3 성능 기준

- [ ] 전처리: 10,000자 기준 < 100ms
- [ ] 후처리: 응답당 < 50ms
- [ ] UI 렌더링: 설정 탭 < 16ms

---

*계획 생성일: 2026-01-22*
*관련 SPEC: SPEC-PROCESS-001*
