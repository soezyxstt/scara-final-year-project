/**
 * ai-client.ts
 *
 * Client initialization and fallback helper for Google Gen AI.
 * Routes requests through Cloudflare AI Gateway when configured.
 */

import { GoogleGenAI } from '@google/genai'

const GOOGLE_API_KEY = process.env.CF_AIG_TOKEN || process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_GATEWAY_ID = process.env.CLOUDFLARE_GATEWAY_ID
const CF_GATEWAY_URL = process.env.CLOUDFLARE_GATEWAY_URL

// Models listed in preference order. Iterates sequentially if rate limited.
const MODEL_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemma-2-9b-it',
  'gemma-2-27b-it'
]

/**
 * Initializes and returns a GoogleGenAI client instance.
 * Automatically handles Cloudflare AI Gateway URL rewriting if variables are provided.
 */
function getAIClient(): GoogleGenAI {
  if (!GOOGLE_API_KEY) {
    throw new Error('Missing CF_AIG_TOKEN, GOOGLE_GENAI_API_KEY, or GEMINI_API_KEY in environment.')
  }

  const options: any = { apiKey: GOOGLE_API_KEY }

  const headers: Record<string, string> = {}
  const token = process.env.CF_AIG_TOKEN || process.env.CLOUDFLARE_API_TOKEN
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (CF_GATEWAY_URL) {
    options.httpOptions = {
      baseUrl: CF_GATEWAY_URL,
      headers
    }
  } else if (CF_ACCOUNT_ID && CF_GATEWAY_ID) {
    options.httpOptions = {
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_ID}/google-ai-studio`,
      headers
    }
  }

  return new GoogleGenAI(options)
}

/**
 * Executes a streaming generation with model fallback on rate limits (429) or service outages.
 */
export async function generateContentStreamWithFallback(
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.2
) {
  const ai = getAIClient()
  let lastError: any = null

  for (const model of MODEL_CHAIN) {
    try {
      console.log(`[AI Copilot] Trying model: ${model}`)
      const stream = await ai.models.generateContentStream({
        model: model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature,
        }
      })

      // Verify if the stream is readable (first chunk test happens implicitly on return)
      return { stream, modelUsed: model }
    } catch (err: any) {
      console.warn(`[AI Copilot] Model ${model} failed. Error:`, err.message || err)
      lastError = err
      // Continue to try the next model in the chain
    }
  }

  throw new Error(`All models in the fallback chain failed. Last error: ${lastError?.message || lastError}`)
}
