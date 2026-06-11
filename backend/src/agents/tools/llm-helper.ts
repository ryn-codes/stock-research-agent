import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Invokes a LangChain LLM with automatic retries and exponential backoff
 * to handle transient API issues (e.g. 503 Service Unavailable, 429 Rate Limits).
 */
export async function invokeWithRetry(
  llm: BaseChatModel,
  messages: any,
  retries = 3,
  delay = 2000,
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await llm.invoke(messages);
    } catch (err: any) {
      const errMsg = err.message || String(err);
      console.warn(`[LLM Invoke] Attempt ${attempt} failed: ${errMsg}`);
      
      if (attempt === retries) {
        throw err;
      }
      
      const waitTime = delay * Math.pow(2, attempt - 1);
      console.log(`[LLM Invoke] Waiting ${waitTime}ms before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Sanitizes a JSON string by escaping raw control characters (ASCII 0-31)
 * inside string literals (e.g. raw newlines, carriage returns, tabs).
 */
export function sanitizeJsonString(jsonStr: string): string {
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const code = char.charCodeAt(0);

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
        result += char;
      } else {
        if (code < 32) {
          // It's a control character inside a string literal. Escape it!
          if (char === '\n') {
            result += '\\n';
          } else if (char === '\r') {
            result += '\\r';
          } else if (char === '\t') {
            result += '\\t';
          } else {
            // Hex escape for other control characters
            const hex = code.toString(16).padStart(4, '0');
            result += `\\u${hex}`;
          }
        } else {
          result += char;
        }
        isEscaped = false;
      }
    } else {
      result += char;
      isEscaped = false;
    }
  }

  return result;
}
