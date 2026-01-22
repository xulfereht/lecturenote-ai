/**
 * Settings State Management Hook
 *
 * Provides React hook for managing AI settings:
 * - Provider and model selection
 * - API key management with encryption
 * - Temperature and token configuration
 * - LLM correction toggle
 * - Persistent storage in localStorage
 *
 * @module useSettings
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * AI Settings interface
 */
export interface AISettings {
  /** AI provider (currently only 'google' supported) */
  provider: 'google';
  /** Model identifier */
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  /** API key (stored encrypted) */
  apiKey: string;
  /** Generation temperature (0.0-1.0) */
  temperature: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Whether LLM correction is enabled */
  llmCorrectionEnabled: boolean;
}

/**
 * Settings hook return type
 */
export interface UseSettingsReturn {
  /** Current settings */
  settings: AISettings;
  /** Update settings (partial update supported) */
  updateSettings: (updates: Partial<AISettings>) => void;
  /** Reset settings to defaults */
  resetSettings: () => void;
  /** Check if API key is configured */
  hasApiKey: boolean;
  /** Validate current settings */
  validateSettings: () => ValidationResult;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Available models configuration
 */
export const AVAILABLE_MODELS = {
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    description: '빠르고 효율적인 일반 용도 모델',
    maxTokens: 8192,
    costTier: 'low' as const
  },
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    description: '복잡한 추론을 위한 고급 모델',
    maxTokens: 8192,
    costTier: 'medium' as const
  }
} as const;

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AISettings = {
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 8192,
  llmCorrectionEnabled: false
};

/**
 * LocalStorage key for settings
 */
const STORAGE_KEY = 'lecturenote-ai-settings';

/**
 * Encryption key derivation (simple obfuscation for localStorage)
 * Note: This is basic obfuscation, not secure encryption.
 * For production, consider using Web Crypto API with proper key management.
 */
const OBFUSCATION_KEY = 'lnai-2024';

/**
 * Simple XOR-based obfuscation for API key storage
 * This is NOT secure encryption, just basic obfuscation to prevent casual viewing
 */
function obfuscate(text: string): string {
  if (!text) return '';

  const key = OBFUSCATION_KEY;
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }

  return btoa(result); // Base64 encode
}

/**
 * Deobfuscate API key from storage
 */
function deobfuscate(encoded: string): string {
  if (!encoded) return '';

  try {
    const decoded = atob(encoded); // Base64 decode
    const key = OBFUSCATION_KEY;
    let result = '';

    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }

    return result;
  } catch {
    return '';
  }
}

/**
 * Load settings from localStorage
 */
function loadSettings(): AISettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(stored);

    // Deobfuscate API key
    if (parsed.apiKey) {
      parsed.apiKey = deobfuscate(parsed.apiKey);
    }

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_SETTINGS,
      ...parsed
    };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: AISettings): void {
  try {
    // Create copy and obfuscate API key for storage
    const toStore = {
      ...settings,
      apiKey: obfuscate(settings.apiKey)
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Validate settings
 */
function validateSettingsData(settings: AISettings): ValidationResult {
  const errors: string[] = [];

  if (!settings.provider) {
    errors.push('Provider is required');
  }

  if (!settings.model) {
    errors.push('Model is required');
  }

  if (settings.temperature < 0 || settings.temperature > 1) {
    errors.push('Temperature must be between 0 and 1');
  }

  if (settings.maxTokens < 1 || settings.maxTokens > 8192) {
    errors.push('Max tokens must be between 1 and 8192');
  }

  // API key validation (if LLM correction is enabled)
  if (settings.llmCorrectionEnabled && !settings.apiKey) {
    errors.push('API key is required when LLM correction is enabled');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * React hook for managing AI settings
 *
 * @returns Settings state and management functions
 *
 * @example
 * ```tsx
 * const { settings, updateSettings, hasApiKey } = useSettings();
 *
 * // Update a single setting
 * updateSettings({ temperature: 0.5 });
 *
 * // Update multiple settings
 * updateSettings({
 *   model: 'gemini-2.5-pro',
 *   temperature: 0.8
 * });
 * ```
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    setIsLoading(true);
    try {
      const loaded = loadSettings();
      setSettings(loaded);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update settings
  const updateSettings = useCallback((updates: Partial<AISettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
    setError(null);
  }, []);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setError(null);
  }, []);

  // Validate current settings
  const validateSettings = useCallback(() => {
    return validateSettingsData(settings);
  }, [settings]);

  // Check if API key is configured
  const hasApiKey = Boolean(settings.apiKey && settings.apiKey.length > 0);

  return {
    settings,
    updateSettings,
    resetSettings,
    hasApiKey,
    validateSettings,
    isLoading,
    error
  };
}

// Export types and constants
export { DEFAULT_SETTINGS, STORAGE_KEY };
