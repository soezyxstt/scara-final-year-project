import React from "react"
import { RootCircuit } from "tscircuit"
import Board from "./index.js"

const circuit = new RootCircuit()
circuit.add(<Board />)

async function main() {
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  console.log("Total circuit-json elements:", json.length)
  const errors = (json as any[]).filter((e) => e.type?.includes("error"))
  console.log("ERROR COUNT:", errors.length)
  for (const e of errors) {
    console.log("-", e.type, "|", e.message ?? JSON.stringify(e))
  }
  if (errors.length === 0) {
    console.log("PASS: board.tsx has zero DRC/connectivity errors")
  }
}

main().catch((err) => {
  console.error("VALIDATION FAILED:", err)
  process.exit(1)
})
