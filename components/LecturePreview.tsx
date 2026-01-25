import React, { useState, useCallback, useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { VisualStructure } from './VisualStructure';
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
  onDownload: (type?: 'full' | 'summary') => void;
  onDownloadMarkdown?: () => void;
  onDeepDive: (chapterId: string) => void;
  onUpdateNote?: (updatedNote: LectureNote) => void;
  onSaveChapter?: (chapterId: string, updates: Partial<Chapter>) => Promise<void>;
  onRegenerateWithFeedback?: (chapterId: string, feedback: string) => Promise<void>;
  onGenerateFinalSummary?: () => Promise<void>;
  onContinueProcessing?: () => Promise<void>;
}

// ========== 텍스트 정제 유틸리티 ========== 
const refineKoreanText = (text: string): string => {
  let refined = text;
  refined = refined.replace(/\bgpt\b/gi, 'GPT');
  refined = refined.replace(/\bllm\b/gi, 'LLM');
  return refined;
};

// ========== Markdown Renderer ========== 
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const parseMarkdown = (text: string) => {
    let processedText = text
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/([^\n])(## )/g, '$1\n\n$2')
      .replace(/([^\n])(### )/g, '$1\n\n$2')
      .replace(/([^\n])(> )/g, '$1\n\n$2')
      .replace(/\n{3,}/g, '\n\n');

    const lines = processedText.split('\n');
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('## ')) {
        elements.push(
          <h3 key={i} className="text-xl md:text-2xl font-bold text-gray-900 mt-10 mb-5 first:mt-0 pb-3 border-b-2 border-indigo-100 tracking-tight leading-snug flex items-center gap-2">
            <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(3)) }} />
          </h3>
        );
        continue;
      }

      if (trimmedLine.startsWith('### ')) {
        elements.push(
          <h4 key={i} className="text-lg font-bold text-gray-800 mt-8 mb-3 tracking-tight">
            <span dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(4)) }} />
          </h4>
        );
        continue;
      }

      if (trimmedLine.startsWith('- ')) {
        elements.push(
          <div key={i} className="flex items-start gap-3 ml-2 mb-2">
            <span className="mt-3 w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0"></span>
            <span className="text-[17px] text-gray-800 leading-8 font-serif-read" dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine.slice(2)) }} />
          </div>
        );
        continue;
      }

      const numMatch = trimmedLine.match(/^(\d+)\.\s(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={i} className="flex items-start gap-3 ml-2 mb-2">
            <span className="text-indigo-600 font-bold text-sm min-w-[24px] mt-1">{numMatch[1]}.</span>
            <span className="text-[17px] text-gray-800 leading-8 font-serif-read" dangerouslySetInnerHTML={{ __html: parseBold(numMatch[2]) }} />
          </div>
        );
        continue;
      }

      if (trimmedLine.startsWith('>')) {
        const quoteContent = trimmedLine.replace(/^>+\s?/, '');
        const timestampMatch = quoteContent.match(/\\[(\d{1,2}:\d{2}(?::\d{2})?)\\]/);
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
                  <p className="text-gray-900 font-medium text-lg leading-relaxed font-serif-read">"{quoteText}"</p>
                </div>
              </div>
              {commentary && (
                <div className="pl-6 border-l-2 border-indigo-100 ml-4 mt-3">
                  <p className="text-gray-600 text-[15px] leading-7 font-serif-read" dangerouslySetInnerHTML={{ __html: parseBold(commentary) }} />
                </div>
              )}
            </div>
          );
          continue;
        }

        elements.push(
          <div key={i} className="my-5 bg-gray-50 border-l-4 border-indigo-300 pl-5 py-3 rounded-r-lg">
            <p className="text-gray-700 text-[16px] leading-7 italic font-serif-read" dangerouslySetInnerHTML={{ __html: parseBold(quoteContent) }} />
          </div>
        );
        continue;
      }

      if (trimmedLine === '') {
        elements.push(<div key={i} className="h-3" />);
        continue;
      }

      elements.push(
        <p key={i} className="text-[17px] text-gray-800 leading-8 mb-4 tracking-[-0.01em] font-serif-read break-keep" dangerouslySetInnerHTML={{ __html: parseBold(trimmedLine) }} />
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
        
        .font-serif-read { 
          font-family: 'Noto Serif KR', serif; 
          line-height: 1.85; 
          letter-spacing: -0.01em;
          word-break: keep-all;
        }

        @media screen {
          .pdf-container {
            background-color: white;
            box-shadow: 
              0 4px 6px -1px rgba(0, 0, 0, 0.05), 
              0 2px 4px -1px rgba(0, 0, 0, 0.03),
              0 20px 25px -5px rgba(0, 0, 0, 0.05), 
              0 10px 10px -5px rgba(0, 0, 0, 0.02);
          }
        }
      `}</style>
      <div className="prose max-w-none">
        {parseMarkdown(content)}
      </div>
    </div>
  );
};

// ========== Chapter Card ========== 
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
  const [isDirty, setIsDirty] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleSaveEdit = () => {
    if (onSaveEdit) {
      onSaveEdit(chapter.id, { narrative: editedNote, detailedNote: editedNote });
    }
    setIsDirty(false);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (isDirty) {
        if (!confirm("저장되지 않은 변경사항이 있습니다. 취소하시겠습니까?")) {
            return;
        }
    }
    setEditedNote(chapter.detailedNote || chapter.narrative || '');
    setIsDirty(false);
    setIsEditing(false);
  };
  
  const handleNoteChange = (val: string | undefined) => {
      setEditedNote(val || '');
      setIsDirty(true);
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
    <div className="pdf-chapter rounded-2xl border border-gray-200 bg-white overflow-hidden mb-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Chapter Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full">
                Chapter {chapterNumber}
              </span>
              {chapter.timeRange && (
                <span className="text-blue-100 text-sm font-mono bg-blue-800/30 px-2 py-0.5 rounded">
                  {chapter.timeRange}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight">{chapter.title}</h2>
          </div>

          <div className="no-print flex items-center gap-2 ml-4">
            {isCompleted && (
              <button
                onClick={onDeepDive}
                className="bg-white text-blue-600 text-sm px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-50 transition-all shadow-lg"
              >
                <Sparkles className="w-4 h-4" /> 상세 분석
              </button>
            )}

            {isCompleted && onRegenerateWithFeedback && !isEditing && !showFeedback && (
              <button
                onClick={() => setShowFeedback(true)}
                className="bg-white/10 text-white text-sm px-3 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-white/20 transition-all border border-white/20"
              >
                <MessageSquare className="w-4 h-4" /> 피드백
              </button>
            )}

            {isProcessing && (
              <div className="flex items-center gap-2 text-white/90 text-sm font-bold animate-pulse bg-white/10 px-3 py-2 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" /> 분석 중...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chapter Content */}
      <div className="p-6 md:p-8">
        {/* 재생성 로딩 */}
        {isRegenerating && (
          <div className="mb-6 bg-blue-50 p-4 rounded-xl flex items-center justify-center gap-3 text-blue-700 border border-blue-200 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-bold">피드백 반영 중...</span>
          </div>
        )}

        {/* 피드백 폼 */}
        {showFeedback && (
          <div className="mb-8 space-y-3 bg-orange-50 p-5 rounded-xl border border-orange-200 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-orange-900 font-bold mb-1">챕터 재생성 요청</h4>
                <p className="text-sm text-orange-800 leading-relaxed">
                  수정이 필요한 부분을 구체적으로 적어주세요. AI가 내용을 다시 작성합니다.
                </p>
              </div>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="예: 예시를 더 추가해줘, 말투를 바꿔줘..."
              className="w-full h-24 p-3 bg-white border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-y text-sm mt-2"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowFeedback(false); setFeedback(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRegenerateWithFeedback}
                disabled={!feedback.trim() || isRegenerating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? '요청 중...' : '재생성 시작'}
              </button>
            </div>
          </div>
        )}

        {!isCompleted ? (
          <div className="text-gray-500 italic py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
            {chapter.summary || "내용을 분석하고 있습니다..."}
          </div>
        ) : (
          <div className="space-y-8">
            {/* 📖 핵심 내용 */}
            {(chapter.narrative || chapter.detailedNote || isEditing) && (
              <div className="bg-slate-50/50 rounded-xl p-1 border border-slate-100">
                <div className="flex items-center justify-between px-4 py-3 bg-white rounded-t-xl border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-slate-600" />
                    <h3 className="font-bold text-lg text-slate-800">Note</h3>
                  </div>
                  <div className="no-print">
                    {onSaveEdit && !isEditing && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 font-bold px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow"
                      >
                        <Edit3 className="w-4 h-4" /> Edit Note
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="p-4 space-y-4 bg-white rounded-b-xl">
                    <div data-color-mode="light">
                      <MDEditor
                        value={editedNote}
                        onChange={handleNoteChange}
                        height={500}
                        preview="edit"
                        className="shadow-inner"
                      />
                    </div>
                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
                      >
                        <Save className="w-4 h-4" /> 저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-6 md:p-8 rounded-b-xl">
                    <MarkdownContent content={chapter.narrative || chapter.detailedNote || ''} />
                  </div>
                )}
              </div>
            )}

            {/* Visual Structure (구조화된 시각 요소) */}
            {chapter.visualStructure && chapter.visualStructure.items && chapter.visualStructure.items.length > 0 && (
              <div className="my-4">
                <VisualStructure data={chapter.visualStructure} />
              </div>
            )}

            {/* 하단 2단 그리드 (포인트, 팁) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 💡 핵심 결론 (Key Takeaways) */}
                {(chapter.keyTakeaways || chapter.keyPoints) && (chapter.keyTakeaways || chapter.keyPoints || []).length > 0 && (
                <div className="bg-amber-50/50 rounded-xl border border-amber-100 overflow-hidden">
                    <div className="bg-amber-100/50 px-5 py-3 border-b border-amber-100 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <h3 className="font-bold text-amber-900">
                            {chapter.keyTakeaways ? 'Key Takeaways' : 'Key Points'}
                        </h3>
                    </div>
                    <div className="p-5 space-y-2">
                    {(chapter.keyTakeaways || chapter.keyPoints || []).map((point, i) => (
                        <div key={i} className="flex items-start gap-3">
                        <span className="text-amber-500 font-bold text-sm mt-0.5">•</span>
                        <p className="text-sm text-slate-700 leading-relaxed font-serif-read">{point}</p>
                        </div>
                    ))}
                    </div>
                </div>
                )}

                {/* ✅ 행동 지침 (Actionable Items) */}
                {(chapter.actionableItems || chapter.practicalTips) && (chapter.actionableItems || chapter.practicalTips || []).length > 0 && (
                <div className="bg-emerald-50/50 rounded-xl border border-emerald-100 overflow-hidden">
                    <div className="bg-emerald-100/50 px-5 py-3 border-b border-emerald-100 flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                        <h3 className="font-bold text-emerald-900">
                            {chapter.actionableItems ? 'Actionable Items' : 'Practical Tips'}
                        </h3>
                    </div>
                    <div className="p-5 space-y-2">
                    {(chapter.actionableItems || chapter.practicalTips || []).map((tip, i) => (
                        <div key={i} className="flex items-start gap-3">
                        <ChevronRight className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-700 leading-relaxed font-serif-read">{tip}</p>
                        </div>
                    ))}
                    </div>
                </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ========== Table of Contents Component ========== 
const TableOfContents: React.FC<{ note: LectureNote }> = ({ note }) => {
  const [activeId, setActiveId] = useState<string>('');
  const chapters = note.chapters || [];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id.replace('chapter-', '').replace('section-', ''));
          }
        });
      },
      {
        rootMargin: '-20% 0px -35% 0px',
        threshold: 0.1
      }
    );

    chapters.forEach((ch) => {
      const element = document.getElementById(`chapter-${ch.id}`);
      if (element) observer.observe(element);
    });

    // Summary & Glossary observation
    ['summary', 'glossary'].forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [chapters, note.finalSummary]);

  const scrollToId = (id: string, isSection = false) => {
    const element = document.getElementById(isSection ? `section-${id}` : `chapter-${id}`);
    if (element) {
      const headerOffset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="hidden lg:block sticky top-24 h-[calc(100vh-8rem)] overflow-y-auto pl-6 border-l border-gray-100 no-print w-64">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-2">Table of Contents</h4>
      <ul className="space-y-1">
        {chapters.map((ch, i) => {
          const isActive = activeId === ch.id;
          return (
            <li key={ch.id}>
              <button
                onClick={() => scrollToId(ch.id)}
                className={`text-sm text-left w-full px-2 py-1.5 rounded-lg transition-all duration-200 group flex items-start gap-2 ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : ch.status === 'completed' 
                      ? 'text-slate-600 hover:bg-slate-50 hover:text-blue-600' 
                      : 'text-slate-300'
                }`}
              >
                <span className={`font-mono text-xs mt-0.5 opacity-50 group-hover:opacity-100 ${isActive ? 'text-blue-500 opacity-100' : ''}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="truncate leading-tight">{ch.title}</span>
              </button>
            </li>
          );
        })}

        {/* Extra Sections */}
        {note.finalSummary && (
            <>
                <li className="pt-4 pb-1 px-2 border-t border-gray-50">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ending</span>
                </li>
                <li>
                    <button
                        onClick={() => scrollToId('summary', true)}
                        className={`text-sm text-left w-full px-2 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-2 ${activeId === 'summary' ? 'bg-purple-50 text-purple-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Award className="w-3.5 h-3.5 opacity-50" />
                        Final Summary
                    </button>
                </li>
                {note.finalSummary.globalGlossary && (
                    <li>
                        <button
                            onClick={() => scrollToId('glossary', true)}
                            className={`text-sm text-left w-full px-2 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-2 ${activeId === 'glossary' ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Book className="w-3.5 h-3.5 opacity-50" />
                            Glossary
                        </button>
                    </li>
                )}
            </>
        )}
      </ul>
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
  onSaveChapter,
  onRegenerateWithFeedback,
  onGenerateFinalSummary,
  onContinueProcessing
}) => {
  const completedCount = note.chapters?.filter(c => c.status === 'completed').length || 0;
  const totalChapters = note.chapters?.length || 1;
  const progressPercent = (completedCount / totalChapters) * 100;

  // 챕터 편집 저장
  const handleChapterEdit = async (chapterId: string, updates: Partial<Chapter>) => {
    // 1. Optimistic Update (Local State)
    if (onUpdateNote) {
      const updatedChapters = note.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, ...updates } : ch
      );
      onUpdateNote({
        ...note,
        chapters: updatedChapters
      });
    }

    // 2. Server Save
    if (onSaveChapter) {
        await onSaveChapter(chapterId, updates);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-16 px-4 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 items-start relative">
        
        {/* Left: Main Content */}
        <div className="pdf-container min-w-0 w-full lg:max-w-4xl">
          {/* ===== COVER PAGE (첫 페이지) ===== */}
          <div className="pdf-cover bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 md:p-12 text-white mb-12 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full -mr-20 -mt-20 blur-3xl mix-blend-overlay" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full -ml-20 -mb-20 blur-3xl mix-blend-overlay" />

            <div className="relative z-10">
              {/* Title */}
              <div className="mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-blue-200 text-xs font-bold uppercase tracking-widest border border-white/10 mb-6 backdrop-blur-sm">
                  <Sparkles className="w-3 h-3" /> AI Lecture Note
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">
                  {note.title}
                </h1>
                
                <div className="flex flex-col gap-3 text-slate-400">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-[1px] bg-slate-600"></span>
                        {note.author ? (
                            <span className="font-medium text-slate-300">{note.author}</span>
                        ) : (
                            <span className="font-medium text-slate-500 italic">Add Author Info...</span>
                        )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                        {note.tags && note.tags.length > 0 ? (
                            note.tags.map(t => (
                                <span key={t} className="text-sm px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">
                                    #{t}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm px-2.5 py-1 rounded-md border border-white/5 text-slate-600 italic">
                                # Add Tags...
                            </span>
                        )}
                    </div>
                </div>
              </div>

              {/* Progress (화면에서만) */}
              <div className="no-print flex flex-wrap items-center gap-4 mt-12 pt-8 border-t border-white/10">
                <div className="flex items-center gap-4 mr-auto">
                  <div className="relative h-2 w-32 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-400">
                    <span className="text-white font-bold">{completedCount}</span> / {totalChapters} chapters
                  </span>
                </div>

                <div className="flex gap-2">
                    <button
                    onClick={() => onDownload('full')}
                    disabled={completedCount === 0}
                    className={`bg-white text-slate-900 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm transition-all shadow-lg shadow-black/20 ${ completedCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 hover:scale-105 active:scale-95'}`}
                    >
                    <FileDown className="w-4 h-4" /> Export PDF
                    </button>

                    {onDownloadMarkdown && (
                    <button
                        onClick={onDownloadMarkdown}
                        disabled={completedCount === 0}
                        className={`bg-white/10 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm backdrop-blur-sm transition-all border border-white/10 ${ completedCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20'}`}
                    >
                        <FileText className="w-4 h-4" /> MD
                    </button>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* ===== 강의 개요 ===== */}
          <div className="bg-white p-8 md:p-10 rounded-3xl border border-slate-100 mb-12 pdf-section shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-t-3xl opacity-50"></div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Overview</h2>
            </div>
            {(!note.overview || note.overview === "Loading overview..." || note.overview === "") ? (
                <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-100 rounded w-full"></div>
                    <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                    <div className="text-sm text-slate-400 mt-2 font-mono">Generating overview...</div>
                </div>
            ) : (
                <p className="text-lg text-slate-600 leading-relaxed font-serif-read">{note.overview}</p>
            )}
          </div>

          {/* ===== 챕터들 ===== */}
          <div className="space-y-12">
            <div className="flex items-center justify-between mb-6 no-print pl-2 pr-2">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-400" />
                <h2 className="text-xl font-bold text-slate-700">Timeline Analysis</h2>
              </div>

              {/* Continue All 버튼 - 미완료 챕터가 있고, 현재 처리 중이 아닐 때만 표시 */}
              {onContinueProcessing && completedCount < totalChapters && !note.chapters?.some(c => c.status === 'processing') && (
                <button
                  onClick={onContinueProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  Continue All ({totalChapters - completedCount} remaining)
                </button>
              )}
            </div>

            {note.chapters?.map((chapter, index) => (
              <div key={chapter.id} id={`chapter-${chapter.id}`} className="scroll-mt-32">
                <ChapterCard
                  chapter={chapter}
                  chapterNumber={index + 1}
                  onDeepDive={() => onDeepDive(chapter.id)}
                  onSaveEdit={onUpdateNote ? handleChapterEdit : undefined}
                  onRegenerateWithFeedback={onRegenerateWithFeedback}
                />
              </div>
            ))}
          </div>

          {/* ===== 전체 마무리 버튼 (모든 챕터 완료 시) ===== */}
          {completedCount === totalChapters && !note.finalSummary && onGenerateFinalSummary && (
            <div className="no-print my-16 text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <button
                onClick={onGenerateFinalSummary}
                className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-105 flex items-center gap-3 mx-auto"
              >
                <Award className="w-6 h-6 text-yellow-400" />
                Generate Final Summary
              </button>
              <p className="text-sm text-slate-500 mt-4 font-medium">
                모든 분석이 완료되었습니다. 전체 내용을 아우르는 인사이트를 생성해보세요.
              </p>
            </div>
          )}

          {/* ===== 전체 마무리 (Final Summary) ===== */}
          {note.finalSummary && (
            <div className="mt-20 space-y-8 scroll-mt-32" id="section-summary">
              <div className="bg-slate-900 text-white rounded-3xl p-10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                    <Award className="w-8 h-8 text-yellow-400" />
                    <h2 className="text-2xl font-black">Final Summary</h2>
                    </div>
                    {note.finalSummary.oneSentenceSummary && (
                    <p className="text-xl md:text-2xl italic text-slate-200 font-serif-read leading-relaxed">
                        "{note.finalSummary.oneSentenceSummary}"
                    </p>
                    )}
                </div>
              </div>

              {/* 핵심 인사이트 */}
              {note.finalSummary.coreInsights && note.finalSummary.coreInsights.length > 0 && (
                <div className="bg-purple-50/50 rounded-3xl p-8 border border-purple-100">
                  <div className="flex items-center gap-3 mb-6">
                    <Lightbulb className="w-6 h-6 text-purple-600" />
                    <h3 className="font-bold text-xl text-purple-900">Core Insights</h3>
                  </div>
                  <div className="grid gap-4">
                    {note.finalSummary.coreInsights.map((ins, i) => {
                      // Handle both formats: string or {insight: string, relatedChapters?: string}
                      const insightText = typeof ins === 'string' ? ins : ins.insight;
                      const relatedChapters = typeof ins === 'string' ? undefined : ins.relatedChapters;
                      return (
                        <div key={i} className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
                          <p className="font-medium text-slate-800 text-lg leading-relaxed">{insightText}</p>
                          {relatedChapters && (
                            <p className="text-sm text-purple-500 mt-3 font-medium bg-purple-50 inline-block px-3 py-1 rounded-lg">
                              Ref: {relatedChapters}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 하단 2단 그리드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 실천 체크리스트 */}
                {note.finalSummary.actionChecklist && note.finalSummary.actionChecklist.length > 0 && (
                    <div className="bg-emerald-50/50 rounded-3xl p-8 border border-emerald-100">
                    <div className="flex items-center gap-3 mb-6">
                        <CheckSquare className="w-6 h-6 text-emerald-600" />
                        <h3 className="font-bold text-xl text-emerald-900">Action Plan</h3>
                    </div>
                    <div className="space-y-3">
                        {note.finalSummary.actionChecklist.map((item, i) => {
                        // Handle both formats: string or {action: string, priority?: string, timeline?: string}
                        const actionText = typeof item === 'string' ? item : item.action;
                        const priority = typeof item === 'string' ? undefined : item.priority;
                        const timeline = typeof item === 'string' ? undefined : item.timeline;
                        return (
                        <div key={i} className="flex items-start gap-4 bg-white p-4 rounded-xl shadow-sm border border-emerald-50">
                            <div className="mt-1 w-5 h-5 rounded-full border-2 border-emerald-200 flex items-center justify-center flex-shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"></div>
                            </div>
                            <div className="flex-1">
                            <p className="font-bold text-slate-800">{actionText}</p>
                            {(priority || timeline) && (
                            <div className="flex gap-2 mt-2 text-xs">
                                {priority && (
                                <span className={`px-2 py-1 rounded-md font-bold ${priority === '높음' ? 'bg-red-50 text-red-600' :
                                    priority === '중간' ? 'bg-yellow-50 text-yellow-600' :
                                    'bg-slate-100 text-slate-500'
                                    }`}>{priority}</span>
                                )}
                                {timeline && (
                                <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-bold">{timeline}</span>
                                )}
                            </div>
                            )}
                            </div>
                        </div>
                        );
                        })}
                    </div>
                    </div>
                )}

                {/* 복습 질문 */}
                {note.finalSummary.reviewQuestions && note.finalSummary.reviewQuestions.length > 0 && (
                    <div className="bg-yellow-50/50 rounded-3xl p-8 border border-yellow-100">
                    <div className="flex items-center gap-3 mb-6">
                        <HelpCircle className="w-6 h-6 text-yellow-600" />
                        <h3 className="font-bold text-xl text-yellow-900">Review Quiz</h3>
                    </div>
                    <div className="space-y-3">
                        {note.finalSummary.reviewQuestions.map((q, i) => (
                        <div key={i} className="flex gap-4 bg-white p-5 rounded-xl shadow-sm border border-yellow-50 hover:bg-yellow-50/30 transition-colors cursor-pointer group">
                            <span className="text-yellow-500 font-black text-lg flex-shrink-0 group-hover:scale-110 transition-transform">Q{i + 1}.</span>
                            <p className="text-slate-700 font-medium leading-relaxed">{q}</p>
                        </div>
                        ))}
                    </div>
                    </div>
                )}
              </div>

              {/* 통합 용어집 (Global Glossary) */}
              {note.finalSummary.globalGlossary && note.finalSummary.globalGlossary.length > 0 && (
                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 scroll-mt-32" id="section-glossary">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-200 rounded-lg">
                        <Book className="w-6 h-6 text-slate-600" />
                    </div>
                    <h3 className="font-bold text-xl text-slate-900">Global Glossary</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {note.finalSummary.globalGlossary.map((term, i) => (
                      <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                        <h4 className="font-bold text-indigo-700 mb-2 text-lg">{term.term}</h4>
                        <p className="text-sm text-slate-600 leading-relaxed font-serif-read">{term.definition}</p>
                        {term.context && (
                            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50 italic">
                                Context: {term.context}
                            </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 추가 학습 */}
              {note.finalSummary.furtherLearning && note.finalSummary.furtherLearning.length > 0 && (
                <div className="bg-slate-50/50 rounded-3xl p-8 border border-slate-100">
                  <div className="flex items-center gap-3 mb-6">
                    <BookOpen className="w-5 h-5 text-slate-400" />
                    <h3 className="font-bold text-lg text-slate-700">Recommended Learning</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {note.finalSummary.furtherLearning.map((topic, i) => (
                      <span key={i} className="bg-white px-4 py-2 rounded-full text-slate-600 border border-slate-200 shadow-sm font-medium hover:bg-slate-50 cursor-default transition-colors">
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
        </div>

        {/* Right: Sticky TOC */}
        <TableOfContents note={note} />
        
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
            width: 100% !important;
          }
          
          /* 페이지 설정 */
          @page {
            size: A4;
            margin: 15mm 10mm;
          }
          
          /* 챕터는 새 페이지에서 시작 */
          .pdf-chapter {
            page-break-before: always;
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          
          /* 섹션 페이지 넘김 방지 */
          .pdf-section {
            page-break-inside: avoid;
            break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid #eee !important;
          }
          
          /* 커버 페이지 */
          .pdf-cover {
            page-break-after: always;
            height: 100vh !important;
            margin-bottom: 0 !important;
            border-radius: 0 !important;
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
          
          /* 둥근 모서리 제거 */
          .rounded-3xl, .rounded-2xl, .rounded-xl { border-radius: 0 !important; }
          
          /* 폰트 크기 조정 */
          .text-6xl { font-size: 32pt !important; }
          .text-5xl { font-size: 28pt !important; }
          .text-4xl { font-size: 24pt !important; }
          .text-3xl { font-size: 20pt !important; }
          .text-2xl { font-size: 16pt !important; }
          .text-xl { font-size: 14pt !important; }
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