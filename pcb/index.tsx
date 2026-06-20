import React from "react"

// ---------------------------------------------------------------------------
// SCARA Controller Board — Manufacturing Revision (firmware-matched)
//
// This board is the ESP32 DevKitC "motherboard". It sockets an A4988 stepper
// carrier and an LM2596 buck module, regulates power, and breaks out the
// potentiometer, encoder and (off-board) L298N control signals.
//
// Pin assignments MATCH firmware/include/config.h 1:1.
// ---------------------------------------------------------------------------

// ---- helpers --------------------------------------------------------------

function pinRow(labels: string[], opts: { x: number; y: number; pitch: number; axis?: "x" | "y" }) {
  const { x, y, pitch, axis = "x" } = opts
  return labels.map((label, i) => (
    <platedhole
      key={`${label}_${i}`}
      portHints={[label]}
      pcbX={axis === "x" ? x + i * pitch : x}
      pcbY={axis === "x" ? y : y + i * pitch}
      holeDiameter="1mm"
      outerDiameter="1.4mm"
      shape="circle"
    />
  ))
}

function Connector(props: {
  name: string
  pcbX: number
  pcbY: number
  schX?: number
  schY?: number
  rows: { labels: string[]; pitch: number; rowOffsetY?: number }[]
  axis?: "x" | "y"
}) {
  const { axis = "x" } = props
  const holes = props.rows.flatMap((r) => {
    const span = (r.labels.length - 1) * r.pitch
    return pinRow(r.labels, {
      x: axis === "x" ? -span / 2 : (r.rowOffsetY ?? 0),
      y: axis === "x" ? (r.rowOffsetY ?? 0) : -span / 2,
      pitch: r.pitch,
      axis
    })
  })
  return (
    <connector
      name={props.name}
      pcbX={props.pcbX}
      pcbY={props.pcbY}
      schX={props.schX}
      schY={props.schY}
      footprint={<footprint>{holes}</footprint>}
    />
  )
}

// ---- footprints -----------------------------------------------------------

const DEVKITC_LEFT = ["3V3", "EN", "IO36", "IO39", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND_1", "IO13", "D2", "D3", "CMD", "5V"]
const DEVKITC_RIGHT = ["GND_2", "IO23", "IO22", "TXD0", "RXD0", "IO21", "GND_3", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "D1", "D0", "CLK"]

function DevKitCSocket(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pitch = 2.54; const rowSpacing = 25.4
  const leftHoles = DEVKITC_LEFT.map((label, i) => <platedhole key={`l_${label}`} portHints={[label]} pcbX={-rowSpacing / 2} pcbY={(DEVKITC_LEFT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.4mm" shape="circle" />)
  const rightHoles = DEVKITC_RIGHT.map((label, i) => <platedhole key={`r_${label}`} portHints={[label]} pcbX={rowSpacing / 2} pcbY={(DEVKITC_RIGHT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.4mm" shape="circle" />)
  return <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{[...leftHoles, ...rightHoles]}</footprint>} />
}

function Lm2596Module(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pinInsetX = 39.497 / 2; const pinOffsetY = 17.145 / 2
  const holeX = 14.986
  const holeY = 8.001

  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["IN_POS"]} pcbX={-pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["IN_NEG"]} pcbX={-pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_POS"]} pcbX={pinInsetX} pcbY={pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />
          <platedhole portHints={["OUT_NEG"]} pcbX={pinInsetX} pcbY={-pinOffsetY} holeDiameter="1.5mm" outerDiameter="2.8mm" shape="circle" />

          <platedhole pcbX={-holeX} pcbY={holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
          <platedhole pcbX={holeX} pcbY={-holeY} holeDiameter="3mm" outerDiameter="4mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={43.18} height={21.082} strokeWidth={0.3} />
    </>
  )
}

function DcPwrJack(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["SW"]} pcbX={-3.0} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["VCC"]} pcbX={3.0} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["GND"]} pcbX={0.0} pcbY={-4.8} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY - 1.5} width={12.0} height={11.0} strokeWidth={0.3} />
    </>
  )
}

function RadialCapacitor(props: { name: string; pcbX: number; pcbY: number; diameter: number; isPolarized?: boolean; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["POS"]} pcbX={-1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.4mm" shape="circle" />
          <platedhole portHints={["NEG"]} pcbX={1.27} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.4mm" shape="circle" />
        </footprint>
      } />
      <silkscreencircle pcbX={props.pcbX} pcbY={props.pcbY} radius={props.diameter / 2} strokeWidth={0.3} />
      {props.isPolarized && <silkscreentext text="+" pcbX={props.pcbX - 2.5} pcbY={props.pcbY + 2.0} fontSize={1.5} anchorAlignment="center" />}
    </>
  )
}

function ScrewTerminal(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number; labels: string[]; axis?: "x" | "y" }) {
  const pitch = 3.5
  const axis = props.axis ?? "x"
  const span = (props.labels.length - 1) * pitch
  const holes = props.labels.map((l, i) => (
    <platedhole
      key={l}
      portHints={[l]}
      pcbX={axis === "x" ? -span / 2 + i * pitch : 0}
      pcbY={axis === "x" ? 0 : span / 2 - i * pitch}
      holeDiameter="1.2mm"
      outerDiameter="2.6mm"
      shape="circle"
    />
  ))
  const bodyW = axis === "x" ? span + 3.5 : 7
  const bodyH = axis === "x" ? 7 : span + 3.5
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{holes}</footprint>} />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={bodyW} height={bodyH} strokeWidth={0.3} />
      {props.labels.map((l, i) => (
        <silkscreentext
          key={`t_${l}`}
          text={l}
          pcbX={axis === "x" ? props.pcbX - span / 2 + i * pitch : props.pcbX - 4.6}
          pcbY={axis === "x" ? props.pcbY + 4.7 : props.pcbY + span / 2 - i * pitch}
          fontSize={0.9}
          anchorAlignment="center"
        />
      ))}
    </>
  )
}

// ---- board -----------------------------------------------------------------

export default () => (
  <board
    width="96mm"
    height="66mm"
    minTraceWidth="0.25mm"
    autorouter={{ traceClearance: "0.25mm" }}
    minTraceToPadEdgeClearance="0.25mm"
  >
    {/* M3 Corner Mounting Holes for Enclosure */}
    <platedhole pcbX={-44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={-44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />

    {/* ZONE 2: BRAIN — ESP32 DevKitC */}
    <DevKitCSocket name="ESP32" pcbX={20} pcbY={0} schX={0} schY={0} />

    {/* ZONE 1: NOISY POWER — Buck + 12V Jack */}
    <Lm2596Module name="LM2596" pcbX={-24.5} pcbY={0} schX={-15} schY={2} />
    <DcPwrJack name="PWR_IN" pcbX={-41} pcbY={19} schX={-15} schY={6} />

    {/* ZONE 1b: STEPPER — A4988 Carrier + Bulk Cap + Output Header */}
    <Connector name="A4988" pcbX={-27} pcbY={-19} schX={-13} schY={-5} rows={[
      { labels: ["ENABLE", "MS1", "MS2", "MS3", "RESET", "SLEEP", "STEP", "DIR"], pitch: 2.54, rowOffsetY: 3.81 },
      { labels: ["VMOT", "GND_MOT", "1B", "1A", "2A", "2B", "VDD", "GND_LOGIC"], pitch: 2.54, rowOffsetY: -3.81 },
    ]} />
    <RadialCapacitor name="C_BULK" pcbX={-43} pcbY={-19} diameter={6.3} isPolarized schX={-15} schY={-9} />
    <Connector name="STEPPER" pcbX={-27} pcbY={-28} schX={-13} schY={-11} rows={[{ labels: ["1B", "1A", "2A", "2B"], pitch: 2.54 }]} />

    {/* ZONE 3: CLEAN ANALOG & SENSOR (Shifted to x=2 for buck and ESP32 isolation) */}
    <Connector name="POT2" pcbX={2} pcbY={13} axis="y" schX={15} schY={2} rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: 2.54 }]} />
    <Connector name="POT1" pcbX={2} pcbY={5} axis="y" schX={15} schY={-4} rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: 2.54 }]} />
    <Connector name="ENC" pcbX={2} pcbY={-5} axis="y" schX={15} schY={6} rows={[{ labels: ["V3V3", "GND", "ENC_A", "ENC_B"], pitch: 2.54 }]} />

    {/* ZONE 4: DC-MOTOR Breakout (L298N) */}
    <ScrewTerminal name="J_DC" pcbX={43} pcbY={-14} axis="y" schX={-2} schY={-9} labels={["V12", "GND", "IN3", "IN4", "ENA", "V5"]} />

    {/* ZONE 5: EXPANSION */}
    <ScrewTerminal name="J_EXP" pcbX={43} pcbY={13} axis="y" schX={4} schY={-12} labels={["V3V3", "GND", "IO21", "IO22", "IO19", "IO23", "IO27", "IO34"]} />

    {/* =========================================================================
        GROUND PLANE — Optimized Asymmetric Notch
        ========================================================================= */}
    <copperpour layer="bottom" connectsTo="net.GND" clearance="0.3mm"
      boundary={[
        { x: 0.5,  y: 29 },   // upper-middle transition
        { x: 42,   y: 29 },   // top-right corner
        { x: 42,   y: -29 },  // bottom-right corner
        { x: -42,  y: -29 },  // bottom-left corner (covers stepper fully)
        { x: -42,  y: -10 },  // lower notch entry (clears A4988)
        { x: 0.5,  y: -10 },  // notch inner floor
        { x: 0.5,  y: 14 },   // notch inner ceiling
        { x: -42,  y: 14 },   // upper notch exit
        { x: -42,  y: 29 },   // top-left corner
      ]}
    />
    <keepout pcbX={-44} pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={-44} pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />

    {/* Silkscreen Labels */}
    <silkscreentext text="ESP32 BRAIN" pcbX={20} pcbY={28} fontSize={1.8} anchorAlignment="center" />
    <silkscreentext text="5V BUCK" pcbX={-24.5} pcbY={0} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="12V IN" pcbX={-41} pcbY={25.5} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="A4988 J2" pcbX={-27} pcbY={-12.5} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="MS=3V3 EN=GND" pcbX={-27} pcbY={-24.5} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="STEPPER" pcbX={-27} pcbY={-31} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="STEP POT" pcbX={2} pcbY={17.2} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="DC POT" pcbX={2} pcbY={9} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="ENCODER" pcbX={2} pcbY={-10.2} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="L298N J1" pcbX={43} pcbY={-25.5} fontSize={1.2} anchorAlignment="center" />
    <silkscreentext text="Adi Haditya Nursyam, M22" pcbX={3} pcbY={-31} fontSize={1.4} anchorAlignment="center" />

    {/* =========================================================================
        POWER RAILS
        ========================================================================= */}
    <trace from=".PWR_IN > .VCC" to="net.V12" thickness="0.8mm" />
    <trace from=".LM2596 > .IN_POS" to="net.V12" thickness="0.8mm" />
    <trace from=".C_BULK > .POS" to="net.V12" thickness="0.8mm" />
    <trace from=".A4988 > .VMOT" to="net.V12" thickness="0.8mm" />
    <trace from=".J_DC > .V12" to="net.V12" thickness="0.8mm" />

    <trace from=".PWR_IN > .GND" to="net.GND" thickness="0.8mm" />
    <trace from=".PWR_IN > .SW" to="net.GND" thickness="0.3mm" />
    <trace from=".LM2596 > .IN_NEG" to="net.GND" thickness="0.8mm" />
    <trace from=".LM2596 > .OUT_NEG" to="net.GND" thickness="0.5mm" />
    <trace from=".C_BULK > .NEG" to="net.GND" thickness="0.8mm" />
    <trace from=".A4988 > .GND_MOT" to="net.GND" thickness="0.8mm" />
    <trace from=".A4988 > .GND_LOGIC" to="net.GND" thickness="0.3mm" />
    <trace from=".A4988 > .ENABLE" to="net.GND" thickness="0.3mm" />
    <trace from=".ESP32 > .GND_1" to="net.GND" thickness="0.4mm" />
    <trace from=".ESP32 > .GND_2" to="net.GND" thickness="0.4mm" />
    <trace from=".ESP32 > .GND_3" to="net.GND" thickness="0.4mm" />
    <trace from=".J_DC > .GND" to="net.GND" thickness="0.8mm" />
    <trace from=".POT1 > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".POT2 > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".ENC > .GND" to="net.GND" thickness="0.3mm" />

    <trace from=".LM2596 > .OUT_POS" to="net.V5" thickness="0.6mm" />
    <trace from=".ESP32 > .5V" to="net.V5" thickness="0.6mm" />
    <trace from=".J_DC > .V5" to="net.V5" thickness="0.5mm" />

    <trace from=".ESP32 > .3V3" to="net.V3V3" thickness="0.4mm" />
    <trace from=".A4988 > .VDD" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS1" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS2" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .MS3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .RESET" to="net.V3V3" thickness="0.3mm" />
    <trace from=".A4988 > .SLEEP" to="net.V3V3" thickness="0.3mm" />
    <trace from=".POT1 > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".POT2 > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".ENC > .V3V3" to="net.V3V3" thickness="0.3mm" />

    {/* =========================================================================
        SIGNALS
        ========================================================================= */}
    <trace from=".A4988 > .1A" to=".STEPPER > .1A" thickness="0.6mm" />
    <trace from=".A4988 > .1B" to=".STEPPER > .1B" thickness="0.6mm" />
    <trace from=".A4988 > .2A" to=".STEPPER > .2A" thickness="0.6mm" />
    <trace from=".A4988 > .2B" to=".STEPPER > .2B" thickness="0.6mm" />

    <trace from=".ESP32 > .IO14" to=".A4988 > .STEP" />
    <trace from=".ESP32 > .IO12" to=".A4988 > .DIR" />

    <trace from=".ESP32 > .IO16" to=".J_DC > .IN3" />
    <trace from=".ESP32 > .IO17" to=".J_DC > .IN4" />
    <trace from=".ESP32 > .IO18" to=".J_DC > .ENA" />

    <trace from=".POT1 > .WIPER" to=".ESP32 > .IO39" />
    <trace from=".POT2 > .WIPER" to=".ESP32 > .IO36" />

    <trace from=".ESP32 > .IO25" to=".ENC > .ENC_A" />
    <trace from=".ESP32 > .IO26" to=".ENC > .ENC_B" />

    <trace from=".J_EXP > .V3V3" to="net.V3V3" thickness="0.3mm" />
    <trace from=".J_EXP > .GND" to="net.GND" thickness="0.3mm" />
    <trace from=".J_EXP > .IO21" to=".ESP32 > .IO21" />
    <trace from=".J_EXP > .IO22" to=".ESP32 > .IO22" />
    <trace from=".J_EXP > .IO19" to=".ESP32 > .IO19" />
    <trace from=".J_EXP > .IO23" to=".ESP32 > .IO23" />
    <trace from=".J_EXP > .IO27" to=".ESP32 > .IO27" />
    <trace from=".J_EXP > .IO34" to=".ESP32 > .IO34" />
  </board>
)
