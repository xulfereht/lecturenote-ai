
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
  context?: string; // 이 강의에서의 맥락적 의미
  firstMentionedChapterId?: string;
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
  
  keyTakeaways?: string[]; // 명제형 결론 (기존 keyPoints 대체)
  keyPoints?: string[]; // deprecated

  actionableItems?: string[]; // 구체적 행동 지침 (기존 practicalTips 대체)
  practicalTips?: string[]; // deprecated

  // 구조화된 시각 요소 (mermaidCode 대체)
  visualStructure?: {
    type: 'process' | 'comparison' | 'hierarchy' | 'timeline';
    title: string;
    items: Array<{
      label: string;
      description?: string;
      subItems?: string[];
    }>;
  };
  mermaidCode?: string; // deprecated - visualStructure로 대체

  // 이전 호환성 (deprecated)
  oneLiner?: string;
  detailedNote?: string;
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
  globalGlossary?: KeyTerm[];
}

// ========== 팩트체크 리포트 ==========
export interface CorrectionDetail {
  original: string;
  corrected: string;
  reason: string;
}

export interface CorrectionStats {
  originalLength: number;
  normalizedLength: number;
  correctedLength: number;
  correctionStats: {
    totalSegments: number;
    successfulCorrections: number;
    failedCorrections: number;
    skippedCorrections: number;
    totalCorrectionsApplied: number;
    correctionsByType: {
      typo: number;
      mishearing: number;
      terminology: number;
      other: number;
    };
    averageConfidence: number;
  } | null;
  correctionDetails: Array<{
    corrections: CorrectionDetail[];
  }> | null;
}

// ========== 강의노트 전체 ==========
export interface LectureNote {
  id?: string; // DB ID
  title: string;
  overview: string;
  totalDuration?: number;
  chapters: Chapter[];
  correction_stats?: CorrectionStats;
  
  // Metadata
  author?: string;
  source_url?: string;
  tags?: string[]; // JSON parsed
  memo?: string;
  created_at?: string;

  // 전체 마무리 (모든 챕터 완료 후)
  finalSummary?: FinalSummary;

  // 전체 집계 (선택)
  allGlossary?: KeyTerm[];
  allActionItems?: ActionChecklistItem[];
  allWarnings?: string[];
}
