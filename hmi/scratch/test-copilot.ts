/**
 * test-copilot.ts
 *
 * Verification script to test the Google Gen AI client, model fallback sequence,
 * and Cloudflare KV REST API calls.
 *
 * Execute with:
 *   npx tsx hmi/scratch/test-copilot.ts
 */

import fs from 'fs'
import path from 'path'

// Manual .env loader to avoid depending on npm dotenv module
function loadEnvFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      content.split('\n').forEach(line => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return
        const match = trimmed.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          let val = match[2].trim()
          // Remove wrapping quotes if present
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1)
          }
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      })
    }
  } catch (err) {
    console.warn(`Failed to read env file: ${filePath}`, err)
  }
}

// Load env files from typical locations
loadEnvFile(path.resolve(process.cwd(), '.env'))
loadEnvFile(path.resolve(process.cwd(), 'hmi/.env.local'))
loadEnvFile(path.resolve(process.cwd(), 'hmi/.env'))

async function runTests() {
  const { generateContentStreamWithFallback } = await import('../lib/ai-client')
  const { fetchKVValue, writeKVValue } = await import('../lib/cloudflare-services')

  console.log('=== SCARA AI Copilot Verification Test ===\n')

  // Check variables
  const hasGeminiKey = !!(process.env.CF_AIG_TOKEN || process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY)
  const hasAigToken = !!process.env.CF_AIG_TOKEN
  const hasGatewayUrl = !!process.env.CLOUDFLARE_GATEWAY_URL
  const hasCfAccount = !!process.env.CLOUDFLARE_ACCOUNT_ID
  const hasCfGateway = !!process.env.CLOUDFLARE_GATEWAY_ID
  const hasCfToken = !!process.env.CLOUDFLARE_API_TOKEN
  const hasCfKv = !!process.env.CLOUDFLARE_KV_NAMESPACE_ID

  console.log('Environment Variables Configured:')
  console.log(`- Google Gen AI Key/Token: ${hasGeminiKey ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare AIG Token:    ${hasAigToken ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare Gateway URL:  ${hasGatewayUrl ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare Account:      ${hasCfAccount ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare Gateway ID:   ${hasCfGateway ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare API Token:    ${hasCfToken ? 'YES' : 'NO'}`)
  console.log(`- Cloudflare KV NS:        ${hasCfKv ? 'YES' : 'NO'}`)
  console.log('')

  if (!hasGeminiKey) {
    console.error('ERROR: CF_AIG_TOKEN, GOOGLE_GENAI_API_KEY or GEMINI_API_KEY is not defined. Cannot run AI client tests.')
    process.exit(1)
  }

  // ── Test 1: Gemini Client & Fallback Chain ──
  console.log('Test 1: Testing Gemini Client & Sequential Fallback Chain...')
  try {
    const testPrompt = 'Respond with exactly: "Hello, senior controls engineer!" to confirm connection.'
    const testInstruction = 'You are a senior control systems engineer reviewing SCARA robot telemetry.'

    console.log('Initiating stream request...')
    const { stream, modelUsed } = await generateContentStreamWithFallback(testPrompt, testInstruction)
    console.log(`Stream started successfully! Model selected: ${modelUsed}`)
    
    let text = ''
    process.stdout.write('Streaming response: ')
    for await (const chunk of stream) {
      const chunkText = chunk.text || ''
      text += chunkText
      process.stdout.write(chunkText)
    }
    console.log('\n- Test 1 passed successfully!\n')
  } catch (err: any) {
    console.error('\n- Test 1 failed:', err.message || err)
    console.log('Note: If this failed with a 404/invalid model name, check if Google AI Studio supports the fallback model names in your region, or if Cloudflare Gateway is misconfigured.\n')
  }

  // ── Test 2: Cloudflare KV Read/Write ──
  if (hasCfAccount && hasCfToken && hasCfKv) {
    console.log('Test 2: Testing Cloudflare KV REST API integration...')
    const testKey = 'test:verify:copilot'
    const testValue = JSON.stringify({
      timestamp: Date.now(),
      status: 'VERIFIED',
      message: 'SCARA AI Copilot verification check'
    })

    try {
      console.log(`Writing test value to key: "${testKey}"...`)
      const writeOk = await writeKVValue(testKey, testValue)
      if (writeOk) {
        console.log('Write succeeded!')
        
        console.log(`Reading back value for key: "${testKey}"...`)
        const readVal = await fetchKVValue(testKey)
        console.log(`Read response: ${readVal}`)
        
        if (readVal === testValue) {
          console.log('- Test 2 passed successfully!\n')
        } else {
          throw new Error('Read value does not match written value.')
        }
      } else {
        throw new Error('KV Write returned false.')
      }
    } catch (err: any) {
      console.error('- Test 2 failed:', err.message || err)
      console.log('Note: Make sure your Cloudflare API Token has "Account -> Cloudflare KV Storage -> Edit" permissions.\n')
    }
  } else {
    console.log('Test 2: Skipping Cloudflare KV test (credentials incomplete).')
    console.log('Make sure to supply CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_KV_NAMESPACE_ID in your environment to use Layer 5 historical learning.\n')
  }

  console.log('=== Verification Completed ===')
}

runTests().catch(console.error)
