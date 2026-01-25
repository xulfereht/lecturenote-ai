import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Book, BookOpen, Layout, Loader2, FileText,
  ChevronRight, RefreshCw, Download, Upload, Settings, CheckCircle, Info
} from 'lucide-react';
import { LecturePreview } from './components/LecturePreview';
import { SettingsTab } from './components/SettingsTab';
import { CorrectionReportModal } from './components/CorrectionReportModal';
import { MetadataModal } from './components/MetadataModal';
import { useSettings } from './hooks/useSettings';
import { CorrectionStats, FinalSummary } from './types';

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
  narrative?: string;
  quotesWithTimeline?: any[];
  keyTerms?: any[];
  keyPoints?: string[];
  keyTakeaways?: string[];
  actionableItems?: string[];
  visualStructure?: {
    type: 'process' | 'comparison' | 'hierarchy' | 'timeline';
    title: string;
    items: Array<{ label: string; description?: string; subItems?: string[] }>;
  };
  mermaidCode?: string; // deprecated
  [key: string]: any;
}

interface LectureDetail {
  id: string;
  title: string;
  overview?: string; 
  chapters: Chapter[];
  correction_stats?: CorrectionStats;
  author?: string;
  source_url?: string;
  tags?: string[];
  memo?: string;
  finalSummary?: FinalSummary;
}

const App: React.FC = () => {
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lectureData, setLectureData] = useState<LectureDetail | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isShowingSettings, setIsShowingSettings] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [showPdfDropdown, setShowPdfDropdown] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<{ message: string, active: boolean }>({ message: '', active: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfDropdownRef = useRef<HTMLDivElement>(null);

  // AI Settings hook
  const { settings, hasApiKey } = useSettings();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pdfDropdownRef.current && !pdfDropdownRef.current.contains(event.target as Node)) {
        setShowPdfDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // 2. SSE 연결 및 데이터 폴링
  useEffect(() => {
    if (!selectedId) {
        setStreamingStatus({ message: '', active: false });
        return;
    }

    // 초기 로딩
    const fetchDetail = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/lectures/${selectedId}`);
        if (!res.ok) return;
        const data = await res.json();

        const processedChapters = (data.chapters || []).map((ch: any) => {
          let contentObj = ch.content || {};
          return {
            ...ch,
            ...contentObj,
            status: ch.status
          };
        });

        // Overview fallback: if overview column is empty or contains placeholder, try to get from finalSummary
        let overview = data.overview || "";
        if (overview === "Loading overview..." || overview === "Generating overview...") {
            overview = data.finalSummary?.oneSentenceSummary || "";
        }

        setLectureData({
          ...data,
          chapters: processedChapters,
          overview: overview
        });
      } catch (e) {
        console.error("Failed to fetch detail", e);
      }
    };

    fetchDetail();

    // SSE 연결
    const eventSource = new EventSource(`http://localhost:3000/api/lectures/${selectedId}/events`);

    eventSource.onopen = () => {
        console.log("SSE Connected");
    };

    eventSource.onmessage = (event) => {
        // 기본 메시지 핸들러 (디버깅용)
        // console.log("SSE Message:", event.data);
    };

    // 커스텀 이벤트 리스너
    eventSource.addEventListener('status', (e: any) => {
        const data = JSON.parse(e.data);
        setStreamingStatus({ message: data.message, active: true });
    });

    eventSource.addEventListener('progress', (e: any) => {
        const data = JSON.parse(e.data);
        setStreamingStatus({ message: data.message, active: true });
    });

    eventSource.addEventListener('chapter_complete', (e: any) => {
        const data = JSON.parse(e.data);
        setStreamingStatus({ message: `Completed: ${data.title}`, active: true });
        fetchDetail(); // 데이터 갱신
    });

    eventSource.addEventListener('chapter_error', (e: any) => {
        const data = JSON.parse(e.data);
        setStreamingStatus({ message: `Error in chapter: ${data.message}`, active: true });
        fetchDetail(); // 상태 갱신
    });

    eventSource.addEventListener('final_summary_complete', (e: any) => {
        setStreamingStatus({ message: 'Final Summary completed!', active: true });
        fetchDetail(); // Refresh to get the new final summary
        setTimeout(() => setStreamingStatus({ message: '', active: false }), 3000);
    });

    eventSource.addEventListener('complete', (e: any) => {
        setStreamingStatus({ message: 'All analysis finished', active: false });
        fetchDetail();
        // 3초 후 메시지 사라짐
        setTimeout(() => setStreamingStatus({ message: '', active: false }), 3000);
        eventSource.close();
    });

    eventSource.addEventListener('error', (e: any) => {
        // SSE 에러가 아니라 서버가 보낸 'error' 이벤트
        if (e.data) {
            const data = JSON.parse(e.data);
            console.error("Server reported error:", data.message);
            setStreamingStatus({ message: `Error: ${data.message}`, active: false });
        }
    });

    eventSource.onerror = (err) => {
        // 네트워크 에러 등
        console.log("SSE Connection closed or failed", err);
        eventSource.close();
        setStreamingStatus(prev => ({ ...prev, active: false }));
    };

    return () => {
        eventSource.close();
    };
  }, [selectedId]);

  // 3. 새 강의 생성 핸들러
  const handleCreate = async () => {
    if (!inputText.trim()) return;

    // Check for API Key before submission
    if (!hasApiKey) {
      alert("API Key is required. Please configure it in Settings.");
      setIsCreating(false);
      setIsShowingSettings(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // Pass settings to the server for preprocessing
      const requestBody = {
        transcript: inputText,
        settings: {
          apiKey: settings.apiKey,
          model: settings.model,
          llmCorrectionEnabled: settings.llmCorrectionEnabled,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens
        }
      };

      const res = await fetch('http://localhost:3000/api/lectures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
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
  const handleExportPDF = async (type: 'full' | 'summary' = 'full') => {
    if (!selectedId) return;
    try {
      window.open(`http://localhost:3000/api/lectures/${selectedId}/pdf?type=${type}`, '_blank');
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
            <div key={lec.id} className="group relative">
            <button
              onClick={() => { setSelectedId(lec.id); setIsCreating(false); setIsShowingSettings(false); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 pr-8
                ${selectedId === lec.id && !isCreating && !isShowingSettings
                  ? 'bg-white shadow-sm text-indigo-700 border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="truncate">{lec.title || 'Untitled Lecture'}</span>
            </button>
            <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm('Really delete this lecture?')) {
                    await fetch(`http://localhost:3000/api/lectures/${lec.id}`, { method: 'DELETE' });
                    fetchLectures();
                    if (selectedId === lec.id) setSelectedId(null);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={() => { setIsCreating(true); setSelectedId(null); setIsShowingSettings(false); }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium transition-all shadow-sm hover:shadow active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Lecture
          </button>
          <button
            onClick={() => { setIsShowingSettings(true); setIsCreating(false); setSelectedId(null); }}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${
              isShowingSettings
                ? 'bg-gray-200 text-gray-900'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
            {!hasApiKey && (
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            )}
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

        {/* Settings View */}
        {isShowingSettings && (
          <SettingsTab
            onClose={() => setIsShowingSettings(false)}
            onSave={() => {
              // Settings are auto-saved by the hook
              // Just show feedback that settings are applied
            }}
          />
        )}

        {/* Detail View */}
        {!isCreating && !isShowingSettings && selectedId && lectureData && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 z-10 shadow-sm">
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                <h2 className="text-lg font-bold text-gray-900 truncate" title={lectureData.title}>
                  {lectureData.title}
                </h2>
                <button 
                    onClick={() => setShowMetaModal(true)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
                    title="Edit Metadata"
                >
                    <Info className="w-4 h-4" />
                </button>
                
                {/* Progress Badge & Streaming Status */}
                <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                      {(lectureData.chapters || []).filter(c => c.status === 'completed').length} / {(lectureData.chapters || []).length}
                    </span>
                  </div>

                  {(streamingStatus.active || (lectureData.chapters || []).some(c => c.status === 'processing')) && (
                    <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full shadow-sm border border-slate-700 max-w-xs transition-all duration-300">
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        {streamingStatus.message ? (
                            <span className="text-[10px] text-green-400 font-mono truncate animate-in fade-in slide-in-from-left-2">
                                &gt; {streamingStatus.message}
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-mono">Processing...</span>
                        )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {(lectureData.chapters || []).some(c => c.status === 'error') && (
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`http://localhost:3000/api/lectures/${selectedId}/retry`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ apiKey: settings.apiKey })
                        });
                        alert("Retry started!");
                      } catch (e) {
                        alert("Retry failed");
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Retry</span>
                  </button>
                )}
                {lectureData.correction_stats && (
                  <button
                    onClick={() => setShowCorrectionModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-colors"
                    title="Fact Check Report"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Report</span>
                  </button>
                )}
                <div className="relative" ref={pdfDropdownRef}>
                  <button
                    onClick={() => setShowPdfDropdown(!showPdfDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">PDF</span>
                  </button>
                  
                  {showPdfDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 py-2 animate-in fade-in slide-in-from-top-2">
                      <button
                        onClick={() => { handleExportPDF('full'); setShowPdfDropdown(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4 text-slate-400" />
                        Full Lecture Note
                      </button>
                      <button
                        onClick={() => { handleExportPDF('summary'); setShowPdfDropdown(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Layout className="w-4 h-4 text-slate-400" />
                        Summary Only
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Correction Modal */}
            {showCorrectionModal && lectureData.correction_stats && (
              <CorrectionReportModal
                stats={lectureData.correction_stats}
                onClose={() => setShowCorrectionModal(false)}
              />
            )}

            {/* Metadata Modal */}
            {showMetaModal && (
              <MetadataModal
                note={lectureData as any} 
                onClose={() => setShowMetaModal(false)}
                onSave={async (updatedMeta) => {
                    try {
                        await fetch(`http://localhost:3000/api/lectures/${selectedId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updatedMeta)
                        });
                        setLectureData(prev => prev ? { ...prev, ...updatedMeta } : null);
                        // 목록도 갱신 (제목 변경 시)
                        if (updatedMeta.title) fetchLectures();
                    } catch (e) {
                        alert("Update failed");
                    }
                }}
              />
            )}

            {/* Content Area (Using LecturePreview but passing prop) */}
            <div className="flex-1 overflow-auto bg-gray-50/30">
              {/* LecturePreview Component Integration */}
              <LecturePreview
                note={{
                  title: lectureData.title,
                  overview: lectureData.overview || "",
                  author: lectureData.author,
                  tags: lectureData.tags,
                  finalSummary: lectureData.finalSummary,
                  chapters: (lectureData.chapters || []).map(c => ({
                    ...c,
                    timeRange: c.startTime && c.endTime ? `${c.startTime} ~ ${c.endTime}` : undefined,
                    narrative: c.status === 'completed' ? c.narrative : (c.status === 'processing' ? '...\n\nAnalyzing this chapter...' : 'Pending analysis...')
                  })) as any,
                  allGlossary: [], 
                  allActionItems: [],
                  allWarnings: [],
                  qualityReport: undefined
                }}
                onDownload={handleExportPDF}
                onDeepDive={async (chapterId) => {
                  try {
                    setStreamingStatus({ message: 'Deep dive 분석 시작...', active: true });
                    const res = await fetch(`http://localhost:3000/api/chapters/${chapterId}/regenerate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        feedback: '더 상세하고 깊이 있는 분석을 해주세요. 강사의 인용을 더 많이 포함하고, 각 개념에 대한 해석을 풍부하게 작성해주세요.',
                        apiKey: settings.apiKey
                      })
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error || 'Deep dive 요청 실패');
                    }
                    // 상태 갱신을 위해 데이터 다시 로드
                    setTimeout(() => fetchLectureDetail(selectedId!), 1000);
                  } catch (e: any) {
                    alert('Deep dive 실패: ' + e.message);
                    setStreamingStatus({ message: '', active: false });
                  }
                }}
                onSaveChapter={async (chapterId, updates) => {
                   try {
                     await fetch(`http://localhost:3000/api/chapters/${chapterId}`, {
                       method: 'PUT',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify(updates)
                     });
                     // Optimistic update
                     setLectureData(prev => {
                       if (!prev) return null;
                       return {
                         ...prev,
                         chapters: prev.chapters.map(ch => 
                           ch.id === chapterId ? { ...ch, ...updates } : ch
                         )
                       };
                     });
                   } catch (e) {
                     alert("저장 실패");
                   }
                }}
                onRegenerateWithFeedback={async (chId, feedback) => {
                  try {
                    const res = await fetch(`http://localhost:3000/api/chapters/${chId}/regenerate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ feedback, apiKey: settings.apiKey })
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error || '재생성 실패');
                    }
                    setTimeout(() => fetchLectureDetail(selectedId!), 1000);
                  } catch (e: any) {
                    alert("재생성 요청 실패: " + e.message);
                  }
                }}
                onGenerateFinalSummary={async () => {
                  try {
                    const res = await fetch(`http://localhost:3000/api/lectures/${selectedId}/generate-summary`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ apiKey: settings.apiKey })
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error || 'Generation failed');
                    }
                    setStreamingStatus({ message: 'Generating Final Summary...', active: true });
                  } catch (e: any) {
                    alert("Final Summary 생성 실패: " + e.message);
                  }
                }}
                onContinueProcessing={async () => {
                  try {
                    const res = await fetch(`http://localhost:3000/api/lectures/${selectedId}/continue-processing`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ apiKey: settings.apiKey })
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      throw new Error(err.error || 'Continue failed');
                    }
                    const data = await res.json();
                    setStreamingStatus({ message: `Resuming ${data.pendingCount} chapters...`, active: true });
                  } catch (e: any) {
                    alert("이어서 처리 실패: " + e.message);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isCreating && !isShowingSettings && !selectedId && (
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
