import React from "react"
import { RootCircuit } from "tscircuit"
import Board from "./index.js"
const circuit = new RootCircuit()
circuit.add(<Board />)
async function main() {
  await circuit.renderUntilSettled()
  const json: any[] = circuit.getCircuitJson()
  // look for source_trace created by connectsTo, and any element types referencing nets
  const st = json.filter((e:any)=>e.type==="source_trace")
  console.log("source_trace count:", st.length)
  // Check source_nets and their member ports via source_trace connected_source_port_ids
  const gndNet = json.find((e:any)=>e.type==="source_net" && e.name==="GND")
  console.log("GND net id:", gndNet?.source_net_id)
  // Which source_traces reference the GND net
  const gndTraces = st.filter((t:any)=>t.connected_source_net_ids?.includes(gndNet?.source_net_id))
  console.log("source_traces touching GND net:", gndTraces.length)
  for (const t of gndTraces) console.log("  ", t.source_trace_id, "ports:", t.connected_source_port_ids?.length, "nets:", t.connected_source_net_ids)
  // Does any pcb_plated_hole carry a net hint?
  const phWithNet = json.filter((e:any)=>e.type==="pcb_plated_hole" && (e.subcircuit_connectivity_map_key||e.pcb_port_id))
  console.log("\npcb_plated_hole sample keys:", json.filter((e:any)=>e.type==="pcb_plated_hole").slice(0,2).map((h:any)=>Object.keys(h)).flat().filter((k,i,a)=>a.indexOf(k)===i).join(","))
}
main().catch(e=>{console.error(e);process.exit(1)})
