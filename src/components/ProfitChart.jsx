import { useState } from 'react';
import { money } from '../format.js';

const W = 320;
const H = 96;
const PAD = 6;

// Running profit after each settled pick, drawn as a plain SVG line, no chart library.
export default function ProfitChart({ picks }) {
  const [hover, setHover] = useState(null);

  const settled = picks
    .filter((p) => p.status !== 'pending' && p.settled_at)
    .sort((a, b) => new Date(a.settled_at) - new Date(b.settled_at));

  if (settled.length < 2) {
    return <div className="chart-empty muted small">Shows after 2 settled picks.</div>;
  }

  let running = 0;
  const points = [{ y: 0, label: 'Start' }].concat(
    settled.map((p) => {
      running += Number(p.payout) - Number(p.stake);
      return { y: running, label: `${p.team} (${p.status})` };
    }),
  );

  const ys = points.map((p) => p.y);
  const min = Math.min(0, ...ys);
  const max = Math.max(0, ...ys);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const up = running >= 0;
  const active = hover ?? points.length - 1;

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  }

  return (
    <div className="chart">
      <div className="chart-label small">
        <span className="muted">{points[active].label}</span>
        <strong className={points[active].y >= 0 ? 'win' : 'loss'}>{money(points[active].y, { sign: true })}</strong>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Profit over ${settled.length} settled picks, now ${money(running, { sign: true })}`}
      >
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="zero" />
        <path d={`${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className={`area ${up ? 'up' : 'down'}`} />
        <path d={line} className={`line ${up ? 'up' : 'down'}`} vectorEffect="non-scaling-stroke" />
        <circle cx={x(active)} cy={y(points[active].y)} r="3.5" className={`dot ${up ? 'up' : 'down'}`} />
      </svg>
    </div>
  );
}
