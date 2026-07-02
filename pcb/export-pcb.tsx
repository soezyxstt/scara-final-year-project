import React from "react"
import { RootCircuit } from "tscircuit"
import Board from "./index.js"
import fs from "fs"
import { execSync } from "child_process"
import path from "path"

const TARGET_DIR = path.join("..", "hmi", "app", "pcb")
const PUBLIC_DIR = path.join("..", "hmi", "public", "pcb")

// Dictionary containing descriptions for reference designators
const REF_METADATA: Record<string, { label: string; desc: string }> = {
  ESP32: {
    label: "ESP32 DevKitC (38-pin)",
    desc: "Main MCU Board socket. Plugs in a 38-pin ESP32 DevKitC module. Handles motor control outputs, encoder inputs, and joint potentiometer ADCs. Built-in USB-UART and 3.3V LDO."
  },
  LM2596: {
    label: "LM2596 Buck Module",
    desc: "DC-DC step-down buck converter (no-LED variant). Regulates 12V input voltage down to 5V to power the ESP32 DevKitC through its 5V pin."
  },
  A4988_SOCKET: {
    label: "A4988 Stepper Driver Carrier (J2)",
    desc: "Pololu-style A4988 driver carrier socket for the Joint 2 stepper. STEP=IO14, DIR=IO12. MS1/MS2/MS3 are hardwired to 3.3V (fixed 1/16 microstep — firmware never toggles them). ENABLE tied to GND (always on); RESET/SLEEP tied together to 3.3V.",
  },
  PWR_IN: {
    label: "12V Power Input Jack",
    desc: "3-pin footprint for a 5.5x2.1mm female DC barrel jack. Feeds 12V raw supply to the A4988 VMOT, the LM2596 buck input, and the J_DC (L298N) breakout."
  },
  STEPPER: {
    label: "Stepper Motor Terminal (J2)",
    desc: "4-pin THT connector for the Joint 2 stepper motor coils (1A, 1B, 2A, 2B). Routed directly from the A4988 driver's coil output pins."
  },
  J_DC: {
    label: "L298N / DC-Motor Breakout (J1)",
    desc: "6-pin header (V12, GND, IN3=IO16, IN4=IO17, ENA=IO18, V5) for an OFF-BOARD L298N H-bridge driving the Joint 1 DC motor. This board carries motor power + control signals only; the H-bridge itself is external."
  },
  POT1: {
    label: "Joint 1 (DC) Potentiometer",
    desc: "3-pin feedback connection (3.3V, WIPER, GND) for the Joint 1 position pot. Wiper routes to ESP32 ADC1 IO39. Brush-EMI filtering is handled entirely by an off-board LPF (no on-board bypass cap on this revision)."
  },
  POT2: {
    label: "Joint 2 (Stepper) Potentiometer",
    desc: "3-pin feedback connection (3.3V, WIPER, GND) for the Joint 2 position pot. Wiper routes to ESP32 ADC1 IO36 (no on-board bypass cap on this revision)."
  },
  ENC: {
    label: "Quadrature Encoder Header",
    desc: "4-pin header (3.3V, GND, ENC_A=IO25, ENC_B=IO26) for the Joint 1 quadrature encoder. New on this revision — adds closed-loop feedback capability. Encoder is read-only; motor power is driven externally via J_DC."
  },
  J_EXP: {
    label: "Expansion Screw Terminal",
    desc: "8-position 3.5mm screw terminal breaking out spare ESP32 pins for future sensors. Pin order (top→bottom): 3V3, GND, IO23, IO22 (I2C SCL), IO21 (I2C SDA), IO19, IO5, IO4 (ADC2) — positions are ordered to match the ESP32 right-column pin sequence so the breakout traces fan out without crossing. All firmware-untouched. NOTE: IO5 is a boot-strapping pin (idles HIGH) — don't hold it LOW at power-on."
  },
  C_BULK: {
    label: "100µF VMOT Bulk Cap",
    desc: "Radial electrolytic bulk capacitor placed directly next to the A4988 power pins to filter high di/dt voltage spikes from the 12V motor supply."
  }
}

// GPIO Mapping Table — matches firmware/include/config.h
const GPIO_MAP = [
  { signal: "Stepper STEP", pin: "IO14", type: "Output", purpose: "Step pulse to A4988 driver (J2)" },
  { signal: "Stepper DIR", pin: "IO12", type: "Output", purpose: "Direction control to A4988 driver (J2)" },
  { signal: "DC Motor IN3", pin: "IO16", type: "Output", purpose: "L298N direction polarity A (J1, via J_DC)" },
  { signal: "DC Motor IN4", pin: "IO17", type: "Output", purpose: "L298N direction polarity B (J1, via J_DC)" },
  { signal: "DC Motor EN", pin: "IO18", type: "Output", purpose: "L298N PWM speed (LEDC duty 0-255)" },
  { signal: "Joint 2 Potentiometer", pin: "IO36", type: "Analog Input", purpose: "Stepper joint feedback (ADC1_CH0)" },
  { signal: "Joint 1 Potentiometer", pin: "IO39", type: "Analog Input", purpose: "DC joint feedback (ADC1_CH3, RC-filtered)" },
  { signal: "Encoder Channel A", pin: "IO25", type: "Digital Input", purpose: "Joint 1 quadrature encoder A (new)" },
  { signal: "Encoder Channel B", pin: "IO26", type: "Digital Input", purpose: "Joint 1 quadrature encoder B (new)" },
  { signal: "Microstep MS1/2/3", pin: "3V3", type: "GPIO", purpose: "Hardwired high on PCB → fixed 1/16 step" },
  { signal: "Expansion (J_EXP)", pin: "21/22/19/23/5/4", type: "GPIO", purpose: "Spare GPIO + I2C on a screw terminal for future sensors (IO5 boot-strap, IO4 ADC2)" }
]

async function exportAll() {
  const start = Date.now()
  console.log("\n[export-pcb] Starting compile & export...")

  try {
    // 1. Compile board to JSON
    const circuit = new RootCircuit()
    circuit.add(<Board />)
    await circuit.renderUntilSettled()
    const json = circuit.getCircuitJson()

    // 2. Parse active components
    const components = (json as any[]).filter(x => x.type === "source_component")
    
    const outputComponents = components.map(c => {
      const meta = REF_METADATA[c.name] || { label: c.name, desc: "Custom component" }
      return {
        ref: c.name,
        label: meta.label,
        description: meta.desc,
        type: c.ftype || c.type
      }
    })

    // Sort components by ref name
    outputComponents.sort((a, b) => a.ref.localeCompare(b.ref))

    const outputData = {
      generatedAt: new Date().toISOString(),
      components: outputComponents,
      gpioMap: GPIO_MAP
    }

    // 3. Write metadata JSON and Circuit JSON
    if (!fs.existsSync(TARGET_DIR)) {
      fs.mkdirSync(TARGET_DIR, { recursive: true })
    }
    fs.writeFileSync(path.join(TARGET_DIR, "pcb-data.json"), JSON.stringify(outputData, null, 2))
    console.log(`[export-pcb] Generated ${path.join(TARGET_DIR, "pcb-data.json")}`)

    // Write circuit.json to public/pcb so the iframe viewer can fetch it as a static asset
    fs.writeFileSync(path.join(PUBLIC_DIR, "circuit.json"), JSON.stringify(json, null, 2))
    console.log(`[export-pcb] Generated ${path.join(PUBLIC_DIR, "circuit.json")}`)

    // 4. Export SVGs
    if (!fs.existsSync(PUBLIC_DIR)) {
      fs.mkdirSync(PUBLIC_DIR, { recursive: true })
    }

    const exports = [
      { format: "schematic-svg", file: "schematic.svg" },
      { format: "pcb-svg", file: "pcb-layout.svg" },
      { format: "assembly-svg", file: "assembly.svg" }
    ]

    for (const exp of exports) {
      const dest = path.join(PUBLIC_DIR, exp.file)
      console.log(`[export-pcb] Exporting ${exp.format} -> ${dest}...`)
      execSync(`npx tscircuit export index.tsx -f ${exp.format} -o "${dest}"`, { stdio: "ignore" })

      if (exp.file === "assembly.svg") {
        console.log(`[export-pcb] Capping font sizes in ${dest}...`)
        let svgContent = fs.readFileSync(dest, "utf8")
        svgContent = svgContent.replace(/font-size="([\d.]+)(px)?"/g, (match, valStr, unit) => {
          const val = parseFloat(valStr)
          const suffix = unit || ""
          if (val > 12) {
            return `font-size="12${suffix}"`
          }
          return match
        })
        fs.writeFileSync(dest, svgContent)
      }

      // Net labels (GND/V12/V5/V3V3 flags) are intentionally kept visible —
      // they are what makes the schematic readable on this revision.
    }

    console.log(`[export-pcb] Success! Completed in ${((Date.now() - start) / 1000).toFixed(2)}s`)
  } catch (err) {
    console.error("[export-pcb] Export failed with error:", err)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isWatch = args.includes("--watch") || args.includes("-w")

  await exportAll()

  if (isWatch) {
    console.log("\n[export-pcb] Watch mode active. Monitoring directory for changes...")
    
    let debounceTimer: NodeJS.Timeout | null = null
    const watchPath = path.resolve(".")

    fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
      // Only trigger on changes to index.tsx or files inside this folder (excluding output files like circuit.json)
      if (!filename || filename.endsWith(".json") || filename.includes("node_modules") || filename.includes(".git")) {
        return
      }

      console.log(`[export-pcb] File change detected: ${filename}`)
      
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(async () => {
        await exportAll()
      }, 300) // 300ms debounce
    })
  }
}

main().catch(console.error)
