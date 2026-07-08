import logger from './logger';
import { config } from '../config';

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Execute a function with exponential backoff retry logic.
 * Includes jitter to prevent thundering herd.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = config.sync.maxRetryAttempts,
    baseDelay = config.sync.retryBackoffBase,
    maxDelay = config.sync.maxRetryBackoff,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        logger.error(`All ${maxAttempts} retry attempts exhausted`, {
          error: lastError.message,
        });
        throw lastError;
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 1000;
      const delay = Math.min(exponentialDelay + jitter, maxDelay);

      logger.warn(`Retry attempt ${attempt}/${maxAttempts} after ${Math.round(delay)}ms`, {
        error: lastError.message,
      });

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, 5xx, 429)
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    // Rate limit or server errors
    return status === 429 || status >= 500;
  }

  return false;
}

/**
 * Calculate delay from retry-after header or exponential backoff
 */
export function getRetryDelay(error: any, attempt: number): number {
  // Check for Retry-After header
  if (error.response?.headers?.['retry-after']) {
    const retryAfter = parseInt(error.response.headers['retry-after'], 10);
    if (!isNaN(retryAfter)) {
      return retryAfter * 1000; // Convert seconds to ms
    }
  }

  // Exponential backoff with jitter
  const baseDelay = config.sync.retryBackoffBase;
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.sync.maxRetryBackoff);
}
