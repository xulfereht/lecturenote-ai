# SPEC-PROCESS-001: 수락 기준

## 추적성

**관련 SPEC**: [SPEC-PROCESS-001](./spec.md)
**관련 구현 계획**: [plan.md](./plan.md)

---

## 1. 전처리 모듈 수락 기준

### AC-001: 입력 텍스트 정규화

**시나리오**: 인코딩 및 공백 정규화

```gherkin
Given 비정규화된 입력 텍스트가 있을 때
  """
  Hello　World  (전각 공백 + 연속 공백)
  Test\u0000String (널 문자 포함)
  """
When 전처리 파이프라인이 실행되면
Then 정규화된 텍스트가 생성된다
  """
  Hello World
  TestString
  """
And 변경 내역이 기록된다
  | 변경 유형 | 위치 | 원본 | 변경 |
  | whitespace | 5 | 　 | (space) |
  | whitespace | 11-12 | (double space) | (space) |
  | control_char | 21 | \u0000 | (removed) |
```

### AC-002: 세그먼트 검증

**시나리오**: 유효하지 않은 세그먼트 거부

```gherkin
Given 세그먼트 검증 규칙이 설정되어 있을 때
  | 규칙 | 값 |
  | minLength | 100 |
  | maxLength | 15000 |
When 50자 길이의 세그먼트가 입력되면
Then 검증 실패가 반환된다
And 에러 메시지가 포함된다
  """
  Segment too short: 50 characters (minimum: 100)
  """
```

### AC-003: 중복 감지

**시나리오**: 유사 텍스트 중복 감지

```gherkin
Given 중복 감지가 활성화되어 있을 때
  | 설정 | 값 |
  | enabled | true |
  | similarityThreshold | 0.9 |
  | mergeStrategy | first |
When 90% 이상 유사한 두 세그먼트가 입력되면
  """
  세그먼트 1: "프롬프트 엔지니어링은 AI 모델에게 효과적인 지시를 제공하는 기술입니다."
  세그먼트 2: "프롬프트 엔지니어링은 AI 모델에게 효과적인 지시를 제공하는 기술이에요."
  """
Then 첫 번째 세그먼트만 유지된다
And 중복 감지 로그가 기록된다
  """
  Duplicate detected: segment 2 (similarity: 0.95) merged with segment 1
  """
```

---

## 2. 설정 탭 UI 수락 기준

### AC-004: AI 제공자 선택

**시나리오**: 모델 변경 적용

```gherkin
Given 설정 탭이 열려 있을 때
And 현재 모델이 "gemini-2.5-flash"일 때
When 사용자가 모델을 "gemini-2.5-pro"로 변경하면
And "저장" 버튼을 클릭하면
Then 설정이 localStorage에 저장된다
And 이후 API 호출에 새 모델이 적용된다
And 성공 토스트 메시지가 표시된다
  """
  설정이 저장되었습니다. 새 모델: gemini-2.5-pro
  """
```

### AC-005: API 키 관리

**시나리오**: API 키 암호화 저장

```gherkin
Given 설정 탭의 API 키 입력 필드가 있을 때
When 사용자가 API 키 "AIza..."를 입력하면
And "저장" 버튼을 클릭하면
Then API 키가 암호화되어 localStorage에 저장된다
And 저장된 값이 원본과 다르다 (암호화됨)
And API 키 입력 필드에 마스킹된 값이 표시된다
  """
  AIza...••••••••
  """
```

### AC-006: 파라미터 설정

**시나리오**: Temperature 및 MaxTokens 설정

```gherkin
Given 설정 탭의 파라미터 섹션이 있을 때
When 사용자가 다음 값을 설정하면
  | 파라미터 | 값 |
  | temperature | 0.7 |
  | maxTokens | 8192 |
Then 슬라이더와 입력 필드가 동기화된다
And 설정이 유효성 검사를 통과한다
  | 파라미터 | 최소 | 최대 |
  | temperature | 0.0 | 2.0 |
  | maxTokens | 1024 | 32768 |
```

---

## 3. 후처리 모듈 수락 기준

### AC-007: AI 응답 검증

**시나리오**: 스키마 검증 실패 처리

```gherkin
Given AI 응답 검증이 활성화되어 있을 때
When AI가 필수 필드가 누락된 응답을 반환하면
  """json
  {
    "id": "ch1",
    "title": "챕터 1"
    // keyMessage 누락
    // narrative 누락
  }
  """
Then 검증 실패가 감지된다
And 에러 상세 정보가 반환된다
  """json
  {
    "isValid": false,
    "errors": [
      { "field": "keyMessage", "error": "Required field missing" },
      { "field": "narrative", "error": "Required field missing" }
    ]
  }
  """
And 재시도가 트리거된다
```

### AC-008: 오류 자동 교정

**시나리오**: 타임스탬프 형식 교정

```gherkin
Given 오류 교정이 활성화되어 있을 때
When AI 응답에 잘못된 타임스탬프가 포함되어 있으면
  """json
  {
    "quotesWithTimeline": [
      { "timestamp": "5:23", "quote": "..." },
      { "timestamp": "1:2:30", "quote": "..." }
    ]
  }
  """
Then 타임스탬프가 자동 교정된다
  """json
  {
    "quotesWithTimeline": [
      { "timestamp": "05:23", "quote": "..." },
      { "timestamp": "01:02:30", "quote": "..." }
    ]
  }
  """
And 교정 로그가 기록된다
  """
  Timestamp corrected: "5:23" -> "05:23"
  Timestamp corrected: "1:2:30" -> "01:02:30"
  """
```

### AC-009: 재시도 로직

**시나리오**: 지수 백오프 재시도

```gherkin
Given 재시도 설정이 다음과 같을 때
  | 설정 | 값 |
  | maxRetries | 3 |
  | baseDelayMs | 1000 |
  | backoffMultiplier | 2 |
When AI API 호출이 실패하면
Then 다음 간격으로 재시도가 수행된다
  | 시도 | 대기 시간 |
  | 1차 | 1000ms |
  | 2차 | 2000ms |
  | 3차 | 4000ms |
And 3회 모두 실패하면 최종 에러가 반환된다
  """json
  {
    "error": "AI generation failed after 3 retries",
    "lastError": "Rate limit exceeded"
  }
  """
```

### AC-010: 품질 점수 계산

**시나리오**: 완성도 기반 품질 점수

```gherkin
Given AI 응답이 완료되었을 때
When 품질 점수가 계산되면
Then 다음 항목별 점수가 산출된다
  | 항목 | 가중치 | 기준 |
  | completeness | 40% | 필수 필드 존재율 |
  | timestampAccuracy | 30% | 유효 타임스탬프 비율 |
  | contentLength | 30% | narrative 최소 500자 |
And 전체 점수가 0-100 범위로 반환된다
  """json
  {
    "overall": 85,
    "breakdown": {
      "completeness": 100,
      "timestampAccuracy": 80,
      "contentLength": 70
    }
  }
  """
```

---

## 4. 통합 테스트 시나리오

### AC-011: E2E 정상 처리 흐름

**시나리오**: 텍스트 업로드부터 결과 출력까지

```gherkin
Given 사용자가 설정 탭에서 다음을 구성했을 때
  | 항목 | 값 |
  | provider | google |
  | model | gemini-2.5-flash |
  | temperature | 0.5 |
When 사용자가 VTT 텍스트를 업로드하면
  """
  WEBVTT

  00:00:00.000 --> 00:01:00.000
  안녕하세요, 오늘 강의를 시작하겠습니다...
  (10,000자 이상의 텍스트)
  """
Then 전처리 파이프라인이 실행된다
  | 단계 | 상태 |
  | 정규화 | completed |
  | 세그먼트 분할 | completed |
  | 검증 | passed |
And 챕터별 분석이 시작된다
And 완료된 챕터에 품질 점수가 표시된다
  """
  챕터 1: 프롬프트 엔지니어링 기초 (품질: 92/100)
  챕터 2: 고급 기법 (품질: 88/100)
  """
```

### AC-012: E2E 오류 복구 흐름

**시나리오**: AI 응답 실패 시 자동 복구

```gherkin
Given 정상적인 설정으로 처리가 시작되었을 때
When AI API가 첫 번째 호출에서 실패하면
  """
  Error: 500 Internal Server Error
  """
Then 재시도가 자동으로 수행된다
And 사용자에게 재시도 상태가 표시된다
  """
  챕터 1: 처리 중... (재시도 2/3)
  """
And 재시도 성공 시 정상 결과가 반환된다
And 실패 로그가 기록된다
  """
  [WARN] Chapter 1 generation failed, retrying (attempt 2/3)
  [INFO] Chapter 1 generation succeeded on retry 2
  """
```

### AC-013: E2E 설정 변경 즉시 적용

**시나리오**: 처리 중 설정 변경

```gherkin
Given 챕터 1 처리가 완료되고 챕터 2 처리 중일 때
When 사용자가 설정 탭에서 모델을 변경하면
  | 변경 전 | 변경 후 |
  | gemini-2.5-flash | gemini-2.5-pro |
Then 현재 처리 중인 챕터 2는 기존 모델로 완료된다
And 챕터 3부터 새 모델이 적용된다
And 변경 사항이 로그에 기록된다
  """
  [INFO] Settings changed during processing
  [INFO] Chapter 2: Using gemini-2.5-flash (in-progress)
  [INFO] Chapter 3+: Will use gemini-2.5-pro
  """
```

---

## 5. 비기능 요구사항 검증

### AC-014: 성능 요구사항

```gherkin
Given 10,000자 텍스트가 입력되었을 때
When 전처리 파이프라인이 실행되면
Then 처리 시간이 100ms 이내여야 한다

Given AI 응답이 수신되었을 때
When 후처리 파이프라인이 실행되면
Then 처리 시간이 50ms 이내여야 한다

Given 설정 탭이 열릴 때
When 컴포넌트가 렌더링되면
Then 렌더링 시간이 16ms 이내여야 한다
```

### AC-015: 보안 요구사항

```gherkin
Given API 키가 localStorage에 저장될 때
When 저장된 값을 확인하면
Then 암호화된 형태여야 한다 (평문 불가)

Given 로그가 기록될 때
When API 키 관련 작업이 로깅되면
Then API 키 값이 마스킹되어야 한다
  """
  [INFO] API key updated: AIza...****
  """
```

---

## 6. Definition of Done

### 기능 완료 기준

- [ ] 모든 AC (AC-001 ~ AC-015) 테스트 통과
- [ ] 전처리/후처리 파이프라인 정상 동작
- [ ] 설정 탭 UI 완성 및 반응형 디자인 적용
- [ ] 기존 기능 하위 호환성 유지

### 코드 품질 기준

- [ ] TypeScript 타입 에러 0개
- [ ] JSDoc 문서화 완료
- [ ] 콘솔 에러/경고 0개

### 테스트 기준

- [ ] 단위 테스트 커버리지 80% 이상
- [ ] 통합 테스트 3개 시나리오 통과
- [ ] 수동 QA 완료 (체크리스트 서명)

---

*수락 기준 작성일: 2026-01-22*
*관련 SPEC: SPEC-PROCESS-001*
