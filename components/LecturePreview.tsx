
import React, { useState } from 'react';
import {
  LectureNote,
  Chapter,
  QuoteWithTimeline,
  KeyTerm,
  FinalSummary
} from '../types';
import {
  Clock,
  Book,
  CheckSquare,
  AlertTriangle,
  FileDown,
  Target,
  Sparkles,
  Loader2,
  Lightbulb,
  BookOpen,
  Quote,
  ListChecks,
  Edit3,
  Save,
  X,
  RefreshCw,
  FileText,
  MessageSquare,
  Award,
  HelpCircle,
  ChevronRight
} from 'lucide-react';

interface PreviewProps {
  note: LectureNote;
  onDownload: () => void;
  onDownloadMarkdown?: () => void;
  onDeepDive: (chapterId: string) => void;
  onUpdateNote?: (updatedNote: LectureNote) => void;
  onRegenerateWithFeedback?: (chapterId: string, feedback: string) => Promise<void>;
  onGenerateFinalSummary?: () => Promise<void>;
}

// ========== 텍스트 정제 유틸리티 (한글 숫자 -> 아라비아 숫자) ==========
const refineKoreanText = (text: string): string => {
  let refined = text;

  // 1. 기본 키워드 대문자 변환
  refined = refined.replace(/\bgpt\b/gi, 'GPT');
  refined = refined.replace(/\bllm\b/gi, 'LLM');

  // 2. 한글 숫자 매핑
  const numberMap: { [key: string]: number } = {
    '영': 0, '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9
  };

  // 3. 단순 "X 점 Y" 패턴 변환
  refined = refined.replace(/([영일이삼사오육칠팔구])\s*점\s*([영일이삼사오육칠팔구])/g, (_, a, b) => {
    return `${numberMap[a]}.${numberMap[b]}`;
  });

  // 4. 단위 변환 (일 분 -> 1분)
  const parseKoreanNumber = (krNum: string) => {
    let result = 0;
    let temp = 0;
    for (let i = 0; i < krNum.length; i++) {
      const char = krNum[i];
      if (numberMap[char] !== undefined) {
        temp = numberMap[char];
      } else if (char === '십') {
        result += (temp === 0 ? 1 : temp) * 10;
        temp = 0;
      } else if (char === '백') {
        result += (temp === 0 ? 1 : temp) * 100;
        temp = 0;
      } else if (char === '천') {
        result += (temp === 0 ? 1 : temp) * 1000;
        temp = 0;
      }
    }
    result += temp;
    return result;
  };

  refined = refined.replace(/([영일이삼사오육칠팔구십백\s]+)\s*(분|초|개|년|월|일|시|명|번)/g, (match, numStr, unit) => {
    const cleanNumStr = numStr.replace(/\s+/g, '');
    if (!/^[영일이삼사오육칠팔구십백천]+$/.test(cleanNumStr)) return match;
    const num = parseKoreanNumber(cleanNumStr);
    return `${num}${unit}`;
  });

  return refined;
};

// ========== Markdown Renderer ==========
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const parseMarkdown = (text: string) => {
    // 1. 줄바꿈 정규화 (\\n 문자열 → 실제 줄바꿈)
    let processedText = text
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // 2. 헤더/인용구 앞에 줄바꿈 보장
    processedText = processedText
      .replace(/([^\n])(## )/g, '$1\n\n$2')
      .replace(/([^\n])(### )/g, '$1\n\n$2')
      .replace(/([^\n])(> )/g, '$1\n\n$2');

    // 3. 연속된 줄바꿈 정리 (3개 이상 → 2개)
    processedText = processedText.replace(/\n{3,}/g, '\n\n');

    const lines = processedText.split('\n');
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // H2 제목 (## )
      if (trimmedLine.startsWith('## ')) {
        elements.push(
          <h3 key={i} className="text-xl md:text-2xl font-bold text-gray-900 mt-10 mb-5 first:mt-0 pb-3 border-b-2 border-indigo-100 tracking-tight leading-snug flex items-center gap-2">
            <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(3)) }} />
          </h3>
        );
        continue;
      }

      // H3 소제목 (### )
      if (trimmedLine.startsWith('### ')) {
        elements.push(
          <h4 key={i} className="text-lg font-bold text-gray-800 mt-8 mb-3 tracking-tight">
            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(4)) }} />
          </h4>
        );
        continue;
      }

      // 리스트 아이템 (- )
      if (trimmedLine.startsWith('- ')) {
        elements.push(
          <div key={i} className="flex items-start gap-3 ml-2 mb-2">
            <span className="mt-3 w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0"></span>
            <span className="text-[17px] text-gray-800 leading-8" dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(2)) }} />
          </div>
        );
        continue;
      }

      // 숫자 리스트 (1. 2. 3.)
      const numMatch = trimmedLine.match(/^(\d+)\.\s(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={i} className="flex items-start gap-3 ml-2 mb-2">
            <span className="text-indigo-600 font-bold text-sm min-w-[24px] mt-1">{numMatch[1]}.</span>
            <span className="text-[17px] text-gray-800 leading-8" dangerouslySetInnerHTML={{ __html: parseBold(numMatch[2]) }} />
          </div>
        );
        continue;
      }

      // 인용구 (> )
      if (trimmedLine.startsWith('>')) {
        const quoteContent = trimmedLine.replace(/^>+\s?/, '');
        const timestampMatch = quoteContent.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
        const timestamp = timestampMatch ? timestampMatch[1] : null;

        if (timestamp) {
          let textBody = quoteContent.replace(timestampMatch![0], '').trim();
          textBody = textBody.replace(/^\*+\s*/, '').replace(/\*+$/, '').trim();
          const quoteMatch = textBody.match(/^"([^"]+)"(.*)/s) || textBody.match(/^'([^']+)'(.*)/s);

          let quoteText = textBody;
          let commentary: string | null = null;

          if (quoteMatch) {
            quoteText = quoteMatch[1].trim();
            commentary = quoteMatch[2].trim();
          } else {
            quoteText = textBody.replace(/^["']|["']$/g, '');
          }

          quoteText = refineKoreanText(quoteText);

          elements.push(
            <div key={i} className="my-8">
              <div className="relative ml-1">
                <div className="absolute -left-3 -top-3 w-8 h-8 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm z-10">
                  <Quote className="w-3.5 h-3.5 text-gray-400 fill-gray-400" />
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5 pl-8 shadow-sm">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-600 font-mono mb-2">
                    <Clock className="w-3 h-3" />
                    {timestamp}
                  </span>
                  <p className="text-gray-900 font-medium text-lg leading-relaxed">"{quoteText}"</p>
                </div>
              </div>
              {commentary && (
                <div className="pl-6 border-l-2 border-indigo-100 ml-4 mt-3">
                  <p className="text-gray-600 text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: parseBold(commentary) }} />
                </div>
              )}
            </div>
          );
          continue;
        }

        // 일반 인용구
        elements.push(
          <div key={i} className="my-5 bg-gray-50 border-l-4 border-indigo-300 pl-5 py-3 rounded-r-lg">
            <p className="text-gray-700 text-[16px] leading-7 italic" dangerouslySetInnerHTML={{ __html: parseBold(quoteContent) }} />
          </div>
        );
        continue;
      }

      // 빈 줄
      if (trimmedLine === '') {
        elements.push(<div key={i} className="h-3" />);
        continue;
      }

      // 일반 본문
      elements.push(
        <p key={i} className="text-[17px] text-gray-800 leading-8 mb-3 tracking-[-0.01em] break-keep" dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine) }} />
      );
    }

    return elements;
  };

  const parseBold = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 bg-yellow-100/60 px-1 rounded">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-gray-700">$1</em>');
  };

  return (
    <div className="font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        .font-sans { font-family: 'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        .font-serif { font-family: 'Source Serif Pro', 'Noto Serif KR', serif; }
      `}</style>
      <div className="prose max-w-none">
        {parseMarkdown(content)}
      </div>
    </div>
  );
};

// ========== Section Component (항상 펼쳐진 상태) ==========
const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  bgClass?: string;
}> = ({ title, icon, children, bgClass = 'bg-gray-50' }) => (
  <div className={`${bgClass} rounded-xl p-4 pdf-section`}>
    <div className="flex items-center gap-2 mb-3 font-bold text-gray-700">
      {icon}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

// ========== Chapter Card (PDF 최적화 + 편집 + 피드백 재생성) ==========
const ChapterCard: React.FC<{
  chapter: Chapter;
  chapterNumber: number;
  onDeepDive: () => void;
  onSaveEdit?: (chapterId: string, updatedChapter: Partial<Chapter>) => void;
  onRegenerateWithFeedback?: (chapterId: string, feedback: string) => Promise<void>;
}> = ({ chapter, chapterNumber, onDeepDive, onSaveEdit, onRegenerateWithFeedback }) => {
  const isCompleted = chapter.status === 'completed';
  const isProcessing = chapter.status === 'processing';
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState(chapter.narrative || chapter.detailedNote || '');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleSaveEdit = () => {
    if (onSaveEdit) {
      onSaveEdit(chapter.id, { detailedNote: editedNote });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedNote(chapter.detailedNote || '');
    setIsEditing(false);
  };

  const handleRegenerateWithFeedback = async () => {
    if (!onRegenerateWithFeedback || !feedback.trim()) return;

    setIsRegenerating(true);
    try {
      await onRegenerateWithFeedback(chapter.id, feedback);
      setShowFeedback(false);
      setFeedback('');
    } catch (e) {
      console.error("Regeneration error:", e);
      alert("재생성 중 오류가 발생했습니다.");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="pdf-chapter rounded-2xl border border-gray-200 bg-white overflow-hidden mb-6">
      {/* Chapter Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full">
                Chapter {chapterNumber}
              </span>
              {chapter.timeRange && (
                <span className="text-blue-100 text-sm font-mono">
                  {chapter.timeRange}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black">{chapter.title}</h2>
            {chapter.oneLiner && (
              <p className="text-blue-100 mt-2 text-lg italic">"{chapter.oneLiner}"</p>
            )}
          </div>

          <div className="no-print flex items-center gap-2">
            {!isCompleted && !isProcessing && (
              <button
                onClick={onDeepDive}
                className="bg-white text-blue-600 text-sm px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-50 transition-all shadow-lg"
              >
                <Sparkles className="w-4 h-4" /> 상세 분석
              </button>
            )}

            {/* 완료된 챕터: 피드백 재생성 버튼 */}
            {isCompleted && onRegenerateWithFeedback && !isEditing && !showFeedback && (
              <button
                onClick={() => setShowFeedback(true)}
                className="bg-white/10 text-white text-sm px-3 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white/20 transition-all border border-white/20"
              >
                <MessageSquare className="w-4 h-4" /> 피드백 수정
              </button>
            )}

            {isProcessing && (
              <div className="flex items-center gap-2 text-white/80 text-sm font-bold animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin" /> 분석 중...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chapter Content */}
      <div className="p-6">

        {/* 재생성 로딩 표시 */}
        {isRegenerating && (
          <div className="mb-6 bg-blue-50 p-4 rounded-xl flex items-center justify-center gap-3 text-blue-700 border border-blue-200 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-bold">피드백을 반영하여 챕터 전체를 다시 작성하고 있습니다...</span>
          </div>
        )}

        {/* 피드백 입력 폼 (전체 콘텐츠 상단) */}
        {showFeedback && (
          <div className="mb-6 space-y-3 bg-orange-50 p-4 rounded-xl border border-orange-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-orange-900 font-bold mb-1">챕터 전체 재생성</h4>
                <p className="text-sm text-orange-800">
                  오류나 수정이 필요한 부분을 알려주세요. 내러티브, 핵심 포인트, 용어 등 <b>챕터의 모든 내용</b>이 피드백을 반영하여 새로 작성됩니다.
                </p>
              </div>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="예: 'GPT 5 thinking 설명이 틀렸습니다', '예시가 너무 빈약하니 더 추가해주세요', '말투를 좀 더 부드럽게 바꿔주세요'"
              className="w-full h-24 p-3 bg-white border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y text-sm mt-2"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowFeedback(false); setFeedback(''); }}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" /> 취소
              </button>
              <button
                onClick={handleRegenerateWithFeedback}
                disabled={!feedback.trim() || isRegenerating}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? '요청 중...' : '전체 재생성'}
              </button>
            </div>
          </div>
        )}

        {!isCompleted ? (
          <div className="text-gray-500 italic py-4">{chapter.summary}</div>
        ) : (
          <div className="space-y-5">
            {/* 📖 핵심 내용 (상세 노트) */}
            {(chapter.narrative || chapter.detailedNote || isEditing) && (
              <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-lg text-blue-900">📖 핵심 내용</h3>
                  </div>
                  <div className="no-print flex items-center gap-2">
                    {onSaveEdit && !isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Edit3 className="w-3 h-3" /> 직접 수정
                      </button>
                    )}
                  </div>
                </div>

                {/* 이전 피드백 UI 제거됨 (위로 이동) */}

                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editedNote}
                      onChange={(e) => setEditedNote(e.target.value)}
                      className="w-full h-64 p-4 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono text-sm"
                      placeholder="마크다운 형식으로 작성하세요..."
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-4 h-4" /> 취소
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Save className="w-4 h-4" /> 저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-5 rounded-lg">
                    <MarkdownContent content={chapter.narrative || chapter.detailedNote || ''} />
                  </div>
                )}
              </div>
            )}



            {/* 📚 핵심 용어 (새 스키마) */}
            {chapter.keyTerms && chapter.keyTerms.length > 0 && (
              <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-200">
                <div className="flex items-center gap-2 mb-4">
                  <Book className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-lg text-indigo-900">📚 핵심 개념 & 용어</h3>
                </div>
                <div className="grid gap-3">
                  {chapter.keyTerms.map((t, i) => (
                    <div key={i} className="bg-white p-4 rounded-lg border-l-4 border-indigo-400">
                      <h5 className="font-bold text-indigo-900">{t.term}</h5>
                      <p className="text-gray-700 mt-1">{t.definition}</p>
                      {t.example && (
                        <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">📌 예시: {t.example}</p>
                      )}
                      {t.importance && (
                        <p className="text-sm text-indigo-600 mt-2">💡 {t.importance}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 💡 핵심 포인트 */}
            {(chapter.keyPoints || chapter.keyTakeaways) && (chapter.keyPoints || chapter.keyTakeaways)!.length > 0 && (
              <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-bold text-lg text-yellow-800">💡 핵심 포인트</h3>
                </div>
                <div className="space-y-2">
                  {(chapter.keyPoints || chapter.keyTakeaways)!.map((point, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white p-3 rounded-lg">
                      <span className="bg-yellow-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <p className="text-gray-800 leading-relaxed">{point}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ 실용 팁 */}
            {chapter.practicalTips && chapter.practicalTips.length > 0 && (
              <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
                <div className="flex items-center gap-2 mb-4">
                  <CheckSquare className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-lg text-emerald-800">✅ 실용 팁</h3>
                </div>
                <div className="space-y-2">
                  {chapter.practicalTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white p-3 rounded-lg">
                      <ChevronRight className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      <p className="text-gray-800">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== Main Preview (PDF 최적화) ==========
export const LecturePreview: React.FC<PreviewProps> = ({
  note,
  onDownload,
  onDownloadMarkdown,
  onDeepDive,
  onUpdateNote,
  onRegenerateWithFeedback,
  onGenerateFinalSummary
}) => {
  const completedCount = note.chapters?.filter(c => c.status === 'completed').length || 0;
  const totalChapters = note.chapters?.length || 1;
  const progressPercent = (completedCount / totalChapters) * 100;

  // 챕터 편집 저장
  const handleChapterEdit = (chapterId: string, updates: Partial<Chapter>) => {
    if (!onUpdateNote) return;

    const updatedChapters = note.chapters.map(ch =>
      ch.id === chapterId ? { ...ch, ...updates } : ch
    );

    onUpdateNote({
      ...note,
      chapters: updatedChapters
    });
  };

  return (
    <div className="pdf-container max-w-4xl mx-auto pb-16">
      {/* ===== COVER PAGE (첫 페이지) ===== */}
      <div className="pdf-cover bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 text-white mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />

        <div className="relative z-10">
          {/* Title */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full text-blue-300 text-xs font-bold uppercase tracking-widest border border-blue-500/30 mb-4">
              <Sparkles className="w-3 h-3" /> AI 강의노트
            </div>
            <h1 className="text-3xl md:text-4xl font-black leading-tight">{note.title}</h1>
          </div>

          {/* Progress (화면에서만) */}
          <div className="no-print flex flex-wrap items-center gap-4 mt-6">
            <div className="flex items-center gap-3">
              <div className="h-2 w-40 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-400">
                {completedCount}/{totalChapters} 완료
              </span>
            </div>

            <button
              onClick={onDownload}
              disabled={completedCount === 0}
              className={`bg-white text-gray-900 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm ${completedCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50'}`}
            >
              <FileDown className="w-4 h-4" /> PDF
            </button>

            {onDownloadMarkdown && (
              <button
                onClick={onDownloadMarkdown}
                disabled={completedCount === 0}
                className={`bg-gray-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm ${completedCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}`}
              >
                <FileText className="w-4 h-4" /> MD
              </button>
            )}
          </div>

          {/* 목차 (PDF용) */}
          <div className="print-only mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">목차</h3>
            <div className="space-y-1">
              {note.chapters?.map((ch, i) => (
                <div key={ch.id} className="flex items-center gap-2 text-gray-300 text-sm">
                  <span className="font-mono text-gray-500">{String(i + 1).padStart(2, '0')}</span>
                  <span>{ch.title}</span>
                  {ch.timeRange && <span className="text-gray-500 ml-auto">{ch.timeRange}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 강의 개요 ===== */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 mb-8 pdf-section">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">강의 개요</h2>
        </div>
        <p className="text-lg text-gray-700 leading-relaxed">{note.overview}</p>
      </div>

      {/* ===== 챕터들 ===== */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4 no-print">
          <Clock className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">챕터별 분석</h2>
        </div>

        {note.chapters?.map((chapter, index) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            chapterNumber={index + 1}
            onDeepDive={() => onDeepDive(chapter.id)}
            onSaveEdit={onUpdateNote ? handleChapterEdit : undefined}
            onRegenerateWithFeedback={onRegenerateWithFeedback}
          />
        ))}
      </div>

      {/* ===== 전체 마무리 버튼 (모든 챕터 완료 시) ===== */}
      {completedCount === totalChapters && !note.finalSummary && onGenerateFinalSummary && (
        <div className="no-print my-8 text-center">
          <button
            onClick={onGenerateFinalSummary}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-3 mx-auto"
          >
            <Award className="w-6 h-6" />
            🎉 전체 마무리 생성하기
          </button>
          <p className="text-sm text-gray-500 mt-2">
            모든 챕터가 완료되었습니다! 핵심 인사이트, 실천 체크리스트, 복습 질문을 생성하세요.
          </p>
        </div>
      )}

      {/* ===== 전체 마무리 (Final Summary) ===== */}
      {note.finalSummary && (
        <div className="mt-8 space-y-6">
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Award className="w-8 h-8" />
              <h2 className="text-2xl font-black">🎯 전체 마무리</h2>
            </div>
            {note.finalSummary.oneSentenceSummary && (
              <p className="text-xl italic text-white/90">
                "{note.finalSummary.oneSentenceSummary}"
              </p>
            )}
          </div>

          {/* 핵심 인사이트 */}
          {note.finalSummary.coreInsights && note.finalSummary.coreInsights.length > 0 && (
            <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-lg text-purple-900">💎 핵심 인사이트</h3>
              </div>
              <div className="space-y-3">
                {note.finalSummary.coreInsights.map((ins, i) => (
                  <div key={i} className="bg-white p-4 rounded-lg border-l-4 border-purple-400">
                    <p className="font-medium text-gray-900">{ins.insight}</p>
                    {ins.relatedChapters && (
                      <p className="text-sm text-purple-600 mt-1">관련: {ins.relatedChapters}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 실천 체크리스트 */}
          {note.finalSummary.actionChecklist && note.finalSummary.actionChecklist.length > 0 && (
            <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-lg text-emerald-900">✅ 실천 체크리스트</h3>
              </div>
              <div className="space-y-2">
                {note.finalSummary.actionChecklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white p-3 rounded-lg">
                    <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.action}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        {item.priority && (
                          <span className={`px-2 py-0.5 rounded ${item.priority === '높음' ? 'bg-red-100 text-red-700' :
                            item.priority === '중간' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{item.priority}</span>
                        )}
                        {item.timeline && (
                          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.timeline}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 실습 과제 */}
          {note.finalSummary.practiceAssignments && note.finalSummary.practiceAssignments.length > 0 && (
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-blue-900">📝 실습 과제</h3>
              </div>
              <div className="space-y-3">
                {note.finalSummary.practiceAssignments.map((pa, i) => (
                  <div key={i} className="bg-white p-4 rounded-lg">
                    <h4 className="font-bold text-gray-900">{i + 1}. {pa.title}</h4>
                    <p className="text-gray-700 mt-1">{pa.description}</p>
                    {(pa.difficulty || pa.estimatedTime) && (
                      <div className="flex gap-2 mt-2 text-xs">
                        {pa.difficulty && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{pa.difficulty}</span>
                        )}
                        {pa.estimatedTime && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{pa.estimatedTime}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 복습 질문 */}
          {note.finalSummary.reviewQuestions && note.finalSummary.reviewQuestions.length > 0 && (
            <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
              <div className="flex items-center gap-2 mb-4">
                <HelpCircle className="w-5 h-5 text-yellow-600" />
                <h3 className="font-bold text-lg text-yellow-900">❓ 복습 질문</h3>
              </div>
              <div className="space-y-2">
                {note.finalSummary.reviewQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white p-3 rounded-lg">
                    <span className="bg-yellow-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-gray-800">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 추가 학습 */}
          {note.finalSummary.furtherLearning && note.finalSummary.furtherLearning.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <Book className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-lg text-gray-900">📖 추가 학습 추천</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {note.finalSummary.furtherLearning.map((topic, i) => (
                  <span key={i} className="bg-white px-3 py-1 rounded-full text-gray-700 border border-gray-200">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== PDF 푸터 ===== */}
      <div className="print-only text-center text-gray-400 text-xs mt-12 pt-6 border-t border-gray-200">
        Generated by LectureNote AI • {new Date().toLocaleDateString('ko-KR')}
      </div>

      {/* ===== 프린트 스타일 ===== */}
      <style>{`
        @media print {
          /* 기본 설정 */
          body { 
            background: white !important; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* 숨길 요소 */
          .no-print { display: none !important; }
          
          /* 보여줄 요소 */
          .print-only { display: block !important; }
          
          /* 컨테이너 */
          .pdf-container { 
            max-width: 100% !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* 페이지 설정 */
          @page {
            size: A4;
            margin: 15mm 10mm;
          }
          
          /* 챕터는 새 페이지에서 시작 */
          .pdf-chapter {
            page-break-before: auto;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* 섹션 페이지 넘김 방지 */
          .pdf-section {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          /* 커버 페이지 */
          .pdf-cover {
            page-break-after: always;
          }
          
          /* 색상 보존 */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* 그라데이션 배경 대체 */
          .bg-gradient-to-r, .bg-gradient-to-br {
            background: #2563eb !important;
          }
          
          /* 둥근 모서리 약간 줄이기 */
          .rounded-2xl { border-radius: 12px !important; }
          .rounded-xl { border-radius: 8px !important; }
          
          /* 폰트 크기 조정 */
          .text-3xl, .text-4xl { font-size: 24pt !important; }
          .text-2xl { font-size: 18pt !important; }
          .text-xl { font-size: 14pt !important; }
          .text-lg { font-size: 12pt !important; }
          body, p, li { font-size: 10pt !important; }
        }
        
        /* 화면에서는 숨기기 */
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>
    </div>
  );
};
