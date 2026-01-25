/**
 * AI Provider Abstraction Layer
 *
 * Provides a unified interface for AI providers with:
 * - Abstract AIProvider base class
 * - GeminiProvider implementation
 * - Factory function for provider creation
 * - Response validation and error handling
 *
 * @module aiProvider
 */

import { GoogleGenAI, Type } from "@google/genai";

/**
 * AI Provider configuration
 * @typedef {Object} AIProviderConfig
 * @property {string} provider - Provider name ('google')
 * @property {string} model - Model identifier
 * @property {string} apiKey - API key for authentication
 * @property {number} [temperature=0.7] - Generation temperature (0.0-1.0)
 * @property {number} [maxTokens=8192] - Maximum output tokens
 * @property {number} [timeout=60000] - Request timeout in ms
 * @property {number} [maxRetries=3] - Maximum retry attempts
 */

/**
 * Generation request configuration
 * @typedef {Object} GenerationConfig
 * @property {string} prompt - The prompt text
 * @property {Object} [schema] - JSON schema for structured output
 * @property {number} [temperature] - Override default temperature
 * @property {number} [maxTokens] - Override default max tokens
 * @property {string} [systemPrompt] - System instruction
 */

/**
 * Generation response
 * @typedef {Object} GenerationResponse
 * @property {boolean} success - Whether generation succeeded
 * @property {*} data - Parsed response data
 * @property {string} [rawText] - Raw response text
 * @property {Object} [usage] - Token usage information
 * @property {string} [error] - Error message if failed
 * @property {number} [retryCount] - Number of retries attempted
 */

/**
 * Default provider configuration
 * @type {Partial<AIProviderConfig>}
 */
const DEFAULT_CONFIG = {
    temperature: 0.7,
    maxTokens: 8192,
    timeout: 60000,
    maxRetries: 3
};

/**
 * Available models by provider
 * @type {Object}
 */
export const AVAILABLE_MODELS = {
    google: {
        'gemini-2.5-flash': {
            name: 'Gemini 2.5 Flash',
            description: 'Fast and efficient model for most tasks',
            maxTokens: 8192,
            costTier: 'low'
        },
        'gemini-2.5-pro': {
            name: 'Gemini 2.5 Pro',
            description: 'Advanced model for complex reasoning',
            maxTokens: 8192,
            costTier: 'medium'
        }
    }
};

/**
 * Abstract base class for AI providers
 * @abstract
 */
export class AIProvider {
    /**
     * @param {AIProviderConfig} config - Provider configuration
     */
    constructor(config) {
        if (new.target === AIProvider) {
            throw new Error('AIProvider is an abstract class and cannot be instantiated directly');
        }

        this.config = { ...DEFAULT_CONFIG, ...config };
        this.provider = config.provider;
        this.model = config.model;
    }

    /**
     * Generate content using the AI model
     * @abstract
     * @param {GenerationConfig} request - Generation request
     * @returns {Promise<GenerationResponse>} Generation response
     */
    async generateContent(request) {
        throw new Error('generateContent must be implemented by subclass');
    }

    /**
     * Validate a response against expected schema or criteria
     * @param {*} response - Response to validate
     * @param {Object} [schema] - Expected schema
     * @returns {Object} Validation result with isValid and errors
     */
    validateResponse(response, schema) {
        const errors = [];

        if (response === null || response === undefined) {
            errors.push('Response is null or undefined');
            return { isValid: false, errors };
        }

        if (schema && schema.required) {
            for (const field of schema.required) {
                if (!(field in response)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if the provider is properly configured
     * @returns {boolean} Whether provider is ready
     */
    isReady() {
        return Boolean(this.config.apiKey);
    }

    /**
     * Get provider information
     * @returns {Object} Provider metadata
     */
    getInfo() {
        return {
            provider: this.provider,
            model: this.model,
            isReady: this.isReady()
        };
    }
}

/**
 * Google Gemini AI Provider implementation
 * @extends AIProvider
 */
export class GeminiProvider extends AIProvider {
    /**
     * @param {AIProviderConfig} config - Provider configuration
     */
    constructor(config) {
        super({ ...config, provider: 'google' });

        if (!config.apiKey) {
            throw new Error('API key is required for Gemini provider');
        }

        this.client = new GoogleGenAI({ apiKey: config.apiKey });
        this.model = config.model || 'gemini-2.5-flash';
    }

    /**
     * Generate content using Gemini API
     * @param {GenerationConfig} request - Generation request
     * @returns {Promise<GenerationResponse>} Generation response
     */
    async generateContent(request) {
        const { prompt, schema, temperature, maxTokens, systemPrompt } = request;

        let retryCount = 0;
        const maxRetries = this.config.maxRetries;

        while (retryCount <= maxRetries) {
            try {
                const contents = [
                    { role: "user", parts: [{ text: prompt }] }
                ];

                const generationConfig = {
                    temperature: temperature ?? this.config.temperature,
                    maxOutputTokens: maxTokens ?? this.config.maxTokens
                };

                // Add structured output config if schema provided
                if (schema) {
                    generationConfig.responseMimeType = "application/json";
                    generationConfig.responseSchema = schema;
                }

                const requestOptions = {
                    model: this.model,
                    contents,
                    config: generationConfig
                };

                // Add system instruction if provided
                if (systemPrompt) {
                    requestOptions.systemInstruction = systemPrompt;
                }

                const response = await this.client.models.generateContent(requestOptions);

                if (!response.text) {
                    throw new Error('Empty response from Gemini API');
                }

                const rawText = response.text;
                let data;

                // Parse JSON response if schema was provided
                if (schema) {
                    try {
                        let cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                        // Find the first '{' and last '}' to handle extra text
                        const firstBrace = cleanText.indexOf('{');
                        const lastBrace = cleanText.lastIndexOf('}');
                        
                        if (firstBrace !== -1 && lastBrace !== -1) {
                            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
                        }
                        
                        data = JSON.parse(cleanText);
                    } catch (e) {
                        console.warn('JSON Parse Error:', e.message);
                        console.warn('Raw Text Preview:', rawText.substring(0, 200) + '...');
                        throw new Error(`Failed to parse JSON response: ${e.message}`);
                    }
                } else {
                    data = rawText;
                }

                // Validate response if schema provided
                if (schema) {
                    const validation = this.validateResponse(data, schema);
                    if (!validation.isValid) {
                        console.warn('Response validation warnings:', validation.errors);
                    }
                }

                return {
                    success: true,
                    data,
                    rawText,
                    retryCount,
                    usage: {
                        // Note: Gemini API may provide usage info in response metadata
                        model: this.model
                    }
                };

            } catch (error) {
                retryCount++;

                const isRetryable = this.isRetryableError(error);

                if (retryCount > maxRetries || !isRetryable) {
                    console.error(`Gemini API error (attempt ${retryCount}):`, error.message);
                    return {
                        success: false,
                        data: null,
                        error: error.message,
                        retryCount
                    };
                }

                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
                console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
                await this.sleep(delay);
            }
        }

        return {
            success: false,
            data: null,
            error: 'Max retries exceeded',
            retryCount
        };
    }

    /**
     * Check if an error is retryable
     * @param {Error} error - The error to check
     * @returns {boolean} Whether error is retryable
     */
    isRetryableError(error) {
        const retryablePatterns = [
            'rate limit',
            'quota exceeded',
            'timeout',
            'network',
            'ECONNRESET',
            'ETIMEDOUT',
            '503',
            '429',
            'overloaded'
        ];

        const message = error.message.toLowerCase();
        return retryablePatterns.some(pattern => message.includes(pattern.toLowerCase()));
    }

    /**
     * Sleep helper function
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate content with structured output schema
     * Convenience method for common use case
     * @param {string} prompt - The prompt text
     * @param {Object} schema - JSON schema for output
     * @param {Object} [options] - Additional options
     * @returns {Promise<GenerationResponse>}
     */
    async generateStructured(prompt, schema, options = {}) {
        return this.generateContent({
            prompt,
            schema,
            ...options
        });
    }

    /**
     * Simple text generation without structured output
     * @param {string} prompt - The prompt text
     * @param {Object} [options] - Additional options
     * @returns {Promise<GenerationResponse>}
     */
    async generateText(prompt, options = {}) {
        return this.generateContent({
            prompt,
            ...options
        });
    }
}

/**
 * Factory function to create AI provider instances
 * @param {AIProviderConfig} config - Provider configuration
 * @returns {AIProvider} Configured AI provider instance
 * @throws {Error} If provider is not supported
 */
export function createAIProvider(config) {
    const { provider } = config;

    switch (provider) {
        case 'google':
            return new GeminiProvider(config);

        // Future providers can be added here
        // case 'openai':
        //     return new OpenAIProvider(config);
        // case 'anthropic':
        //     return new AnthropicProvider(config);

        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

/**
 * Get default configuration for a provider
 * @param {string} provider - Provider name
 * @returns {Partial<AIProviderConfig>} Default configuration
 */
export function getDefaultConfig(provider) {
    const defaults = {
        google: {
            provider: 'google',
            model: 'gemini-2.5-flash',
            temperature: 0.7,
            maxTokens: 8192
        }
    };

    return defaults[provider] || {};
}

/**
 * Validate provider configuration
 * @param {AIProviderConfig} config - Configuration to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateConfig(config) {
    const errors = [];

    if (!config.provider) {
        errors.push('Provider is required');
    }

    if (!config.apiKey) {
        errors.push('API key is required');
    }

    if (config.provider && !AVAILABLE_MODELS[config.provider]) {
        errors.push(`Unknown provider: ${config.provider}`);
    }

    if (config.provider && config.model) {
        const providerModels = AVAILABLE_MODELS[config.provider];
        if (providerModels && !providerModels[config.model]) {
            errors.push(`Unknown model for ${config.provider}: ${config.model}`);
        }
    }

    if (config.temperature !== undefined) {
        if (config.temperature < 0 || config.temperature > 1) {
            errors.push('Temperature must be between 0 and 1');
        }
    }

    if (config.maxTokens !== undefined) {
        if (config.maxTokens < 1) {
            errors.push('Max tokens must be at least 1');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// Export Type for schema definitions (re-export from @google/genai)
export { Type };
