
export interface VTTLine {
  start: string;
  end: string;
  text: string;
}

// ========== 인용 + 타임라인 ==========
export interface QuoteWithTimeline {
  timestamp: string;
  quote: string;
  context?: string;
}

// ========== 핵심 용어 ==========
export interface KeyTerm {
  term: string;
  definition: string;
  importance?: string;
  example?: string;  // 사용 예시 또는 적용 사례
}

// ========== 챕터 ==========
export interface Chapter {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  timeRange?: string;  // "MM:SS ~ MM:SS" 형식
  duration?: number;  // 분
  summary: string;
  keyTopics?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';

  // Deep Dive 결과 (새로운 구조)
  keyMessage?: string;
  narrative?: string;  // 내러티브 스토리텔링
  quotesWithTimeline?: QuoteWithTimeline[];
  keyTerms?: KeyTerm[];
  keyPoints?: string[];
  practicalTips?: string[];

  // 이전 호환성 (deprecated)
  oneLiner?: string;
  detailedNote?: string;
  keyTakeaways?: string[];
}

// ========== 실천 체크리스트 ==========
export interface ActionChecklistItem {
  action: string;
  priority?: string;
  timeline?: string;
}

// ========== 실습 과제 ==========
export interface PracticeAssignment {
  title: string;
  description: string;
  difficulty?: string;
  estimatedTime?: string;
}

// ========== 핵심 인사이트 ==========
export interface CoreInsight {
  insight: string;
  relatedChapters?: string;
}

// ========== 전체 마무리 ==========
export interface FinalSummary {
  coreInsights: CoreInsight[];
  actionChecklist: ActionChecklistItem[];
  practiceAssignments?: PracticeAssignment[];
  reviewQuestions: string[];
  furtherLearning?: string[];
  oneSentenceSummary: string;
}

// ========== 강의노트 전체 ==========
export interface LectureNote {
  title: string;
  overview: string;
  totalDuration?: number;
  chapters: Chapter[];

  // 전체 마무리 (모든 챕터 완료 후)
  finalSummary?: FinalSummary;

  // 전체 집계 (선택)
  allGlossary?: KeyTerm[];
  allActionItems?: ActionChecklistItem[];
  allWarnings?: string[];
}

// ========== 상태 ==========
export enum JobStatus {
  IDLE = '대기',
  PARSING = '파싱중',
  ANALYZING = '구조분석중',
  STRUCTURING = '구조화중',
  COMPLETING = '완료중',
  SUCCESS = '성공',
  FAILED = '실패'
}
