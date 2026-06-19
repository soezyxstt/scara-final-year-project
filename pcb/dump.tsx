import React from "react"
import { RootCircuit } from "tscircuit"
import Board from "./index.js"
import fs from "fs"

const circuit = new RootCircuit()
circuit.add(<Board />)

async function main() {
  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()
  fs.writeFileSync("circuit.json", JSON.stringify(json, null, 2))
  console.log("Dumped circuit.json")
}

main().catch(console.error)
