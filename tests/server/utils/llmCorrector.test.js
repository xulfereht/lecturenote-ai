/**
 * Tests for llmCorrector module
 * @module tests/server/utils/llmCorrector.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  correctWithLLM,
  correctSegmentsBatch,
  applyCorrections,
  getCorrectionStats,
  quickCorrect,
  needsCorrection,
  CORRECTOR_DEFAULT_CONFIG,
  CORRECTION_SCHEMA
} from '../../../server/utils/llmCorrector.js';

// Mock AI Provider
const createMockAIProvider = (response = null) => ({
  generateContent: vi.fn().mockResolvedValue(
    response || {
      success: true,
      data: {
        correctedText: 'Corrected text',
        corrections: [
          { original: 'typo', corrected: 'typo fixed', reason: 'typo' }
        ],
        confidence: 0.95
      }
    }
  )
});

describe('llmCorrector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('correctWithLLM', () => {
    it('should correct text using AI provider', async () => {
      const mockProvider = createMockAIProvider();
      const result = await correctWithLLM('Hello wrold', mockProvider);

      expect(result.success).toBe(true);
      expect(result.correctedText).toBe('Corrected text');
      expect(result.corrections).toHaveLength(1);
      expect(mockProvider.generateContent).toHaveBeenCalledTimes(1);
    });

    it('should return original text when disabled', async () => {
      const mockProvider = createMockAIProvider();
      const result = await correctWithLLM('Hello world', mockProvider, { enabled: false });

      expect(result.success).toBe(true);
      expect(result.correctedText).toBe('Hello world');
      expect(result.skipped).toBe(true);
      expect(mockProvider.generateContent).not.toHaveBeenCalled();
    });

    it('should handle empty text', async () => {
      const mockProvider = createMockAIProvider();
      const result = await correctWithLLM('', mockProvider);

      expect(result.success).toBe(true);
      expect(result.correctedText).toBe('');
      expect(result.corrections).toHaveLength(0);
      expect(mockProvider.generateContent).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only text', async () => {
      const mockProvider = createMockAIProvider();
      const result = await correctWithLLM('   ', mockProvider);

      expect(result.success).toBe(true);
      expect(result.correctedText).toBe('   ');
      expect(mockProvider.generateContent).not.toHaveBeenCalled();
    });

    it('should handle AI provider failure', async () => {
      const mockProvider = createMockAIProvider({
        success: false,
        data: null,
        error: 'API error'
      });

      const result = await correctWithLLM('Hello world', mockProvider);

      expect(result.success).toBe(false);
      expect(result.correctedText).toBe('Hello world'); // Returns original on failure
      expect(result.error).toBe('API error');
    });

    it('should truncate text exceeding maxSegmentLength', async () => {
      const longText = 'A'.repeat(6000);
      const mockProvider = createMockAIProvider({
        success: true,
        data: {
          correctedText: 'B'.repeat(5000),
          corrections: [],
          confidence: 0.9
        }
      });

      const result = await correctWithLLM(longText, mockProvider, { maxSegmentLength: 5000 });

      expect(result.success).toBe(true);
      // Should append the truncated portion
      expect(result.correctedText.length).toBe(6000);
    });

    it('should pass correct configuration to prompt', async () => {
      const mockProvider = createMockAIProvider();
      await correctWithLLM('Test text', mockProvider, {
        preserveTimestamps: true,
        correctTechnicalTerms: true,
        correctMishearings: false
      });

      const callArgs = mockProvider.generateContent.mock.calls[0][0];
      expect(callArgs.prompt).toContain('타임스탬프');
      expect(callArgs.prompt).toContain('전문용어');
      expect(callArgs.temperature).toBe(0.3);
    });

    it('should handle exceptions gracefully', async () => {
      const mockProvider = {
        generateContent: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      const result = await correctWithLLM('Hello world', mockProvider);

      expect(result.success).toBe(false);
      expect(result.correctedText).toBe('Hello world');
      expect(result.error).toBe('Network error');
    });
  });

  describe('correctSegmentsBatch', () => {
    it('should process multiple segments', async () => {
      const mockProvider = createMockAIProvider();
      const segments = [
        { text: 'Segment 1' },
        { text: 'Segment 2' },
        { text: 'Segment 3' }
      ];

      const results = await correctSegmentsBatch(segments, mockProvider, { batchSize: 2 });

      expect(results).toHaveLength(3);
      expect(mockProvider.generateContent).toHaveBeenCalledTimes(3);
    });

    it('should return original segments when disabled', async () => {
      const mockProvider = createMockAIProvider();
      const segments = [
        { text: 'Segment 1' },
        { text: 'Segment 2' }
      ];

      const results = await correctSegmentsBatch(segments, mockProvider, { enabled: false });

      expect(results).toHaveLength(2);
      expect(results[0].skipped).toBe(true);
      expect(results[0].correctedText).toBe('Segment 1');
      expect(mockProvider.generateContent).not.toHaveBeenCalled();
    });

    it('should handle empty segments array', async () => {
      const mockProvider = createMockAIProvider();
      const results = await correctSegmentsBatch([], mockProvider);

      expect(results).toHaveLength(0);
    });

    it('should handle string segments', async () => {
      const mockProvider = createMockAIProvider();
      const segments = ['String 1', 'String 2'];

      const results = await correctSegmentsBatch(segments, mockProvider);

      expect(results).toHaveLength(2);
      expect(mockProvider.generateContent).toHaveBeenCalledTimes(2);
    });

    it('should process batches sequentially with delay', async () => {
      const mockProvider = createMockAIProvider();
      const segments = Array(5).fill({ text: 'Test' });
      const startTime = Date.now();

      await correctSegmentsBatch(segments, mockProvider, { batchSize: 2 });

      // Should have at least 2 delays (between batch 1-2 and 2-3)
      // Each delay is 500ms minimum
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(400); // Allow some variance
    });
  });

  describe('applyCorrections', () => {
    it('should apply corrections to segments', () => {
      const segments = [
        { text: 'Original 1', timestamp: '00:00' },
        { text: 'Original 2', timestamp: '00:05' }
      ];

      const corrections = [
        { success: true, correctedText: 'Corrected 1', corrections: [{ original: 'a', corrected: 'b', reason: 'typo' }] },
        { success: true, correctedText: 'Corrected 2', corrections: [] }
      ];

      const result = applyCorrections(segments, corrections);

      expect(result[0].text).toBe('Corrected 1');
      expect(result[0].timestamp).toBe('00:00');
      expect(result[0].correctionApplied).toBe(true);
      expect(result[0].correctionCount).toBe(1);

      expect(result[1].text).toBe('Corrected 2');
      expect(result[1].correctionApplied).toBe(false);
    });

    it('should handle string segments', () => {
      const segments = ['Original 1', 'Original 2'];
      const corrections = [
        { success: true, correctedText: 'Corrected 1', corrections: [] },
        { success: true, correctedText: 'Corrected 2', corrections: [] }
      ];

      const result = applyCorrections(segments, corrections);

      expect(result[0]).toBe('Corrected 1');
      expect(result[1]).toBe('Corrected 2');
    });

    it('should keep original segment on failed correction', () => {
      const segments = [{ text: 'Original' }];
      const corrections = [{ success: false, correctedText: 'Failed' }];

      const result = applyCorrections(segments, corrections);

      expect(result[0].text).toBe('Original');
    });

    it('should return original segments on count mismatch', () => {
      const segments = [{ text: 'Original 1' }, { text: 'Original 2' }];
      const corrections = [{ success: true, correctedText: 'Corrected' }];

      const result = applyCorrections(segments, corrections);

      expect(result).toBe(segments);
    });
  });

  describe('getCorrectionStats', () => {
    it('should calculate statistics from correction results', () => {
      const results = [
        {
          success: true,
          corrections: [
            { reason: 'typo' },
            { reason: 'mishearing' }
          ],
          confidence: 0.9
        },
        {
          success: true,
          corrections: [
            { reason: 'terminology' }
          ],
          confidence: 0.8
        },
        {
          success: false,
          corrections: []
        },
        {
          success: true,
          skipped: true,
          corrections: []
        }
      ];

      const stats = getCorrectionStats(results);

      expect(stats.totalSegments).toBe(4);
      expect(stats.successfulCorrections).toBe(2);
      expect(stats.failedCorrections).toBe(1);
      expect(stats.skippedCorrections).toBe(1);
      expect(stats.totalCorrectionsApplied).toBe(3);
      expect(stats.correctionsByType.typo).toBe(1);
      expect(stats.correctionsByType.mishearing).toBe(1);
      expect(stats.correctionsByType.terminology).toBe(1);
      expect(stats.averageConfidence).toBeCloseTo(0.85, 5); // Use toBeCloseTo for floating point
    });

    it('should handle empty results', () => {
      const stats = getCorrectionStats([]);

      expect(stats.totalSegments).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });

    it('should categorize Korean reason types', () => {
      const results = [
        {
          success: true,
          corrections: [
            { reason: '오청취' },
            { reason: '용어 통일' }
          ],
          confidence: 0.9
        }
      ];

      const stats = getCorrectionStats(results);

      expect(stats.correctionsByType.mishearing).toBe(1);
      expect(stats.correctionsByType.terminology).toBe(1);
    });
  });

  describe('quickCorrect', () => {
    it('should return corrected text directly', async () => {
      const mockProvider = createMockAIProvider();
      const result = await quickCorrect('Hello typo', mockProvider);

      expect(result).toBe('Corrected text');
    });

    it('should return original text on failure', async () => {
      const mockProvider = createMockAIProvider({
        success: false,
        data: null,
        error: 'Failed'
      });

      const result = await quickCorrect('Hello world', mockProvider);

      expect(result).toBe('Hello world');
    });
  });

  describe('needsCorrection', () => {
    it('should return false for short text', () => {
      expect(needsCorrection('Short')).toBe(false);
    });

    it('should return false for empty text', () => {
      expect(needsCorrection('')).toBe(false);
      expect(needsCorrection(null)).toBe(false);
    });

    it('should detect consecutive consonants', () => {
      const text = 'This text has ㄱㄴㄷ error pattern and is long enough to check';
      expect(needsCorrection(text)).toBe(true);
    });

    it('should detect repeated words', () => {
      const text = 'This is a sentence with word word repeated which should be detected';
      expect(needsCorrection(text)).toBe(true);
    });

    it('should detect lowercase technical terms', () => {
      const text = 'We are going to discuss gpt models and how they work in practice today';
      expect(needsCorrection(text)).toBe(true);
    });

    it('should return false for clean text', () => {
      const text = 'This is a perfectly normal sentence without any issues that would need correction.';
      expect(needsCorrection(text)).toBe(false);
    });
  });

  describe('CORRECTOR_DEFAULT_CONFIG', () => {
    it('should have all expected configuration options', () => {
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('enabled');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('batchSize');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('maxSegmentLength');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('preserveTimestamps');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('correctTechnicalTerms');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('correctMishearings');
      expect(CORRECTOR_DEFAULT_CONFIG).toHaveProperty('language');
    });

    it('should have sensible default values', () => {
      expect(CORRECTOR_DEFAULT_CONFIG.enabled).toBe(true);
      expect(CORRECTOR_DEFAULT_CONFIG.batchSize).toBe(3);
      expect(CORRECTOR_DEFAULT_CONFIG.maxSegmentLength).toBe(5000);
      expect(CORRECTOR_DEFAULT_CONFIG.language).toBe('ko');
    });
  });

  describe('CORRECTION_SCHEMA', () => {
    it('should define required fields', () => {
      expect(CORRECTION_SCHEMA.required).toContain('correctedText');
      expect(CORRECTION_SCHEMA.required).toContain('corrections');
    });

    it('should define property types', () => {
      expect(CORRECTION_SCHEMA.properties.correctedText).toBeDefined();
      expect(CORRECTION_SCHEMA.properties.corrections).toBeDefined();
      expect(CORRECTION_SCHEMA.properties.confidence).toBeDefined();
    });
  });
});
