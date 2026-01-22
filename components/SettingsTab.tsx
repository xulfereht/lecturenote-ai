/**
 * Settings Tab Component
 *
 * Provides UI for managing AI settings:
 * - Provider selection (Google only for now)
 * - Model selection (flash/pro)
 * - API key input (masked)
 * - Temperature slider (0.0-1.0)
 * - Max tokens input
 * - LLM correction toggle
 *
 * @module SettingsTab
 */

import React, { useState, useCallback } from 'react';
import {
  Settings,
  Key,
  Cpu,
  Thermometer,
  Hash,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { useSettings, AVAILABLE_MODELS, type AISettings } from '../hooks/useSettings';

/**
 * Settings Tab Props
 */
interface SettingsTabProps {
  /** Callback when settings are saved */
  onSave?: (settings: AISettings) => void;
  /** Callback when tab is closed */
  onClose?: () => void;
}

/**
 * Settings Tab Component
 */
export const SettingsTab: React.FC<SettingsTabProps> = ({ onSave, onClose }) => {
  const {
    settings,
    updateSettings,
    resetSettings,
    hasApiKey,
    validateSettings,
    isLoading
  } = useSettings();

  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Handle save with validation
  const handleSave = useCallback(() => {
    const validation = validateSettings();

    if (!validation.isValid) {
      setSaveStatus('error');
      alert(validation.errors.join('\n'));
      return;
    }

    setSaveStatus('saved');
    onSave?.(settings);

    // Reset status after 2 seconds
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [settings, validateSettings, onSave]);

  // Handle reset with confirmation
  const handleReset = useCallback(() => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      resetSettings();
      setSaveStatus('idle');
    }
  }, [resetSettings]);

  // Handle API key change
  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ apiKey: e.target.value });
  }, [updateSettings]);

  // Handle model change
  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ model: e.target.value as AISettings['model'] });
  }, [updateSettings]);

  // Handle temperature change
  const handleTemperatureChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ temperature: parseFloat(e.target.value) });
  }, [updateSettings]);

  // Handle max tokens change
  const handleMaxTokensChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 8192) {
      updateSettings({ maxTokens: value });
    }
  }, [updateSettings]);

  // Handle LLM correction toggle
  const handleLLMCorrectionToggle = useCallback(() => {
    updateSettings({ llmCorrectionEnabled: !settings.llmCorrectionEnabled });
  }, [settings.llmCorrectionEnabled, updateSettings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-10 bg-gray-50/50 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI Settings</h2>
            <p className="text-gray-500 text-sm">Configure AI provider and model settings</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Cpu className="w-4 h-4 text-gray-400" />
              AI Provider
            </label>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Google AI</p>
                <p className="text-xs text-gray-500">Gemini models</p>
              </div>
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                Active
              </span>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Sparkles className="w-4 h-4 text-gray-400" />
              Model
            </label>
            <select
              value={settings.model}
              onChange={handleModelChange}
              className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900"
            >
              {Object.entries(AVAILABLE_MODELS).map(([key, model]) => (
                <option key={key} value={key}>
                  {model.name} - {model.description}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Flash is faster and cheaper, Pro is more capable for complex tasks
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Key className="w-4 h-4 text-gray-400" />
              API Key
              {hasApiKey ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              )}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={handleApiKeyChange}
                placeholder="Enter your Google AI API key"
                className="w-full p-3 pr-12 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm font-semibold text-gray-700">
              <span className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-gray-400" />
                Temperature
              </span>
              <span className="text-indigo-600 font-mono">{settings.temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.temperature}
              onChange={handleTemperatureChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Precise (0.0)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Hash className="w-4 h-4 text-gray-400" />
              Max Output Tokens
            </label>
            <input
              type="number"
              min="1"
              max="8192"
              value={settings.maxTokens}
              onChange={handleMaxTokensChange}
              className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-gray-500">
              Maximum number of tokens in the response (1-8192)
            </p>
          </div>

          {/* LLM Correction Toggle */}
          <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 cursor-pointer">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  LLM Text Correction
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Use AI to correct typos, mishearings, and technical terms before analysis.
                  This improves accuracy but increases processing time and API costs.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.llmCorrectionEnabled}
                onClick={handleLLMCorrectionToggle}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  settings.llmCorrectionEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.llmCorrectionEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {settings.llmCorrectionEnabled && !hasApiKey && (
              <div className="mt-3 flex items-center gap-2 text-amber-700 text-xs bg-amber-50 p-2 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                API key required for LLM correction
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>

          <div className="flex items-center gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all shadow-sm ${
                saveStatus === 'saved'
                  ? 'bg-green-600 text-white'
                  : saveStatus === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {saveStatus === 'saved' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Saved!
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Error
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
