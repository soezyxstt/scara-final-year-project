import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getRunWithData, updateRunAiSuggestion } from '@/lib/db/queries'
import { generateContentStreamWithFallback } from '@/lib/ai-client'
import { fetchKVValue, writeKVValue } from '@/lib/cloudflare-services'

// Downsample telemetry to ~60 evenly spaced samples to reduce token cost and respect free tier rate limits
function downsampleSamples(samples: any[], limit: number = 60) {
  if (samples.length <= limit) return samples
  const step = samples.length / limit
  const downsampled = []
  for (let i = 0; i < limit; i++) {
    const idx = Math.floor(i * step)
    downsampled.push(samples[idx])
  }
  return downsampled
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.googleId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: runId } = await params
  const { mode } = await req.json() // explain | diagnose | recommend

  if (!mode || !['explain', 'diagnose', 'recommend'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  // 1. Fetch current run and telemetry samples from local DB (Turso/SQLite)
  const runData = await getRunWithData(runId)
  if (!runData) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const { run, samples } = runData

  // 2. Load historical runs (Layer 5) from Cloudflare KV
  let historyContext = 'No historical runs available.'
  const historyKey = `user:${run.userId}:history`
  try {
    const rawHistory = await fetchKVValue(historyKey)
    if (rawHistory) {
      const historyList = JSON.parse(rawHistory)
      // List parameters and suggestions from the 3 most recent runs
      historyContext = historyList
        .slice(0, 3)
        .map((h: any, idx: number) => {
          return `Run #${idx + 1} (${h.name || 'Unnamed'}):
- Date: ${new Date(h.startedAt).toLocaleString()}
- Gains J1: Kp=${h.kp1}, Ki=${h.ki1}, Kd=${h.kd1}
- Metrics: RMSE J1=${h.rmseJ1?.toFixed(4)} rad, RMSE J2=${h.rmseJ2?.toFixed(4)} rad, Max Err=${h.maxErr?.toFixed(4)} mm, Settling=${h.settlingTime} ms, Chatter=${h.isChattering ? 'YES' : 'NO'}
- Prev Suggestions: "${h.suggestionSummary || 'None'}"`
        })
        .join('\n\n')
    }
  } catch (err) {
    console.error('Failed to load historical runs context:', err)
  }

  // 3. Format telemetry data (Layer 4)
  const decimated = downsampleSamples(samples, 60)
  
  // Format as a compact CSV string
  const csvHeaders = 't(ms),e1(rad),e2(rad),dth1(rad/s),dth2(rad/s),pwm1\n'
  const csvBody = decimated
    .map(s => {
      const t = s.t ?? 0
      const e1 = s.e1?.toFixed(5) ?? '0.00000'
      const e2 = s.e2?.toFixed(5) ?? '0.00000'
      const dth1 = s.dth1?.toFixed(4) ?? '0.0000'
      const dth2 = s.dth2?.toFixed(4) ?? '0.0000'
      const pwm1 = s.pwm1 ?? 0
      return `${t},${e1},${e2},${dth1},${dth2},${pwm1}`
    })
    .join('\n')
  const csvData = csvHeaders + csvBody

  // Parsing gains and parameters
  let gains: any = {}
  try { gains = JSON.parse(run.gainsJson || '{}') } catch {}
  
  let p: any = {}
  try { p = JSON.parse(run.paramsJson || '{}') } catch {}

  // 4. Construct the prompt context layers
  const systemContext = `
Layer 1 — System Context:
- Robot Type: SCARA 2-DOF Planar robot (educational laboratory scale).
- Link Lengths: Link 1 = 100 mm, Link 2 = 70 mm (Total reach/workspace radius: 170 mm).
- Actuators: Joint 1 (base) is driven by a DC Motor; Joint 2 (forearm) is driven by a Stepper Motor.
- Sensors: Potentiometer-based position sensing on both joints (prone to ADC measurement noise, quantization, and calibration variance).
- Available Telemetry: loop duration, joint angles, joint velocities (desired vs actual), joint errors, control efforts, feedforward torque contributions.
`

  const runtimeContext = `
Layer 2 — Runtime Robot Context:
- Platform Purpose: Educational robotics control platform for studying kinematics, trajectory planning, signal processing, and tuning.
- Controller structure: Computed Torque Control (CTC) feedforward + PID feedback loop.
- Dynamic Compensation: Inertia (M), Coriolis (C), and gravity (G) terms computed in real-time on ESP32.
- State Estimation: Backwards-Euler numerical derivative of position potentiometer, filtered using a Tracking Differentiator (TD) instead of direct IIR filters to calculate velocity.
- TD Settings: Bandwidth parameter 'r' determines derivative responsiveness.
- Real-Time Limits: ESP32 control loop frequency up to 500 Hz (loop duration ~2000 µs), high-speed serial at 921600 baud.
`

  const configContext = `
Layer 3 — Current Configuration:
- Gains Joint 1: Kp=${gains.kp1 ?? gains.kp ?? '--'}, Ki=${gains.ki1 ?? gains.ki ?? '--'}, Kd=${gains.kd1 ?? gains.kd ?? '--'}
- Gains Joint 2: Kp=${gains.kp2 ?? '--'}, Ki=${gains.ki2 ?? '--'}, Kd=${gains.kd2 ?? '--'}
- Motion Limits: Cartesian velocity limit (vmax) = ${p.vmax ?? '--'} m/s, Acceleration limit (amax) = ${p.amax ?? '--'} m/s²
- Filters: TD1 Bandwidth (td1r) = ${p.td1r ?? '--'} rad/s, TD2 Bandwidth (td2r) = ${p.td2r ?? '--'} rad/s, TD Step Size (h) = ${p.tdH ?? '--'} s
- Deadband Compensation: PWM deadband offset = ${p.pwmDb ?? '--'} units, Error deadzone = ${p.errDz ?? '--'} rad, Integrator freeze = ${p.integralFreezeThresh ?? '--'} rad
`

  const experimentContext = `
Layer 4 — Experiment Context:
- Run Name: ${run.name}
- Total Samples: ${run.sampleCount ?? samples.length}
- Cartesian Max Error: ${run.maxErr?.toFixed(4) ?? '--'} mm
- Cartesian Mean Error: ${run.meanErr?.toFixed(4) ?? '--'} mm
- End-Effector Final Error: ${run.finalErr?.toFixed(4) ?? '--'} mm
- Joint 1 RMSE: ${run.rmseJ1?.toFixed(4) ?? '--'} rad
- Joint 2 RMSE: ${run.rmseJ2?.toFixed(4) ?? '--'} rad
- EEF RMSE: ${run.rmseEef?.toFixed(4) ?? '--'} mm
- Control effort Max PWM: ${run.pwmMax ?? '--'}

Downsampled Telemetry Samples (CSV):
${csvData}
`

  const histContext = `
Layer 5 — Historical Context (Previous Runs):
${historyContext}
`

  // 5. Setup instructions based on selected Mode
  let systemInstruction = `
You are the AI Control Engineering Copilot. Your purpose is to act as a senior controls engineer reviewing telemetry from a real educational laboratory-scale 2-DOF SCARA robot.
Do NOT try to control the robot directly. Always prioritize measured evidence, never invent data, and never assume parameters unless provided.

CRITICAL FORMATTING RULE:
Do NOT use LaTeX math notation or formatting. Do NOT wrap math in '$' or '$$' symbols. Do NOT use LaTeX commands like '\\approx', '\\cdot', '\\ge', '\\le', '\\text{...}', or '\\%'. 
Instead, write formulas and numbers in plain text using standard UTF-8 math characters (e.g., use '≈', '·', '≥', '≤', '%', 'theta', 'e_1', etc.) so that it renders cleanly in standard markdown.
`

  if (mode === 'explain') {
    systemInstruction += `
MODE: EXPLAIN
Focus on:
- Interpretation of telemetry.
- Education and engineering reasoning.
- Explaining how the physical hardware, sensors, and controller settings combined to produce the observed output.
- Do NOT focus on PID tuning recommendations unless requested. Be concise and evidence-driven.
`
  } else if (mode === 'diagnose') {
    systemInstruction += `
MODE: DIAGNOSE
Focus on:
- Identifying symptoms (overshoot, oscillation, lag, chattering, windup).
- Generating multiple hypotheses (sensor noise, estimation latency, friction, actuator saturation, feedforward mismatch, feedback gains).
- Searching for evidence and contradictory evidence in the telemetry.
- Ranking root causes with confidence levels (%).
Follow this exact output structure:
Symptoms:
...
Evidence:
...
Root Cause Candidates:
1. Candidate A (X%) - Supporting / Contradictory observations
2. Candidate B (Y%) - Supporting / Contradictory observations
`
  } else if (mode === 'recommend') {
    systemInstruction += `
MODE: RECOMMEND
Focus on:
- Providing concrete, justified tuning actions.
- Explaining the expected effects, potential risks, and validation procedure.
Never output a generic "Increase Kp." Instead output:
Recommended Changes:
- [Change Detail]
Reasoning:
- [Why based on telemetry evidence]
Expected Benefits:
- [Detail]
Potential Risks:
- [Detail]
Validation Procedure:
- [Tuning test instructions]

CRITICAL: At the very end of your response, you MUST output a JSON block wrapped in triple backticks with a \`json\` tag. The JSON must contain a "tuning" object listing the commands and numerical values to send to the ESP32. Example:
\`\`\`json
{
  "tuning": {
    "kp1": 1.5,
    "kd1": 0.12,
    "ki1": 0.05
  }
}
\`\`\`
Only include the gains/parameters you recommend changing (e.g., kp1, ki1, kd1, kp2, ki2, kd2, vmax, amax, td1r, td2r, pwmDb). Do not include any other explanation inside the JSON block.
`
  }

  const userPrompt = `
Analyze the following run telemetry and configurations:
${systemContext}
${runtimeContext}
${configContext}
${experimentContext}
${histContext}
`

  // 6. Call Gemini API Stream with Fallback
  try {
    const { stream, modelUsed } = await generateContentStreamWithFallback(
      userPrompt,
      systemInstruction,
      0.1 // Low temperature for analytical consistency
    )

    const encoder = new TextEncoder()
    const customReadableStream = new ReadableStream({
      async start(controller) {
        let aggregatedText = ''
        
        // Write the header with the model used so the client knows
        controller.enqueue(encoder.encode(`[MODEL_USED:${modelUsed}]\n`))

        try {
          for await (const chunk of stream) {
            const text = chunk.text || ''
            aggregatedText += text
            controller.enqueue(encoder.encode(text))
          }

          // Once complete, update local DB with the full text
          await updateRunAiSuggestion(runId, aggregatedText)

          // Also update Cloudflare KV history
          try {
            const rawHistory = await fetchKVValue(historyKey)
            const currentHistory = rawHistory ? JSON.parse(rawHistory) : []
            
            const newHistoryItem = {
              runId,
              name: run.name,
              startedAt: run.startedAt,
              kp1: gains.kp1 ?? gains.kp ?? 0,
              ki1: gains.ki1 ?? gains.ki ?? 0,
              kd1: gains.kd1 ?? gains.kd ?? 0,
              rmseJ1: run.rmseJ1,
              rmseJ2: run.rmseJ2,
              maxErr: run.maxErr,
              settlingTime: run.elapsedTime ? Math.round(run.elapsedTime * 1000) : 0,
              suggestionSummary: aggregatedText.slice(0, 150).replace(/\n/g, ' ') + '...'
            }

            // Keep the 5 most recent runs in history cache
            const updatedHistory = [newHistoryItem, ...currentHistory].slice(0, 5)
            await writeKVValue(historyKey, JSON.stringify(updatedHistory))
          } catch (kvErr) {
            console.error('Failed to update KV history:', kvErr)
          }

          controller.close()
        } catch (streamErr: any) {
          console.error('Error during streaming generation:', streamErr)
          controller.enqueue(encoder.encode(`\n\n[STREAM_ERROR: ${streamErr.message || streamErr}]`))
          controller.close()
        }
      }
    })

    return new Response(customReadableStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      }
    })

  } catch (err: any) {
    console.error('AI Copilot request failed:', err)
    return NextResponse.json({ error: err.message || 'AI Generation failed' }, { status: 500 })
  }
}
