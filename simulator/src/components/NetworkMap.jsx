// frontend-react/src/components/NetworkMap.jsx
// SentinelGraph MVP – Network Map (w-2/3)
// D3 v7 force-directed graph.
// • Blue   = Account node
// • Purple = Device node
// • Red    = Flagged/mule account
// • Orange = Cashout Boss
// Arrow edges show transfer direction. Drag, zoom, pan supported.

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

const R     = { account: 8, device: 5 };
const COLOR = { account: "#3b82f6", device: "#a855f7", flagged: "#ef4444", cashout: "#f97316" };

function nodeColor(d) {
  if (d.group === "device")           return COLOR.device;
  if (d.id?.startsWith("CASHOUT"))    return COLOR.cashout;
  if (d.flagged)                      return COLOR.flagged;
  return COLOR.account;
}

export default function NetworkMap({ nodes = [], edges = [] }) {
  const svgRef     = useRef(null);
  const tipRef     = useRef(null);
  const simRef     = useRef(null);

  const draw = useCallback(() => {
    if (!svgRef.current) return;
    const wrap = svgRef.current.parentElement;
    const W = wrap.clientWidth  || 800;
    const H = wrap.clientHeight || 600;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);

    // Arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arr").attr("viewBox", "0 -4 8 8")
      .attr("refX", 16).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "rgba(99,102,241,0.5)");

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.1, 4])
      .on("zoom", (e) => g.attr("transform", e.transform)));

    // Compute node flags from edge degrees
    const nodeMap = new Map(nodes.map((n) => [n.id, { ...n }]));
    const inDeg   = new Map();
    const outDeg  = new Map();
    edges.forEach((e) => {
      outDeg.set(e.source, (outDeg.get(e.source) || 0) + 1);
      inDeg.set(e.target,  (inDeg.get(e.target)  || 0) + 1);
    });
    nodeMap.forEach((n, id) => {
      if (n.group === "account") {
        const i = inDeg.get(id) || 0, o = outDeg.get(id) || 0;
        if (i > 0 && o > 0 && o / (i + o) > 0.6) n.flagged = true;
      }
    });

    const nodeData = [...nodeMap.values()];
    const linkData = edges.map((e) => ({
      ...e,
      source: nodeMap.get(e.source) ?? e.source,
      target: nodeMap.get(e.target) ?? e.target,
    }));

    if (simRef.current) simRef.current.stop();
    simRef.current = d3.forceSimulation(nodeData)
      .force("link",    d3.forceLink(linkData).id((d) => d.id).distance(80))
      .force("charge",  d3.forceManyBody().strength(-200))
      .force("center",  d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(14));

    // Edges
    const link = g.append("g").selectAll("line").data(linkData).join("line")
      .attr("stroke", "rgba(99,102,241,0.35)")
      .attr("stroke-width", (d) => Math.min(3, Math.sqrt(d.weight || 1) * 0.3 + 0.5))
      .attr("marker-end", "url(#arr)");

    // Nodes
    const tip = d3.select(tipRef.current);

    const node = g.append("g").selectAll("circle").data(nodeData).join("circle")
      .attr("r",            (d) => R[d.group] || 7)
      .attr("fill",         nodeColor)
      .attr("stroke",       (d) => d.flagged ? "#fbbf24" : "rgba(255,255,255,0.12)")
      .attr("stroke-width", (d) => d.flagged ? 2 : 1)
      .style("cursor", "pointer")
      .on("mouseenter", (ev, d) => {
        const lines = [
          d.group === "device" ? "🖥 Device" : d.flagged ? "🚨 FLAGGED" : "👤 Account",
          d.id,
        ];
        tip.style("display", "block")
           .style("left", `${ev.offsetX + 12}px`)
           .style("top",  `${ev.offsetY - 10}px`)
           .html(lines.join("<br/>"));
      })
      .on("mousemove", (ev) => tip.style("left", `${ev.offsetX+12}px`).style("top", `${ev.offsetY-10}px`))
      .on("mouseleave", () => tip.style("display", "none"))
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) simRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => { if (!ev.active) simRef.current.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Labels for flagged / cashout only
    g.append("g").selectAll("text")
      .data(nodeData.filter((d) => d.flagged || d.id?.startsWith("CASHOUT")))
      .join("text")
      .attr("text-anchor", "middle").attr("dy", -12)
      .attr("font-size", "9px").attr("fill", "#fbbf24")
      .attr("pointer-events", "none")
      .text((d) => d.id.length > 14 ? d.id.slice(0, 13) + "…" : d.id);

    simRef.current.on("tick", () => {
      link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
    });
  }, [nodes, edges]);

  useEffect(() => { draw(); return () => simRef.current?.stop(); }, [draw]);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (svgRef.current?.parentElement) ro.observe(svgRef.current.parentElement);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div className="relative w-full h-full bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">🕸 Money Mule Network</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {[["bg-blue-500","Account"],["bg-purple-500","Device"],["bg-red-500","Flagged"],["bg-orange-500","Cashout"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${c}`}/>{l}
            </span>
          ))}
          <span>{nodes.length} nodes · {edges.length} edges</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
            <span className="text-4xl">🕸</span>
            <p>Run the simulator to populate the graph</p>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
        <div ref={tipRef}
          className="absolute hidden pointer-events-none z-10 bg-gray-800 border
                     border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-100
                     shadow-xl whitespace-pre-wrap"
          style={{ display: "none" }} />
      </div>

      <div className="px-4 py-1 border-t border-gray-800 text-xs text-gray-600">
        Scroll to zoom · drag to pan · drag nodes to reposition
      </div>
    </div>
  );
}