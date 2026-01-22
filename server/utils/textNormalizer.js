/**
 * Text Normalizer for Lecture Transcripts
 *
 * Provides basic text normalization functions including:
 * 1. UTF-8 NFC normalization
 * 2. Consecutive whitespace consolidation
 * 3. Control character removal (preserving newlines)
 * 4. BOM removal
 * 5. Unicode replacement character handling
 *
 * @module textNormalizer
 */

/**
 * Normalizer configuration options
 * @typedef {Object} NormalizerConfig
 * @property {boolean} [preserveTimestamps=true] - Preserve timestamp patterns
 * @property {boolean} [normalizeWhitespace=true] - Consolidate consecutive spaces
 * @property {boolean} [removeControlChars=true] - Remove control characters
 * @property {boolean} [removeBOM=true] - Remove byte order mark
 * @property {boolean} [handleReplacementChar=true] - Handle unicode replacement chars
 * @property {boolean} [trimLines=true] - Trim whitespace from each line
 * @property {boolean} [collapseBlankLines=true] - Collapse multiple blank lines
 * @property {number} [maxBlankLines=2] - Maximum consecutive blank lines allowed
 */

/**
 * Normalization result
 * @typedef {Object} NormalizationResult
 * @property {string} text - Normalized text
 * @property {Object} changeLog - Details of changes made
 * @property {number} originalLength - Original text length
 * @property {number} normalizedLength - Normalized text length
 */

/**
 * Default configuration for text normalization
 * @type {NormalizerConfig}
 */
const DEFAULT_CONFIG = {
    preserveTimestamps: true,
    normalizeWhitespace: true,
    removeControlChars: true,
    removeBOM: true,
    handleReplacementChar: true,
    trimLines: true,
    collapseBlankLines: true,
    maxBlankLines: 2
};

/**
 * Remove UTF-8 BOM (Byte Order Mark) from text
 * @param {string} text - Input text
 * @returns {Object} Result with text and count of BOMs removed
 */
function removeBOM(text) {
    let count = 0;
    // UTF-8 BOM: \uFEFF
    // UTF-16 LE BOM: \uFFFE
    // UTF-16 BE BOM: \uFEFF (same as UTF-8)
    const bomPattern = /^\uFEFF/;

    if (bomPattern.test(text)) {
        text = text.replace(bomPattern, '');
        count++;
    }

    return { text, count };
}

/**
 * Apply UTF-8 NFC normalization to text
 * Normalizes unicode characters to their canonical composed form
 * @param {string} text - Input text
 * @returns {string} NFC normalized text
 */
function normalizeUTF8NFC(text) {
    // String.prototype.normalize() with 'NFC' converts text to
    // Canonical Decomposition followed by Canonical Composition
    return text.normalize('NFC');
}

/**
 * Remove control characters while preserving newlines and tabs
 * @param {string} text - Input text
 * @returns {Object} Result with text and count of chars removed
 */
function removeControlCharacters(text) {
    let count = 0;

    // Control characters: \x00-\x08, \x0B, \x0C, \x0E-\x1F
    // Preserve: \x09 (tab), \x0A (newline), \x0D (carriage return)
    const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

    const result = text.replace(controlCharPattern, (match) => {
        count++;
        return '';
    });

    return { text: result, count };
}

/**
 * Handle Unicode replacement character (U+FFFD)
 * This character appears when text has encoding issues
 * @param {string} text - Input text
 * @param {string} [replacement=''] - Replacement string
 * @returns {Object} Result with text and count of chars replaced
 */
function handleReplacementCharacter(text, replacement = '') {
    let count = 0;

    const result = text.replace(/\uFFFD/g, () => {
        count++;
        return replacement;
    });

    return { text: result, count };
}

/**
 * Normalize whitespace in text
 * - Consolidates consecutive spaces to single space
 * - Preserves newlines
 * @param {string} text - Input text
 * @returns {Object} Result with text and count of normalizations
 */
function normalizeWhitespace(text) {
    let count = 0;

    // Replace multiple spaces/tabs with single space (not affecting newlines)
    const result = text.replace(/[^\S\n]+/g, (match) => {
        if (match.length > 1) {
            count += match.length - 1;
        }
        return ' ';
    });

    return { text: result, count };
}

/**
 * Trim whitespace from each line
 * @param {string} text - Input text
 * @returns {string} Text with trimmed lines
 */
function trimLines(text) {
    return text.split('\n').map(line => line.trim()).join('\n');
}

/**
 * Collapse multiple consecutive blank lines
 * @param {string} text - Input text
 * @param {number} maxBlankLines - Maximum consecutive blank lines to keep
 * @returns {Object} Result with text and count of lines removed
 */
function collapseBlankLines(text, maxBlankLines = 2) {
    let count = 0;
    const maxNewlines = maxBlankLines + 1;
    const pattern = new RegExp(`\n{${maxNewlines + 1},}`, 'g');

    const result = text.replace(pattern, (match) => {
        count += match.length - maxNewlines;
        return '\n'.repeat(maxNewlines);
    });

    return { text: result, count };
}

/**
 * Normalize carriage returns
 * Converts Windows-style line endings (CRLF) and old Mac-style (CR) to Unix-style (LF)
 * @param {string} text - Input text
 * @returns {string} Text with normalized line endings
 */
function normalizeLineEndings(text) {
    // Convert CRLF to LF, then CR to LF
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Protect timestamp patterns during normalization
 * Returns placeholders and a map to restore them
 * @param {string} text - Input text
 * @returns {Object} Result with text (with placeholders), map, and pattern
 */
function protectTimestamps(text) {
    const map = new Map();
    let counter = 0;

    // Match patterns like [00:00:00], [00:00], 00:00:00, 00:00
    const timestampPattern = /\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g;

    const result = text.replace(timestampPattern, (match) => {
        const placeholder = `__TIMESTAMP_${counter++}__`;
        map.set(placeholder, match);
        return placeholder;
    });

    return { text: result, map, count: counter };
}

/**
 * Restore timestamp patterns from placeholders
 * @param {string} text - Text with placeholders
 * @param {Map} map - Map of placeholders to original values
 * @returns {string} Text with restored timestamps
 */
function restoreTimestamps(text, map) {
    let result = text;

    for (const [placeholder, original] of map) {
        result = result.replace(placeholder, original);
    }

    return result;
}

/**
 * Main text normalization function
 * Applies all normalization steps based on configuration
 *
 * @param {string} text - Input text to normalize
 * @param {NormalizerConfig} [config={}] - Configuration options
 * @returns {NormalizationResult} Normalized text with change log
 *
 * @example
 * const result = normalizeText("Hello\u00A0World  \n\n\n\nTest");
 * console.log(result.text); // "Hello World\n\nTest"
 * console.log(result.changeLog); // { bomRemoved: 0, controlCharsRemoved: 0, ... }
 */
export function normalizeText(text, config = {}) {
    if (!text || typeof text !== 'string') {
        return {
            text: text || '',
            changeLog: {},
            originalLength: text?.length || 0,
            normalizedLength: text?.length || 0
        };
    }

    const cfg = { ...DEFAULT_CONFIG, ...config };
    const changeLog = {
        bomRemoved: 0,
        controlCharsRemoved: 0,
        replacementCharsHandled: 0,
        whitespaceNormalized: 0,
        blankLinesCollapsed: 0,
        timestampsProtected: 0
    };

    const originalLength = text.length;
    let result = text;

    // Step 1: Normalize line endings first
    result = normalizeLineEndings(result);

    // Step 2: Remove BOM
    if (cfg.removeBOM) {
        const bomResult = removeBOM(result);
        result = bomResult.text;
        changeLog.bomRemoved = bomResult.count;
    }

    // Step 3: Protect timestamps if needed
    let timestampMap = null;
    if (cfg.preserveTimestamps) {
        const timestampResult = protectTimestamps(result);
        result = timestampResult.text;
        timestampMap = timestampResult.map;
        changeLog.timestampsProtected = timestampResult.count;
    }

    // Step 4: Apply UTF-8 NFC normalization
    result = normalizeUTF8NFC(result);

    // Step 5: Remove control characters
    if (cfg.removeControlChars) {
        const controlResult = removeControlCharacters(result);
        result = controlResult.text;
        changeLog.controlCharsRemoved = controlResult.count;
    }

    // Step 6: Handle replacement characters
    if (cfg.handleReplacementChar) {
        const replacementResult = handleReplacementCharacter(result);
        result = replacementResult.text;
        changeLog.replacementCharsHandled = replacementResult.count;
    }

    // Step 7: Normalize whitespace
    if (cfg.normalizeWhitespace) {
        const whitespaceResult = normalizeWhitespace(result);
        result = whitespaceResult.text;
        changeLog.whitespaceNormalized = whitespaceResult.count;
    }

    // Step 8: Trim lines
    if (cfg.trimLines) {
        result = trimLines(result);
    }

    // Step 9: Collapse blank lines
    if (cfg.collapseBlankLines) {
        const blankResult = collapseBlankLines(result, cfg.maxBlankLines);
        result = blankResult.text;
        changeLog.blankLinesCollapsed = blankResult.count;
    }

    // Step 10: Restore timestamps
    if (timestampMap) {
        result = restoreTimestamps(result, timestampMap);
    }

    // Final trim
    result = result.trim();

    return {
        text: result,
        changeLog,
        originalLength,
        normalizedLength: result.length
    };
}

/**
 * Batch normalize multiple text segments
 * @param {string[]} segments - Array of text segments
 * @param {NormalizerConfig} [config={}] - Configuration options
 * @returns {NormalizationResult[]} Array of normalization results
 */
export function normalizeTextBatch(segments, config = {}) {
    return segments.map(segment => normalizeText(segment, config));
}

/**
 * Quick normalize function for simple use cases
 * Returns only the normalized text string
 * @param {string} text - Input text
 * @returns {string} Normalized text
 */
export function quickNormalize(text) {
    return normalizeText(text).text;
}

// Export individual functions for testing and selective use
export {
    removeBOM,
    normalizeUTF8NFC,
    removeControlCharacters,
    handleReplacementCharacter,
    normalizeWhitespace,
    trimLines,
    collapseBlankLines,
    normalizeLineEndings,
    protectTimestamps,
    restoreTimestamps,
    DEFAULT_CONFIG
};
