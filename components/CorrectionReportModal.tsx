
import React from 'react';
import { X, CheckCircle, AlertTriangle, FileText, Info } from 'lucide-react';
import { CorrectionStats, CorrectionDetail } from '../types';

interface CorrectionReportModalProps {
  stats: CorrectionStats;
  onClose: () => void;
}

export const CorrectionReportModal: React.FC<CorrectionReportModalProps> = ({ stats, onClose }) => {
  // Flatten all corrections
  const allCorrections = stats.correctionDetails
    ? stats.correctionDetails.flatMap(d => d.corrections)
    : [];

  const summary = stats.correctionStats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI 교정 & 팩트체크 리포트</h2>
              <p className="text-sm text-gray-500">전처리 과정에서 수정된 내용과 이유를 확인하세요.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
          
          {/* Summary Stats */}
          {summary ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">총 수정 건수</div>
                <div className="text-2xl font-black text-indigo-600">{summary.totalCorrectionsApplied}건</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">오청취/오타</div>
                <div className="text-2xl font-bold text-gray-800">
                  {summary.correctionsByType.typo + summary.correctionsByType.mishearing}
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">전문용어 통일</div>
                <div className="text-2xl font-bold text-gray-800">{summary.correctionsByType.terminology}</div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="text-sm text-gray-500 mb-1">평균 신뢰도</div>
                <div className="text-2xl font-bold text-emerald-600">
                  {summary.averageConfidence ? (summary.averageConfidence * 100).toFixed(0) : 0}%
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                <h3 className="font-bold text-amber-900 mb-1">교정 데이터가 없습니다</h3>
                <p className="text-amber-800 text-sm">
                    이 강의는 텍스트 교정(LLM Correction) 과정을 거치지 않았거나, 수정할 내용이 없었습니다.<br/>
                    설정에서 'LLM Text Correction' 기능을 켜고 다시 분석하면 상세 리포트를 볼 수 있습니다.
                </p>
            </div>
          )}

          {/* Details List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <h3 className="font-bold text-gray-700">상세 수정 내역</h3>
            </div>
            
            {allCorrections.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>수정된 내역이 없습니다. 원본 텍스트가 완벽하거나 교정이 필요하지 않았습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {allCorrections.map((correction, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      {/* Badge */}
                      <div className="mt-1">
                        {correction.reason.includes('terminology') ? (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">용어</span>
                        ) : correction.reason.includes('mishearing') ? (
                          <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded font-bold">오청취</span>
                        ) : correction.reason.includes('fact') ? (
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold">팩트</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-bold">기타</span>
                        )}
                      </div>

                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Original */}
                        <div className="relative group">
                          <div className="text-xs text-gray-400 mb-1 font-mono">Original</div>
                          <div className="text-gray-500 line-through decoration-red-300 decoration-2 bg-red-50/50 p-2 rounded text-sm">
                            {correction.original}
                          </div>
                        </div>

                        {/* Corrected */}
                        <div>
                          <div className="text-xs text-gray-400 mb-1 font-mono">Corrected</div>
                          <div className="text-gray-900 font-medium bg-green-50/50 p-2 rounded text-sm border-l-2 border-green-400">
                            {correction.corrected}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Reason/Context */}
                    <div className="mt-2 ml-14 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
                        <p className="text-xs text-gray-500">{correction.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
