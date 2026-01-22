/**
 * Tests for textNormalizer module
 * @module tests/server/utils/textNormalizer.test
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  removeBOM,
  normalizeWhitespace,
  removeControlCharacters,
  normalizeUTF8NFC,
  trimLines,
  collapseBlankLines,
  normalizeLineEndings,
  protectTimestamps,
  restoreTimestamps,
  handleReplacementCharacter,
  normalizeTextBatch,
  quickNormalize,
  DEFAULT_CONFIG
} from '../../../server/utils/textNormalizer.js';

describe('textNormalizer', () => {
  describe('removeBOM', () => {
    it('should remove UTF-8 BOM from start of text', () => {
      const withBOM = '\uFEFFHello World';
      const result = removeBOM(withBOM);
      expect(result.text).toBe('Hello World');
      expect(result.count).toBe(1);
    });

    it('should leave text without BOM unchanged', () => {
      const noBOM = 'Hello World';
      const result = removeBOM(noBOM);
      expect(result.text).toBe('Hello World');
      expect(result.count).toBe(0);
    });

    it('should only remove BOM at the start, not middle of text', () => {
      const midBOM = 'Hello\uFEFFWorld';
      const result = removeBOM(midBOM);
      expect(result.text).toBe('Hello\uFEFFWorld');
      expect(result.count).toBe(0);
    });
  });

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces into one', () => {
      const text = 'Hello   World';
      const result = normalizeWhitespace(text);
      expect(result.text).toBe('Hello World');
      expect(result.count).toBe(2); // 3 spaces -> 1, so 2 removed
    });

    it('should preserve single spaces', () => {
      const text = 'Hello World';
      const result = normalizeWhitespace(text);
      expect(result.text).toBe('Hello World');
      expect(result.count).toBe(0);
    });

    it('should preserve newlines', () => {
      const text = 'Line 1\nLine 2';
      const result = normalizeWhitespace(text);
      expect(result.text).toBe('Line 1\nLine 2');
    });

    it('should collapse tabs and spaces', () => {
      const text = 'Hello\t\t  World';
      const result = normalizeWhitespace(text);
      expect(result.text).toBe('Hello World');
    });

    it('should handle text with only whitespace between newlines', () => {
      const text = 'Line 1\n   \nLine 2';
      const result = normalizeWhitespace(text);
      expect(result.text).toBe('Line 1\n \nLine 2');
    });
  });

  describe('removeControlCharacters', () => {
    it('should remove control characters', () => {
      const text = 'Hello\x00World\x01Test';
      const result = removeControlCharacters(text);
      expect(result.text).toBe('HelloWorldTest');
      expect(result.count).toBe(2);
    });

    it('should preserve newlines', () => {
      const text = 'Hello\nWorld';
      const result = removeControlCharacters(text);
      expect(result.text).toBe('Hello\nWorld');
      expect(result.count).toBe(0);
    });

    it('should preserve tabs', () => {
      const text = 'Hello\tWorld';
      const result = removeControlCharacters(text);
      expect(result.text).toBe('Hello\tWorld');
      expect(result.count).toBe(0);
    });

    it('should preserve carriage returns', () => {
      const text = 'Hello\rWorld';
      const result = removeControlCharacters(text);
      expect(result.text).toBe('Hello\rWorld');
      expect(result.count).toBe(0);
    });
  });

  describe('normalizeUTF8NFC', () => {
    it('should normalize composed characters', () => {
      // e + combining accent vs precomposed e with accent
      const decomposed = 'caf\u0065\u0301'; // e + combining acute
      const result = normalizeUTF8NFC(decomposed);
      expect(result).toBe('caf\u00E9'); // precomposed e-acute
    });

    it('should leave already normalized text unchanged', () => {
      const text = 'Hello World';
      const result = normalizeUTF8NFC(text);
      expect(result).toBe('Hello World');
    });

    it('should handle Korean text correctly', () => {
      const korean = '한글 테스트';
      const result = normalizeUTF8NFC(korean);
      expect(result).toBe('한글 테스트');
    });
  });

  describe('handleReplacementCharacter', () => {
    it('should remove replacement characters by default', () => {
      const text = 'Hello\uFFFDWorld';
      const result = handleReplacementCharacter(text);
      expect(result.text).toBe('HelloWorld');
      expect(result.count).toBe(1);
    });

    it('should replace with custom string', () => {
      const text = 'Hello\uFFFDWorld';
      const result = handleReplacementCharacter(text, '?');
      expect(result.text).toBe('Hello?World');
      expect(result.count).toBe(1);
    });

    it('should handle multiple replacement characters', () => {
      const text = '\uFFFDHello\uFFFDWorld\uFFFD';
      const result = handleReplacementCharacter(text);
      expect(result.text).toBe('HelloWorld');
      expect(result.count).toBe(3);
    });
  });

  describe('trimLines', () => {
    it('should trim leading and trailing whitespace from each line', () => {
      const text = '  Hello World  \n  Line 2  ';
      const result = trimLines(text);
      expect(result).toBe('Hello World\nLine 2');
    });

    it('should handle empty lines', () => {
      const text = 'Line 1\n   \nLine 2';
      const result = trimLines(text);
      expect(result).toBe('Line 1\n\nLine 2');
    });
  });

  describe('collapseBlankLines', () => {
    it('should collapse multiple blank lines to max allowed', () => {
      const text = 'Line 1\n\n\n\n\nLine 2';
      const result = collapseBlankLines(text, 2);
      expect(result.text).toBe('Line 1\n\n\nLine 2');
      expect(result.count).toBeGreaterThan(0);
    });

    it('should not change text with fewer blank lines than max', () => {
      const text = 'Line 1\n\nLine 2';
      const result = collapseBlankLines(text, 2);
      expect(result.text).toBe('Line 1\n\nLine 2');
      expect(result.count).toBe(0);
    });
  });

  describe('normalizeLineEndings', () => {
    it('should convert CRLF to LF', () => {
      const text = 'Hello\r\nWorld';
      const result = normalizeLineEndings(text);
      expect(result).toBe('Hello\nWorld');
    });

    it('should convert CR to LF', () => {
      const text = 'Hello\rWorld';
      const result = normalizeLineEndings(text);
      expect(result).toBe('Hello\nWorld');
    });

    it('should leave LF unchanged', () => {
      const text = 'Hello\nWorld';
      const result = normalizeLineEndings(text);
      expect(result).toBe('Hello\nWorld');
    });
  });

  describe('protectTimestamps and restoreTimestamps', () => {
    it('should protect and restore bracketed timestamps', () => {
      const text = '[00:05:23] Hello World [00:10:00]';
      const protected_ = protectTimestamps(text);
      expect(protected_.text).not.toContain('[00:05:23]');
      expect(protected_.count).toBe(2);

      const restored = restoreTimestamps(protected_.text, protected_.map);
      expect(restored).toBe(text);
    });

    it('should protect and restore short timestamps', () => {
      const text = '[00:05] Hello [10:30]';
      const protected_ = protectTimestamps(text);
      expect(protected_.count).toBe(2);

      const restored = restoreTimestamps(protected_.text, protected_.map);
      expect(restored).toBe(text);
    });

    it('should protect unbracketed timestamps', () => {
      const text = '00:05:23 Hello World 00:10:00';
      const protected_ = protectTimestamps(text);
      expect(protected_.count).toBe(2);

      const restored = restoreTimestamps(protected_.text, protected_.map);
      expect(restored).toBe(text);
    });
  });

  describe('normalizeText (main function)', () => {
    it('should apply all normalizations by default', () => {
      const text = '\uFEFF  Hello   World  \n\n\n\n\nTest';
      const result = normalizeText(text);
      expect(result.text).toBe('Hello World\n\n\nTest');
      expect(result.changeLog.bomRemoved).toBe(1);
      expect(result.originalLength).toBeGreaterThan(result.normalizedLength);
    });

    it('should preserve timestamps', () => {
      const text = '[00:05:23] Hello World';
      const result = normalizeText(text);
      expect(result.text).toContain('[00:05:23]');
      expect(result.changeLog.timestampsProtected).toBe(1);
    });

    it('should return change log with details', () => {
      const text = '\uFEFF  Hello   World  ';
      const result = normalizeText(text);
      expect(result.changeLog).toBeDefined();
      expect(result.changeLog.bomRemoved).toBe(1);
      expect(result.changeLog.whitespaceNormalized).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const result = normalizeText('');
      expect(result.text).toBe('');
      expect(result.originalLength).toBe(0);
    });

    it('should handle null input', () => {
      const result = normalizeText(null);
      expect(result.text).toBe('');
    });

    it('should respect configuration options', () => {
      // Test that removeBOM option controls changelog counting
      // Note: BOM may still be removed by final trim(), but changelog tracks explicit removal
      const textWithBOM = '\uFEFFHello';

      // With removeBOM: true (default), BOM removal is counted
      const resultWithRemoval = normalizeText(textWithBOM, { removeBOM: true });
      expect(resultWithRemoval.changeLog.bomRemoved).toBe(1);

      // With removeBOM: false, BOM removal is NOT counted in changelog
      const resultWithoutRemoval = normalizeText(textWithBOM, { removeBOM: false });
      expect(resultWithoutRemoval.changeLog.bomRemoved).toBe(0);

      // Test whitespace normalization can be disabled
      const textWithSpaces = 'Hello   World';
      const resultNoWhitespaceNorm = normalizeText(textWithSpaces, { normalizeWhitespace: false });
      expect(resultNoWhitespaceNorm.text).toBe('Hello   World');
      expect(resultNoWhitespaceNorm.changeLog.whitespaceNormalized).toBe(0);
    });

    it('should normalize complex Korean lecture transcript', () => {
      const text = '[00:01:23] 오늘  강의에서는  인공지능에 대해   알아보겠습니다.\n\n\n\n그럼 시작하겠습니다.';
      const result = normalizeText(text);
      expect(result.text).toContain('[00:01:23]');
      expect(result.text).not.toContain('  '); // No double spaces
      expect(result.text.split('\n\n\n\n').length).toBe(1); // Collapsed blank lines
    });
  });

  describe('normalizeTextBatch', () => {
    it('should normalize multiple segments', () => {
      const segments = [
        '  Hello  ',
        '  World  '
      ];
      const results = normalizeTextBatch(segments);
      expect(results).toHaveLength(2);
      expect(results[0].text).toBe('Hello');
      expect(results[1].text).toBe('World');
    });
  });

  describe('quickNormalize', () => {
    it('should return only the normalized text string', () => {
      const text = '  Hello   World  ';
      const result = quickNormalize(text);
      expect(typeof result).toBe('string');
      expect(result).toBe('Hello World');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all expected configuration options', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('preserveTimestamps');
      expect(DEFAULT_CONFIG).toHaveProperty('normalizeWhitespace');
      expect(DEFAULT_CONFIG).toHaveProperty('removeControlChars');
      expect(DEFAULT_CONFIG).toHaveProperty('removeBOM');
      expect(DEFAULT_CONFIG).toHaveProperty('handleReplacementChar');
      expect(DEFAULT_CONFIG).toHaveProperty('trimLines');
      expect(DEFAULT_CONFIG).toHaveProperty('collapseBlankLines');
      expect(DEFAULT_CONFIG).toHaveProperty('maxBlankLines');
    });
  });
});
