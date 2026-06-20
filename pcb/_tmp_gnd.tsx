import React from "react"
import { RootCircuit } from "tscircuit"
import Board from "./index.js"
const circuit = new RootCircuit()
circuit.add(<Board />)
async function main() {
  await circuit.renderUntilSettled()
  const json: any[] = circuit.getCircuitJson()
  // Find the GND source_net
  const nets = json.filter((e:any)=>e.type==="source_net")
  const gndNet = nets.find((n:any)=>n.name==="GND")
  console.log("GND source_net:", gndNet?.source_net_id, gndNet?.name)
  // connectivity map keys
  const sps = json.filter((e:any)=>e.type==="source_port")
  const scs = json.filter((e:any)=>e.type==="source_component")
  // Which GND-ish pads exist and their connectivity key
  const gndPins = ["GND","GND_MOT","GND_LOGIC","GND_1","GND_2","GND_3","IN_NEG","OUT_NEG","NEG"]
  // Group ports by subcircuit_connectivity_map_key
  const byKey: Record<string,string[]> = {}
  for (const sp of sps) {
    const sc = scs.find((c:any)=>c.source_component_id===sp.source_component_id)
    const key = sp.subcircuit_connectivity_map_key || "NONE"
    const label = `${sc?.name}.${sp.port_hints?.find((h:string)=>!/^pin|^\d/.test(h))||sp.name}`
    if (!byKey[key]) byKey[key]=[]
    byKey[key].push(label)
  }
  // Find the key with the most members (likely GND via pour) and list GND pads' keys
  console.log("\n=== connectivity key for each GND-type pad ===")
  for (const sp of sps) {
    const sc = scs.find((c:any)=>c.source_component_id===sp.source_component_id)
    const name = sp.port_hints?.find((h:string)=>gndPins.includes(h))
    if (name) {
      console.log(`${(sc?.name+"."+name).padEnd(18)} key=${sp.subcircuit_connectivity_map_key}`)
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
