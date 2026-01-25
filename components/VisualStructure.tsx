import React from 'react';
import { ArrowRight, GitBranch, Layers, Clock, CheckCircle2 } from 'lucide-react';

interface VisualItem {
  label: string;
  description?: string;
  subItems?: string[];
}

interface VisualStructureData {
  type: 'process' | 'comparison' | 'hierarchy' | 'timeline';
  title: string;
  items: VisualItem[];
}

interface VisualStructureProps {
  data: VisualStructureData;
}

// Process: Step-by-step flow
const ProcessView: React.FC<{ items: VisualItem[]; title: string }> = ({ items, title }) => (
  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
    <h4 className="text-sm font-bold text-blue-900 mb-4 flex items-center gap-2">
      <ArrowRight className="w-4 h-4" />
      {title}
    </h4>
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-md">
            {idx + 1}
          </div>
          <div className="flex-1 bg-white rounded-lg p-3 shadow-sm border border-blue-100">
            <p className="font-medium text-gray-900 text-sm">{item.label}</p>
            {item.description && (
              <p className="text-gray-600 text-xs mt-1">{item.description}</p>
            )}
          </div>
          {idx < items.length - 1 && (
            <div className="absolute left-[19px] mt-8 w-0.5 h-3 bg-blue-300" />
          )}
        </div>
      ))}
    </div>
  </div>
);

// Comparison: Side-by-side or list comparison
const ComparisonView: React.FC<{ items: VisualItem[]; title: string }> = ({ items, title }) => (
  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
    <h4 className="text-sm font-bold text-amber-900 mb-4 flex items-center gap-2">
      <GitBranch className="w-4 h-4" />
      {title}
    </h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
            idx % 2 === 0 ? 'border-amber-200' : 'border-orange-200'
          }`}
        >
          <p className="font-bold text-gray-900 text-sm mb-1">{item.label}</p>
          {item.description && (
            <p className="text-gray-600 text-xs">{item.description}</p>
          )}
          {item.subItems && item.subItems.length > 0 && (
            <ul className="mt-2 space-y-1">
              {item.subItems.map((sub, subIdx) => (
                <li key={subIdx} className="text-xs text-gray-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-500" />
                  {sub}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Hierarchy: Tree-like structure
const HierarchyView: React.FC<{ items: VisualItem[]; title: string }> = ({ items, title }) => (
  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
    <h4 className="text-sm font-bold text-emerald-900 mb-4 flex items-center gap-2">
      <Layers className="w-4 h-4" />
      {title}
    </h4>
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
          <p className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            {item.label}
          </p>
          {item.description && (
            <p className="text-gray-600 text-xs mt-1 ml-4">{item.description}</p>
          )}
          {item.subItems && item.subItems.length > 0 && (
            <div className="ml-4 mt-2 pl-3 border-l-2 border-emerald-200 space-y-1">
              {item.subItems.map((sub, subIdx) => (
                <p key={subIdx} className="text-xs text-gray-600 py-0.5">{sub}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Timeline: Chronological events
const TimelineView: React.FC<{ items: VisualItem[]; title: string }> = ({ items, title }) => (
  <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-100">
    <h4 className="text-sm font-bold text-purple-900 mb-4 flex items-center gap-2">
      <Clock className="w-4 h-4" />
      {title}
    </h4>
    <div className="relative">
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-purple-200" />
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="relative pl-8">
            <div className="absolute left-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center shadow-md">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-purple-100">
              <p className="font-medium text-gray-900 text-sm">{item.label}</p>
              {item.description && (
                <p className="text-gray-600 text-xs mt-1">{item.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const VisualStructure: React.FC<VisualStructureProps> = ({ data }) => {
  if (!data || !data.items || data.items.length === 0) {
    return null;
  }

  const { type, title, items } = data;

  switch (type) {
    case 'process':
      return <ProcessView items={items} title={title} />;
    case 'comparison':
      return <ComparisonView items={items} title={title} />;
    case 'hierarchy':
      return <HierarchyView items={items} title={title} />;
    case 'timeline':
      return <TimelineView items={items} title={title} />;
    default:
      // Fallback to process view
      return <ProcessView items={items} title={title} />;
  }
};
