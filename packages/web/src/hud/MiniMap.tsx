import { useEffect, useRef } from "react";
import type { Office } from "../types";
import type { BreakSpot, FloorPlan } from "../scene/layout";
import type { NavStore } from "../scene/navigation";
import { forwardOf } from "../scene/navigation";
import { stateColor, teamColor } from "../scene/theme";

// ── Minimap ──────────────────────────────────────────────────
// A north-up plan of the room: pods in their team colour, agents as dots in
// their state colour, and where the camera is looking (or the walker standing).
// Click anywhere to go there.

const W = 196;
const MAX_H = 150;

interface MiniMapProps {
  plan: FloorPlan;
  office: Office;
  breaks: Map<number, BreakSpot>;
  store: NavStore;
  onJump: (x: number, z: number) => void;
}

export function MiniMap({ plan, office, breaks, store, onJump }: MiniMapProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const roomW = plan.maxX + 1 - plan.minX;
  const roomD = plan.maxZ + 1 - plan.minZ;
  const scale = Math.min((W - 12) / roomW, (MAX_H - 12) / roomD);
  const h = Math.round(roomD * scale + 12);
  const ox = (W - roomW * scale) / 2;
  const oz = (h - roomD * scale) / 2;
  const toPx = (x: number, z: number): [number, number] => [ox + (x - plan.minX) * scale, oz + (z - plan.minZ) * scale];

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = W * dpr;
    el.height = h * dpr;
    const ctx = el.getContext("2d")!;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, h);
      // floor
      const [fx, fz] = toPx(plan.minX, plan.minZ);
      ctx.fillStyle = "rgba(217, 199, 172, 0.55)";
      ctx.beginPath();
      ctx.roundRect(fx, fz, roomW * scale, roomD * scale, 3);
      ctx.fill();
      // amenity strips along the back and west walls
      ctx.fillStyle = "rgba(29, 31, 36, 0.06)";
      ctx.fillRect(fx, fz, roomW * scale, (plan.amenities.corridorZ - plan.minZ) * scale);
      ctx.fillRect(fx, fz, -plan.minX * scale, roomD * scale);
      // walls
      ctx.strokeStyle = "rgba(29, 31, 36, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, fz + roomD * scale);
      ctx.lineTo(fx, fz);
      ctx.lineTo(fx + roomW * scale, fz);
      ctx.stroke();
      // pods
      for (const pod of plan.pods) {
        const [px, pz] = toPx(pod.x + 0.25, pod.z);
        const c = teamColor(pod.projectKey);
        ctx.fillStyle = c + "33";
        ctx.strokeStyle = c + "99";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px, pz, (pod.width - 0.5) * scale, pod.depth * scale, 2);
        ctx.fill();
        ctx.stroke();
        for (const d of pod.desks) {
          const [dx, dz] = toPx(d.x, d.z + 0.25);
          if (!d.session) {
            ctx.fillStyle = "rgba(29, 31, 36, 0.18)";
            ctx.fillRect(dx - 2, dz - 1.5, 4, 3);
            continue;
          }
          const spot = breaks.get(d.session.pid);
          const [ax, az] = spot ? toPx(spot.x, spot.z) : [dx, dz];
          ctx.fillStyle = stateColor[d.session.state];
          ctx.beginPath();
          ctx.arc(ax, az, d.session.state === "waiting_on_user" ? 3.4 : 2.6, 0, Math.PI * 2);
          ctx.fill();
          if (d.session.state === "waiting_on_user") {
            ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ax, az, 5.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      // camera
      const p = store.pose;
      const [cx, cz] = toPx(p.x, p.z);
      const [hx, hz] = forwardOf(p.yaw);
      if (p.mode === "walk") {
        const r = 2.6 * scale;
        const a = Math.atan2(hz, hx);
        ctx.fillStyle = "rgba(217, 119, 87, 0.22)";
        ctx.beginPath();
        ctx.moveTo(cx, cz);
        ctx.arc(cx, cz, r, a - 0.6, a + 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d97757";
        ctx.beginPath();
        ctx.arc(cx, cz, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#d97757";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cz);
        ctx.lineTo(cx + hx * 11, cz + hz * 11);
        ctx.stroke();
        ctx.fillStyle = "#d97757";
        ctx.beginPath();
        ctx.moveTo(cx, cz - 5);
        ctx.lineTo(cx + 5, cz);
        ctx.lineTo(cx, cz + 5);
        ctx.lineTo(cx - 5, cz);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    draw();
    store.listeners.add(draw);
    return () => void store.listeners.delete(draw);
    // the plan is rebuilt every office tick; redraw on anything that changes what is drawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, office, breaks, store, h, scale]);

  return (
    <div className="minimap glass" style={{ width: W }} title="Click to go there">
      <canvas
        ref={canvas}
        style={{ width: W, height: h, display: "block" }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = plan.minX + (e.clientX - rect.left - ox) / scale;
          const z = plan.minZ + (e.clientY - rect.top - oz) / scale;
          onJump(x, z);
        }}
      />
    </div>
  );
}
