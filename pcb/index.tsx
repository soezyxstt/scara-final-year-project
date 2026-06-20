import React from "react"
import {
  HEADER_PIN_PITCH, JST_BODY_OVERHANG, JST_BODY_DEPTH,
  A4988_PIN_PITCH, A4988_ROW_SPACING, A4988_BOARD_WIDTH, A4988_BOARD_HEIGHT,
  LM2596_BOARD_WIDTH, LM2596_BOARD_HEIGHT, LM2596_PIN_SPAN_X, LM2596_PIN_SPAN_Y, LM2596_MOUNT_HOLE_X, LM2596_MOUNT_HOLE_Y,
  DC_JACK_SW_VCC_HALF_SPACING, DC_JACK_GND_Y_OFFSET, DC_JACK_BODY_WIDTH, DC_JACK_BODY_HEIGHT,
  ESP32_DEVKIT_PIN_PITCH, ESP32_DEVKIT_ROW_SPACING, ESP32_DEVKIT_BOARD_WIDTH, ESP32_DEVKIT_BOARD_HEIGHT,
} from "./constants.js"

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

function pinRow(labels: string[], opts: { x: number; y: number; pitch: number; axis?: "x" | "y"; gndLabels?: string[] }) {
  const { x, y, pitch, axis = "x", gndLabels } = opts
  return labels.map((label, i) => (
    <platedhole
      key={`${label}_${i}`}
      portHints={[label]}
      // connectsTo declares net.GND membership WITHOUT routing a copper trace
      // (a routed trace is what broke 0.5mm DRC), so the bottom GND pour ties
      // the pad in directly.
      connectsTo={gndLabels?.includes(label) ? "net.GND" : undefined}
      pcbX={axis === "x" ? x + i * pitch : x}
      pcbY={axis === "x" ? y : y + i * pitch}
      holeDiameter="1mm"
      outerDiameter="1.3mm"
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
  drawJstBody?: boolean
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
  // JST-style body outline (silkscreen only) for single-row connectors.
  // Multi-row connectors (e.g. A4988) draw their own dedicated outline
  // instead — this generic shape only fits one row.
  const showBody = props.drawJstBody && props.rows.length === 1
  const bodySpan = showBody ? (props.rows[0].labels.length - 1) * props.rows[0].pitch + JST_BODY_OVERHANG : 0
  return (
    <>
      <connector
        name={props.name}
        pcbX={props.pcbX}
        pcbY={props.pcbY}
        schX={props.schX}
        schY={props.schY}
        footprint={<footprint>{holes}</footprint>}
      />
      {showBody && (
        <silkscreenrect
          pcbX={props.pcbX}
          pcbY={props.pcbY}
          width={axis === "x" ? bodySpan : JST_BODY_DEPTH}
          height={axis === "x" ? JST_BODY_DEPTH : bodySpan}
          strokeWidth={0.3}
        />
      )}
    </>
  )
}

// ---- footprints -----------------------------------------------------------

const DEVKITC_LEFT = ["3V3", "EN", "IO36", "IO39", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND_1", "IO13", "D2", "D3", "CMD", "5V"]
const DEVKITC_RIGHT = ["GND_2", "IO23", "IO22", "TXD0", "RXD0", "IO21", "GND_3", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "D1", "D0", "CLK"]

function DevKitCSocket(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pitch = ESP32_DEVKIT_PIN_PITCH; const rowSpacing = ESP32_DEVKIT_ROW_SPACING
  const leftHoles = DEVKITC_LEFT.map((label, i) => <platedhole key={`l_${label}`} portHints={[label]} pcbX={-rowSpacing / 2} pcbY={(DEVKITC_LEFT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.3mm" shape="circle" />)
  const rightHoles = DEVKITC_RIGHT.map((label, i) => <platedhole key={`r_${label}`} portHints={[label]} pcbX={rowSpacing / 2} pcbY={(DEVKITC_RIGHT.length - 1) * pitch / 2 - i * pitch} holeDiameter="1mm" outerDiameter="1.3mm" shape="circle" />)
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={<footprint>{[...leftHoles, ...rightHoles]}</footprint>} />
      {/* Module is mounted rotated 90° on this board (pins run vertically,
          spanning the row's pitch*count, with rowSpacing horizontal) — so
          the vendor drawing's width/height are swapped here to match. */}
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={ESP32_DEVKIT_BOARD_HEIGHT} height={ESP32_DEVKIT_BOARD_WIDTH} strokeWidth={0.3} />
    </>
  )
}

function Lm2596Module(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  const pinInsetX = LM2596_PIN_SPAN_X / 2; const pinOffsetY = LM2596_PIN_SPAN_Y / 2
  const holeX = LM2596_MOUNT_HOLE_X
  const holeY = LM2596_MOUNT_HOLE_Y

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
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY} width={LM2596_BOARD_WIDTH} height={LM2596_BOARD_HEIGHT} strokeWidth={0.3} />
    </>
  )
}

function DcPwrJack(props: { name: string; pcbX: number; pcbY: number; schX?: number; schY?: number }) {
  return (
    <>
      <connector name={props.name} pcbX={props.pcbX} pcbY={props.pcbY} schX={props.schX} schY={props.schY} footprint={
        <footprint>
          <platedhole portHints={["SW"]} pcbX={-DC_JACK_SW_VCC_HALF_SPACING} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["VCC"]} pcbX={DC_JACK_SW_VCC_HALF_SPACING} pcbY={0} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
          <platedhole portHints={["GND"]} connectsTo="net.GND" pcbX={0.0} pcbY={-DC_JACK_GND_Y_OFFSET} holeDiameter="2.8mm" outerDiameter="4.0mm" shape="circle" />
        </footprint>
      } />
      <silkscreenrect pcbX={props.pcbX} pcbY={props.pcbY - 1.5} width={DC_JACK_BODY_WIDTH} height={DC_JACK_BODY_HEIGHT} strokeWidth={0.3} />
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
//
// DESIGN-RULE CONSTRAINT (hard 0.5mm fab minimum):
//   Rules below are set to the fab spec: 0.5mm min trace width AND 0.5mm min
//   copper clearance (trace-trace and trace-to-pad).
//
//   `npm run validate` reports ~49 DRC errors, and they are NOT routable away.
//   They are geometric: a trace escaping an INNER pin of a 2.54mm-pitch header
//   (ESP32 DevKitC, A4988, the 0.1" connectors) must pass between two adjacent
//   pads. That channel is 2.54 - 1.3(min pad) = 1.24mm, so a 0.5mm trace clears
//   only (1.24 - 0.5)/2 = 0.37mm < 0.5mm. The pads themselves are fine
//   (1.24mm > 0.5mm); only breakout traces in the channel violate the rule.
//
//   => This through-hole-module layout is INCOMPATIBLE with a hard 0.5mm fab.
//      Resolving it is a ground-up re-layout (every net escapes to open copper
//      and routes AROUND pad rows, never between pins; likely larger board +
//      full manual routing), or a fab/process with finer capability, or SMD
//      parts. It cannot be fixed by changing trace widths or clearances.
//
// Shared component positions (single source of truth so a connector and its
// dedicated silkscreen outline can never drift apart — the A4988 box did).
const A4988_X = -27
const A4988_Y = -16

export default () => (
  <board
    width="96mm"
    height="66mm"
    minTraceWidth="0.5mm"
    autorouter={{ traceClearance: "0.5mm" }}
    minTraceToPadEdgeClearance="0.5mm"
  >
    {/* M3 Corner Mounting Holes for Enclosure */}
    <platedhole pcbX={-44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={-44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />
    <platedhole pcbX={44} pcbY={-30} holeDiameter="3.0mm" outerDiameter="4.0mm" shape="circle" />

    {/* ZONE 2: BRAIN — ESP32 DevKitC */}
    <DevKitCSocket name="ESP32" pcbX={20} pcbY={0} schX={0} schY={0} />

    {/* ZONE 1: NOISY POWER — Buck + 12V Jack */}
    {/* Buck + jack raised (buck 0->3, jack 19->21.5) to open ~3mm of vertical
        room below the buck: the A4988 carrier body (15.24mm) couldn't fit the
        old 13.96mm window between buck-bottom and the STEPPER connector. */}
    <Lm2596Module name="LM2596" pcbX={-24.5} pcbY={3} schX={-15} schY={2} />
    <DcPwrJack name="PWR_IN" pcbX={-41} pcbY={21.5} schX={-15} schY={6} />

    {/* ZONE 1b: STEPPER — A4988 Carrier + Bulk Cap + Output Header
        Pololu-style carrier: 0.6"x0.8" body, 0.1" pin pitch, 0.5" row
        spacing (see constants.ts — the row spacing here was previously
        wrong at 7.62mm; real hardware is 12.7mm).
        pcbY moved -19 -> -16.5: the real A4988 body (15.24mm tall) and the
        STEPPER connector's JST body overlapped by 2.12mm at the old
        position (STEPPER can't move further south, it'd run off the board
        edge). This shift invalidates the manually-routed V12/STEP/DIR
        pcbPath waypoints below, which are anchor-relative to A4988's pcbY —
        they've been recomputed for the new position. */}
    <Connector name="A4988" pcbX={A4988_X} pcbY={A4988_Y} schX={-13} schY={-5} rows={[
      { labels: ["ENABLE", "MS1", "MS2", "MS3", "RESET", "SLEEP", "STEP", "DIR"], pitch: A4988_PIN_PITCH, rowOffsetY: A4988_ROW_SPACING / 2 },
      { labels: ["VMOT", "GND_MOT", "1B", "1A", "2A", "2B", "VDD", "GND_LOGIC"], pitch: A4988_PIN_PITCH, rowOffsetY: -A4988_ROW_SPACING / 2 },
    ]} />
    <silkscreenrect pcbX={A4988_X} pcbY={A4988_Y} width={A4988_BOARD_WIDTH} height={A4988_BOARD_HEIGHT} strokeWidth={0.3} />
    <RadialCapacitor name="C_BULK" pcbX={-43} pcbY={-19} diameter={6.3} isPolarized schX={-15} schY={-9} />
    <Connector name="STEPPER" pcbX={-27} pcbY={-28} schX={-13} schY={-11} drawJstBody rows={[{ labels: ["1B", "1A", "2A", "2B"], pitch: HEADER_PIN_PITCH }]} />

    {/* ZONE 3: CLEAN ANALOG & SENSOR (Shifted to x=2 for buck and ESP32 isolation) */}
    {/* Spaced so the real JST body outlines (9.98mm for the 3-pin POTs,
        12.52mm for the 4-pin ENC) clear each other with ~1.5mm gaps. The
        4-pin ENC is the tall one, so it's dropped lowest. */}
    <Connector name="POT2" pcbX={2} pcbY={17} axis="y" schX={15} schY={2} drawJstBody rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: HEADER_PIN_PITCH }]} />
    <Connector name="POT1" pcbX={2} pcbY={6.5} axis="y" schX={15} schY={-4} drawJstBody rows={[{ labels: ["V3V3", "WIPER", "GND"], pitch: HEADER_PIN_PITCH }]} />
    <Connector name="ENC" pcbX={2} pcbY={-6.5} axis="y" schX={15} schY={6} drawJstBody rows={[{ labels: ["V3V3", "GND", "ENC_A", "ENC_B"], pitch: HEADER_PIN_PITCH }]} />

    {/* ZONE 4: DC-MOTOR Breakout (L298N)
        Pin order chosen so each slot's y roughly matches its ESP32 source
        pin's y (ENA=IO18 y=2.54 highest -> top slot; IN4=IO17 y=-2.54;
        IN3=IO16 y=-5.08; V5 matches ESP32.5V y=-22.86 almost exactly ->
        bottom slot; V12 (from A4988, routed via the south lane) gets the
        next-to-bottom slot so it only needs a short rise instead of
        crossing the whole congested ESP32-fanout corridor). GPIO mapping
        is unchanged — only the physical screw position moved. */}
    <ScrewTerminal name="J_DC" pcbX={43} pcbY={-14} axis="y" schX={-2} schY={-9} labels={["ENA", "IN4", "IN3", "GND", "V12", "V5"]} />

    {/* ZONE 5: EXPANSION */}
    {/* IO27/IO34 (ESP32 LEFT column) remapped to IO5/IO4 (RIGHT column) so the
        expansion nets no longer cross the DIP. IO4 is fully free (ADC2-capable);
        IO5 is a boot-strapping pin (idles HIGH) — fine for a spare, just don't
        hold it LOW at power-on. Both are firmware-untouched. */}
    <ScrewTerminal name="J_EXP" pcbX={43} pcbY={13} axis="y" schX={4} schY={-12} labels={["V3V3", "GND", "IO21", "IO22", "IO19", "IO23", "IO5", "IO4"]} />

    {/* =========================================================================
        GROUND PLANE — Full bottom pour (replaces all explicit GND traces)
        Every GND pad is through-hole, so it ties to this pour directly. This
        removes ~12 top-layer GND traces and the violations they caused, and
        decongests the remaining signal/power routing.
        ========================================================================= */}
    <copperpour layer="bottom" connectsTo="net.GND" clearance="0.5mm"
      boundary={[
        { x: -46, y: 28 },
        { x: 46,  y: 28 },
        { x: 46,  y: -28 },
        { x: -46, y: -28 },
      ]}
    />
    <keepout pcbX={-44} pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={-44} pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />
    <keepout pcbX={44}  pcbY={-30} shape="circle" radius="6mm" layer="bottom" features={{ copper: true }} />

    {/* Silkscreen Labels */}
    <silkscreentext text="ESP32 BRAIN" pcbX={20} pcbY={28} fontSize={1.8} anchorAlignment="center" />
    <silkscreentext text="5V BUCK" pcbX={-24.5} pcbY={3} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="12V IN" pcbX={-41} pcbY={28} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="A4988 J2" pcbX={-27} pcbY={-12.5} fontSize={1.6} anchorAlignment="center" />
    <silkscreentext text="MS=3V3 EN=GND" pcbX={-27} pcbY={-24.5} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="STEPPER" pcbX={-27} pcbY={-31} fontSize={1.3} anchorAlignment="center" />
    <silkscreentext text="STEP POT" pcbX={2} pcbY={21.2} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="DC POT" pcbX={2} pcbY={10.5} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="ENCODER" pcbX={2} pcbY={-13.5} fontSize={1.1} anchorAlignment="center" />
    <silkscreentext text="L298N J1" pcbX={43} pcbY={-25.5} fontSize={1.2} anchorAlignment="center" />
    <silkscreentext text="Adi Haditya Nursyam, M22" pcbX={3} pcbY={-31} fontSize={1.4} anchorAlignment="center" />

    {/* =========================================================================
        POWER RAILS
        ========================================================================= */}
    <trace from=".PWR_IN > .VCC" to="net.V12" thickness="0.8mm" />
    <trace from=".LM2596 > .IN_POS" to="net.V12" thickness="0.8mm" />
    <trace from=".C_BULK > .POS" to="net.V12" thickness="0.8mm" />
    {/* Manually routed (pcbRouteHints are ignored under this board's global
        autorouter mode — pcbPath bypasses the autorouter entirely). Path goes
        via the open south lane (below A4988/STEPPER/ESP32 bottom row, above
        the GND pour boundary), then north through the gap between the ESP32
        right column and J_DC — avoids cutting across pad fields. Converted
        from net-based to an explicit pair (matches what it resolved to
        anyway); other net.V12 members still join the net via their own
        traces below. */}
    {/* Rise segment dropped to the bottom layer via two vias so it physically
        crosses under the V5 trace (different layer = no clearance conflict)
        instead of competing for the same x/y in the congested J_DC corridor. */}
    <trace from=".A4988 > .VMOT" to=".J_DC > .V12" thickness="0.8mm"
      pcbPath={[
        { x: -8.89, y: -11.2 },
        { x: 66, y: -11.2, via: true, toLayer: "bottom" },
        { x: 66, y: -0.25, via: true, toLayer: "top" },
      ]}
    />

    {/* GND: no explicit traces — all GND pads tie to the bottom copper pour.
        ENABLE is GND on this board (A4988 always-enabled); routed to pour too. */}
    {/* Pointed at the nearest local GND pin (GND_MOT, same component, 2.54mm
        away) instead of "net.GND" — the net-based form let the solver pick
        a distant GND-net member (J_EXP.GND) and route across the whole
        board, grazing the ESP32 column tops. GND connectivity is already
        handled by the bottom copper pour either way. */}
    <trace from=".A4988 > .ENABLE" to=".A4988 > .GND_MOT" thickness="0.5mm" />

    <trace from=".LM2596 > .OUT_POS" to="net.V5" thickness="0.6mm" />
    {/* Manual pcbPath (see V12 note above for why). Parallel south lane,
        offset from the V12 lane, clearing the ESP32 right-column CLK pad
        instead of grazing past it. Waypoints are local to the "from" anchor
        (ESP32, pcbX=20 pcbY=0) — i.e. desiredAbsolute - (20, 0). */}
    <trace from=".ESP32 > .5V" to=".J_DC > .V5" thickness="0.6mm"
      pcbPath={[{ x: -10, y: -24.5 }, { x: 15, y: -24.5 }]}
    />

    <trace from=".ESP32 > .3V3" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .VDD" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .MS1" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .MS2" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .MS3" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .RESET" to="net.V3V3" thickness="0.5mm" />
    <trace from=".A4988 > .SLEEP" to="net.V3V3" thickness="0.5mm" />
    {/* V3V3 to the POT/ENC cluster as a clean vertical trunk on the left
        (x=-1, clear of the pads) instead of the autorouter's hairpin, which
        dove from the A4988 feed into ENC.V3V3 (the bottom pad) then doubled
        back up alongside the encoder. Chain: ENC.V3V3 -> POT1.V3V3 ->
        POT2.V3V3 -> net. pcbPath waypoints are anchor-relative (the "from"
        connector: POT1 at (2,6.5), ENC at (2,-6.5)). */}
    <trace from=".POT2 > .V3V3" to="net.V3V3" thickness="0.5mm" />
    <trace from=".POT1 > .V3V3" to=".POT2 > .V3V3" thickness="0.5mm"
      pcbPath={[{ x: -3, y: -2.54 }, { x: -3, y: 7.96 }]} />
    <trace from=".ENC > .V3V3" to=".POT1 > .V3V3" thickness="0.5mm"
      pcbPath={[{ x: -3, y: -3.81 }, { x: -3, y: 10.46 }]} />

    {/* =========================================================================
        SIGNALS
        ========================================================================= */}
    <trace from=".A4988 > .1A" to=".STEPPER > .1A" thickness="0.6mm" />
    <trace from=".A4988 > .1B" to=".STEPPER > .1B" thickness="0.6mm" />
    <trace from=".A4988 > .2A" to=".STEPPER > .2A" thickness="0.6mm" />
    <trace from=".A4988 > .2B" to=".STEPPER > .2B" thickness="0.6mm" />

    {/* Manual pcbPath. STEP is an INNER pin of the A4988 top row (8-pin
        header), so the only legal approach is perpendicular (straight down
        the row's own x), never along the row — and it must come from the
        NORTH: approaching from the south runs into the A4988.VDD pad
        (directly below STEP in the bottom row) and the auto-routed
        VDD-SLEEP jumper that occupies that exact space. Also: crossing the
        ESP32 column must happen south of ALL its pads (y < -22.86) — at any
        y inside its pin range the 2.54mm pitch leaves no legal channel.
        On top of that, the auto-routed SLEEP->V3V3 trace escapes SLEEP
        (STEP's other row-neighbor) on a diagonal that passes directly
        through STEP's own column around y=-13 — topologically unavoidable
        since both must reach/leave the same x. So: escape east of the ESP32
        column, drop to the bottom layer immediately (one via) and STAY
        there for the rest of the run — south lane (avoids the V5 trace,
        which lives in this corridor on top), west under everything, then
        straight up into STEP from the north. Through-hole pads accept
        connections on either layer, so no via back to top is needed.
        Waypoints relative to anchor ESP32 (20, 0). */}
    <trace from=".ESP32 > .IO14" to=".A4988 > .STEP"
      pcbPath={[
        { x: -8, y: -5.08 },
        { x: -8, y: -5.08, via: true, toLayer: "bottom" },
        { x: -8, y: -5.08 },
        { x: -8, y: -26 },
        { x: -35, y: -26 },
        { x: -35, y: -8 },
        { x: -40.65, y: -8 },
      ]}
    />
    {/* Manual pcbPath (same technique as STEP above). After the A4988 row-
        spacing fix, this trace's autorouted path grazed the POT/ENC column
        (0.37mm gap). Anchor is ESP32.IO12 (the "from" port), so the path
        runs IO12 -> ... -> DIR. Escape east of the ESP32 column, drop to
        bottom layer immediately so the rest of the run (south lane,
        crossing the ESP32 column south of its pin range) can't conflict
        with any top-layer trace in this corridor (V5, etc). DIR is the
        row's east-END pin, so unlike STEP this one never needs to travel
        past x=-18.11 — the whole detour stays east of the row/coils/jumper
        entirely (separate south lane, y=-28.5, offset from STEP's y=-26 lane
        to keep clearance from it), then approaches DIR horizontally at its
        own exact y. Waypoints relative to anchor ESP32 (20, 0). */}
    <trace from=".ESP32 > .IO12" to=".A4988 > .DIR"
      pcbPath={[
        { x: -5, y: -7.62 },
        { x: -5, y: -7.62, via: true, toLayer: "bottom" },
        { x: -5, y: -7.62 },
        { x: -5, y: -28.5 },
        { x: -36, y: -28.5 },
        { x: -36, y: -10.15 },
      ]}
    />

    <trace from=".ESP32 > .IO16" to=".J_DC > .IN3" />
    <trace from=".ESP32 > .IO17" to=".J_DC > .IN4" />
    <trace from=".ESP32 > .IO18" to=".J_DC > .ENA" />

    <trace from=".POT1 > .WIPER" to=".ESP32 > .IO39" />
    <trace from=".POT2 > .WIPER" to=".ESP32 > .IO36" />

    <trace from=".ESP32 > .IO25" to=".ENC > .ENC_A" />
    <trace from=".ESP32 > .IO26" to=".ENC > .ENC_B" />

    <trace from=".J_EXP > .V3V3" to="net.V3V3" thickness="0.5mm" />
    <trace from=".J_EXP > .GND" to="net.GND" thickness="0.5mm" />
    <trace from=".J_EXP > .IO21" to=".ESP32 > .IO21" />
    <trace from=".J_EXP > .IO22" to=".ESP32 > .IO22" />
    <trace from=".J_EXP > .IO19" to=".ESP32 > .IO19" />
    <trace from=".J_EXP > .IO23" to=".ESP32 > .IO23" />
    <trace from=".J_EXP > .IO5" to=".ESP32 > .IO5" />
    <trace from=".J_EXP > .IO4" to=".ESP32 > .IO4" />
  </board>
)
