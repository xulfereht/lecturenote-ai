/**
 * Tests for aiProvider module
 * @module tests/server/ai/aiProvider.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIProvider,
  GeminiProvider,
  createAIProvider,
  getDefaultConfig,
  validateConfig,
  AVAILABLE_MODELS
} from '../../../server/ai/aiProvider.js';

// Mock the @google/genai module with a proper class
vi.mock('@google/genai', () => {
  // Create a mock class for GoogleGenAI
  class MockGoogleGenAI {
    constructor(config) {
      this.apiKey = config.apiKey;
      this.models = {
        generateContent: vi.fn()
      };
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      OBJECT: 'OBJECT',
      ARRAY: 'ARRAY'
    }
  };
});

describe('aiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AIProvider (abstract class)', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new AIProvider({ provider: 'test', apiKey: 'test-key' }))
        .toThrow('AIProvider is an abstract class and cannot be instantiated directly');
    });
  });

  describe('createAIProvider', () => {
    it('should create GeminiProvider for google provider', () => {
      const provider = createAIProvider({ provider: 'google', apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it('should throw for unsupported provider', () => {
      expect(() => createAIProvider({ provider: 'unknown', apiKey: 'test' }))
        .toThrow(/unsupported/i);
    });

    it('should throw for missing provider', () => {
      expect(() => createAIProvider({ apiKey: 'test' }))
        .toThrow();
    });
  });

  describe('GeminiProvider', () => {
    it('should require an API key', () => {
      expect(() => new GeminiProvider({ provider: 'google' }))
        .toThrow('API key is required for Gemini provider');
    });

    it('should initialize with default model when not specified', () => {
      const provider = new GeminiProvider({ apiKey: 'test-key' });
      expect(provider.model).toBe('gemini-2.5-flash');
    });

    it('should use specified model', () => {
      const provider = new GeminiProvider({
        apiKey: 'test-key',
        model: 'gemini-2.5-pro'
      });
      expect(provider.model).toBe('gemini-2.5-pro');
    });

    it('should merge config with defaults', () => {
      const provider = new GeminiProvider({
        apiKey: 'test-key',
        temperature: 0.5
      });
      expect(provider.config.temperature).toBe(0.5);
      expect(provider.config.maxTokens).toBe(8192); // default
      expect(provider.config.maxRetries).toBe(3); // default
    });

    describe('validateResponse', () => {
      it('should validate response with required fields', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const validResponse = { correctedText: 'text', corrections: [] };
        const schema = { required: ['correctedText', 'corrections'] };

        const result = provider.validateResponse(validResponse, schema);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should detect missing required fields', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const invalidResponse = { correctedText: 'text' };
        const schema = { required: ['correctedText', 'corrections'] };

        const result = provider.validateResponse(invalidResponse, schema);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required field: corrections');
      });

      it('should handle null response', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = provider.validateResponse(null, {});
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Response is null or undefined');
      });

      it('should handle undefined response', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = provider.validateResponse(undefined, {});
        expect(result.isValid).toBe(false);
      });

      it('should pass validation without schema', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = provider.validateResponse({ any: 'data' });
        expect(result.isValid).toBe(true);
      });
    });

    describe('isReady', () => {
      it('should return true when API key is set', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        expect(provider.isReady()).toBe(true);
      });
    });

    describe('getInfo', () => {
      it('should return provider metadata', () => {
        const provider = new GeminiProvider({
          apiKey: 'test-key',
          model: 'gemini-2.5-pro'
        });
        const info = provider.getInfo();

        expect(info.provider).toBe('google');
        expect(info.model).toBe('gemini-2.5-pro');
        expect(info.isReady).toBe(true);
      });
    });

    describe('isRetryableError', () => {
      it('should identify rate limit errors as retryable', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const error = new Error('Rate limit exceeded');
        expect(provider.isRetryableError(error)).toBe(true);
      });

      it('should identify timeout errors as retryable', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const error = new Error('Request timeout');
        expect(provider.isRetryableError(error)).toBe(true);
      });

      it('should identify 429 errors as retryable', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const error = new Error('Error 429: Too many requests');
        expect(provider.isRetryableError(error)).toBe(true);
      });

      it('should identify 503 errors as retryable', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const error = new Error('Error 503: Service unavailable');
        expect(provider.isRetryableError(error)).toBe(true);
      });

      it('should not identify validation errors as retryable', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const error = new Error('Invalid JSON format');
        expect(provider.isRetryableError(error)).toBe(false);
      });
    });

    describe('sleep', () => {
      it('should wait for specified milliseconds', async () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const start = Date.now();
        await provider.sleep(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
      });
    });
  });

  describe('getDefaultConfig', () => {
    it('should return google default config', () => {
      const config = getDefaultConfig('google');
      expect(config.provider).toBe('google');
      expect(config.model).toBe('gemini-2.5-flash');
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(8192);
    });

    it('should return empty object for unknown provider', () => {
      const config = getDefaultConfig('unknown');
      expect(config).toEqual({});
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      const config = {
        provider: 'google',
        apiKey: 'test-key',
        model: 'gemini-2.5-flash',
        temperature: 0.7
      };
      const result = validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing provider', () => {
      const config = { apiKey: 'test-key' };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Provider is required');
    });

    it('should detect missing API key', () => {
      const config = { provider: 'google' };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key is required');
    });

    it('should detect unknown provider', () => {
      const config = { provider: 'unknown', apiKey: 'test' };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unknown provider: unknown');
    });

    it('should detect invalid temperature', () => {
      const config = {
        provider: 'google',
        apiKey: 'test',
        temperature: 1.5
      };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 1');
    });

    it('should detect invalid maxTokens', () => {
      const config = {
        provider: 'google',
        apiKey: 'test',
        maxTokens: 0
      };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Max tokens must be at least 1');
    });

    it('should detect unknown model for provider', () => {
      const config = {
        provider: 'google',
        apiKey: 'test',
        model: 'unknown-model'
      };
      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unknown model for google: unknown-model');
    });
  });

  describe('AVAILABLE_MODELS', () => {
    it('should have google models defined', () => {
      expect(AVAILABLE_MODELS.google).toBeDefined();
      expect(AVAILABLE_MODELS.google['gemini-2.5-flash']).toBeDefined();
      expect(AVAILABLE_MODELS.google['gemini-2.5-pro']).toBeDefined();
    });

    it('should have model metadata', () => {
      const flashModel = AVAILABLE_MODELS.google['gemini-2.5-flash'];
      expect(flashModel.name).toBeDefined();
      expect(flashModel.description).toBeDefined();
      expect(flashModel.maxTokens).toBeDefined();
      expect(flashModel.costTier).toBeDefined();
    });
  });
});
