
import React from 'react';
import { JobStatus } from '../types';
import { Loader2, CheckCircle2, FileText, Cpu, Layout, FileOutput } from 'lucide-react';

interface ProcessingUIProps {
  status: JobStatus;
}

export const ProcessingUI: React.FC<ProcessingUIProps> = ({ status }) => {
  const steps = [
    { id: JobStatus.PARSING, label: '자막 파일(VTT) 파싱 중', icon: FileText },
    { id: JobStatus.ANALYZING, label: '강의 구조 및 목차 생성 중', icon: Cpu },
    { id: JobStatus.STRUCTURING, label: '문서 레이아웃 구성 중', icon: Layout },
    { id: JobStatus.COMPLETING, label: '초기 스캔 완료', icon: FileOutput },
  ];

  const getStatusColor = (stepId: JobStatus) => {
    const statuses = Object.values(JobStatus);
    const statusIdx = statuses.indexOf(status);
    const stepIdx = statuses.indexOf(stepId);

    if (status === JobStatus.FAILED) return 'text-red-500';
    if (statusIdx > stepIdx || status === JobStatus.SUCCESS) return 'text-green-500';
    if (statusIdx === stepIdx) return 'text-blue-600 animate-pulse';
    return 'text-gray-300';
  };

  return (
    <div className="max-w-md mx-auto bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100">
      <h2 className="text-2xl font-bold mb-8 text-center text-gray-800">강의 분석 중</h2>
      <div className="space-y-8">
        {steps.map((step) => {
          const Icon = step.icon;
          const isCurrent = status === step.id;
          const isDone = Object.values(JobStatus).indexOf(status) > Object.values(JobStatus).indexOf(step.id) || status === JobStatus.SUCCESS;

          return (
            <div key={step.id} className="flex items-center space-x-4">
              <div className={`p-3 rounded-2xl transition-all duration-500 ${isDone ? 'bg-green-100' : isCurrent ? 'bg-blue-100' : 'bg-gray-50'}`}>
                {isDone ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                ) : (
                  <Icon className="w-6 h-6 text-gray-300" />
                )}
              </div>
              <span className={`font-bold transition-colors duration-500 ${getStatusColor(step.id)}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      
      {status === JobStatus.FAILED && (
        <div className="mt-10 p-4 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-100">
          분석 중 오류가 발생했습니다. 파일 형식을 확인하거나 잠시 후 다시 시도해 주세요.
        </div>
      )}

      <div className="mt-10 bg-blue-50 p-4 rounded-2xl border border-blue-100">
        <p className="text-[10px] text-center text-blue-400 leading-relaxed font-medium">
          긴 강의(1~3시간)의 경우 초기 구조 분석에<br/>약 30~60초가 소요될 수 있습니다.
        </p>
      </div>
    </div>
  );
};
