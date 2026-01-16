import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Book, BookOpen, Layout, Loader2, FileText,
  ChevronRight, RefreshCw, Download, Upload
} from 'lucide-react';
import { LecturePreview } from './components/LecturePreview';

// 타입 정의 (서버 응답 맞춤)
interface LectureSummary {
  id: string;
  title: string;
  created_at: string;
}

interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime: string;
  endTime: string;
  // 서버에서는 content로 묶어서 보내거나, detailed_note 컬럼에 JSON으로 저장됨
  // 클라이언트에서 flatten 과정을 거칠 예정
  narrative?: string;
  quotesWithTimeline?: any[];
  keyTerms?: any[];
  keyPoints?: string[];
  [key: string]: any;
}

interface LectureDetail {
  id: string;
  title: string;
  overview?: string; // Initial Scan에서 저장 안했을 수도 있음 (스키마 확인 필요) -> raw_text만 저장하고 chapters만 저장했음 (수정 필요할 수도)
  // ** 중요: 서버 코드 809에서 lectures 테이블에 overview 컬럼 없음. 
  // 그러나 InitialScanSchema에는 overview가 있음. 
  // 일단 title만 사용하거나, 첫 번째 챕터 로딩 전에는 overview가 없을 수 있음.
  chapters: Chapter[];
}

const App: React.FC = () => {
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lectureData, setLectureData] = useState<LectureDetail | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 강의 목록 로드
  const fetchLectures = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/lectures');
      if (!res.ok) return;
      const data = await res.json();
      setLectures(data || []);
    } catch (e) {
      console.error("Failed to fetch lectures", e);
    }
  };

  useEffect(() => {
    fetchLectures();
  }, []);

  // 2. 선택된 강의 폴링 (상세 조회 & 자동 갱신)
  useEffect(() => {
    if (!selectedId) return;

    let intervalId: any;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/lectures/${selectedId}`);
        if (!res.ok) return;
        const data = await res.json();

        // 데이터 가공: content JSON 풀기
        const processedChapters = (data.chapters || []).map((ch: any) => {
          let contentObj = ch.content || {};
          // 만약 content가 null이면 (아직 deep dive 전)
          return {
            ...ch,
            ...contentObj, // narrative, quotesWithTimeline 등이 여기 들어있음
            status: ch.status // DB status가 우선
          };
        });

        // LecturePreview가 기대하는 형태로 가공
        setLectureData({
          ...data,
          chapters: processedChapters,
          overview: "" // Overrview는 현재 DB에 없으므로 공란 or AI가 initial scan json을 어딘가 저장했어야 함 (TODO)
        });

        // 모든 챕터가 완료되었는지 확인 (완료 안됬으면 폴링 계속)
        const allDone = processedChapters.every((c: any) => c.status === 'completed' || c.status === 'error');
        if (allDone && intervalId) {
          // clearInterval(intervalId); // 완료되어도 계속 폴링? (혹시 재생성 등의 변화가 있을 수 있으니 놔둘 수도)
          // 하지만 너무 잦은 요청 방지 위해 완료되면 interval 늘리거나 멈춤
        }
      } catch (e) {
        console.error("Failed to fetch detail", e);
      }
    };

    fetchDetail(); // 즉시 실행
    intervalId = setInterval(fetchDetail, 3000); // 3초마다 갱신

    return () => clearInterval(intervalId);
  }, [selectedId]);

  // 3. 새 강의 생성 핸들러
  const handleCreate = async () => {
    if (!inputText.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('http://localhost:3000/api/lectures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: inputText })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      await fetchLectures(); // 목록 갱신
      setSelectedId(data.id);
      setIsCreating(false);
      setInputText('');
    } catch (e: any) {
      alert("강의 생성 실패: " + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setInputText(text);
    } catch (err) {
      alert("파일을 읽는 중 오류가 발생했습니다.");
    }
  };

  // 5. PDF 내보내기 핸들러
  const handleExportPDF = async () => {
    if (!selectedId) return;
    try {
      window.open(`http://localhost:3000/api/lectures/${selectedId}/pdf`, '_blank');
    } catch (e) {
      alert("다운로드 실패");
    }
  };

  return (
    <div className="flex h-screen w-full bg-white text-gray-900 font-sans overflow-hidden">

      {/* Sidebar */}
      <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-200">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
            <Book className="w-6 h-6" />
            LectureNote AI
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3 mt-2">
            Library
          </div>
          {lectures.map(lec => (
            <button
              key={lec.id}
              onClick={() => { setSelectedId(lec.id); setIsCreating(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                ${selectedId === lec.id && !isCreating
                  ? 'bg-white shadow-sm text-indigo-700 border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="truncate">{lec.title || 'Untitled Lecture'}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => { setIsCreating(true); setSelectedId(null); }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium transition-all shadow-sm hover:shadow active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Lecture
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">

        {/* Create View */}
        {isCreating && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 bg-gray-50/50">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                  <Layout className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">새 강의 분석 시작</h2>
                  <p className="text-gray-500">VTT 파일 내용이나 텍스트를 붙여넣으세요.</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold text-gray-700">Transcript Content</label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload VTT File
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".vtt,.txt"
                />
              </div>

              <textarea
                className="w-full h-64 p-4 border border-gray-200 rounded-xl mb-6 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none font-mono text-sm bg-gray-50"
                placeholder="WEBVTT..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!inputText.trim() || isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      분석 시작 중...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      분석 시작
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detail View */}
        {!isCreating && selectedId && lectureData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 z-10">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-900 truncate max-w-xl">
                  {lectureData.title}
                </h2>
                {/* Progress Badge */}
                <div className="flex items-center gap-2">
                  {(lectureData.chapters || []).some(c => c.status === 'processing') && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </span>
                  )}
                  <span className="text-xs text-gray-400 font-medium">
                    {(lectureData.chapters || []).filter(c => c.status === 'completed').length} / {(lectureData.chapters || []).length} Completed
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <Download className="w-4 h-4" />
                  PDF Export
                </button>
              </div>
            </div>

            {/* Content Area (Using LecturePreview but passing prop) */}
            <div className="flex-1 overflow-auto bg-gray-50/30">
              {/* LecturePreview Component Integration */}
              {/* NOTE: LecturePreview expects 'lectureNote' prop. We construct it from lectureData */}
              <LecturePreview
                note={{
                  title: lectureData.title,
                  overview: lectureData.overview || "Loading overview...",
                  chapters: (lectureData.chapters || []).map(c => ({
                    ...c,
                    // timeRange 필드 매핑
                    timeRange: c.startTime && c.endTime ? `${c.startTime} ~ ${c.endTime}` : undefined,
                    // If processing, show placeholder
                    narrative: c.status === 'completed' ? c.narrative : (c.status === 'processing' ? '...\n\nAnalyzing this chapter...' : 'Pending analysis...')
                  })) as any,
                  allGlossary: [], // TODO: Collect from chapters
                  allActionItems: [],
                  allWarnings: [],
                  qualityReport: undefined
                }}
                onDownload={handleExportPDF}
                onDeepDive={(chapterId) => {
                  console.log('Deep dive requested for:', chapterId);
                  // TODO: Implement deep dive trigger if needed
                }}
                onRegenerateWithFeedback={async (chId, feedback) => {
                  try {
                    await fetch(`http://localhost:3000/api/chapters/${chId}/regenerate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedback })
                    });
                  } catch (e) {
                    alert("재생성 요청 실패");
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isCreating && !selectedId && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <BookOpen className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a lecture from the sidebar</p>
            <p className="text-sm">or create a new one to get started</p>
          </div>
        )}

      </div>
    </div>
  );
};

// Simple Icon Wrapper
const SparklesIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M9 3v4" />
    <path d="M3 5h4" />
    <path d="M3 9h4" />
  </svg>
);

export default App;
