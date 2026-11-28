import playIcon from '../icons/native/play.png';
import settingsIcon from '../icons/native/settings.png';
import replayIcon from '../icons/native/history.png';
import helpIcon from '../icons/native/howtoplay.png';
import accountIcon from '../icons/native/achievements.png';
import onlineIcon from '../icons/native/store.png';
import React, { useRef, useState } from 'react';

const icons: Record<string, string> = { play: playIcon, settings: settingsIcon, replay: replayIcon, help: helpIcon, account: accountIcon, online: onlineIcon };

interface Action {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  actions: Action[];
}

const sectors = ['play', 'settings', 'online', 'replay', 'help', 'account'];
const colors = ['#4ba5e2', '#cc5c57', '#5f6ec2', '#e3bd00', '#93b53d', '#f48935'];

interface DragState {
  pointerId: number;
  action?: Action;
  centerX: number;
  centerY: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  rotation: number;
  moved: boolean;
}

export const HexWheel: React.FC<Props> = ({ actions }) => {
  const [rotation, setRotation] = useState(0);
  const [settleDuration, setSettleDuration] = useState(0);
  const rotor = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    // Catch a spinning wheel at the angle currently on screen.
    const matrix = new DOMMatrix(getComputedStyle(rotor.current!).transform);
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    const key = (event.target as Element).closest('[data-action]')?.getAttribute('data-action');
    const action = actions.find(item => item.key === key && !item.disabled);
    drag.current = { action, centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2,
      pointerId: event.pointerId, startX: x, startY: y, lastX: x, lastY: y,
      lastTime: event.timeStamp, rotation: angle, velocity: 0, moved: false };
    setSettleDuration(0);
    setRotation(angle);
    (event.target as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - current.centerX;
    const y = event.clientY - current.centerY;
    if (!current.moved && Math.hypot(x - current.startX, y - current.startY) <= 10) return;
    current.moved = true;
    event.currentTarget.dataset.dragging = 'true';
    const dx = x - current.lastX, dy = y - current.lastY;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return;
    // Ignore the entire chord when it crosses the hub, even if samples skip over its center.
    const t = Math.max(0, Math.min(1, -(current.lastX * dx + current.lastY * dy) / lengthSquared));
    const distance = Math.hypot(current.lastX + t * dx, current.lastY + t * dy);
    const elapsed = event.timeStamp - current.lastTime;
    if (distance > Math.min(bounds.width, bounds.height) * .15) {
      const delta = Math.atan2(current.lastX * y - current.lastY * x,
        current.lastX * x + current.lastY * y) * 180 / Math.PI;
      current.rotation += delta;
      if (elapsed > 0) {
        const speed = Math.max(-720, Math.min(720, delta * 1000 / elapsed));
        current.velocity += (speed - current.velocity) * (1 - Math.exp(-elapsed / 45));
      }
      setRotation(current.rotation);
    } else {
      current.velocity = 0;
    }
    current.lastX = x;
    current.lastY = y;
    current.lastTime = event.timeStamp;
  };

  const settle = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancelled) onPointerMove(event);
    delete event.currentTarget.dataset.dragging;
    const speed = cancelled || event.timeStamp - current.lastTime > 80 ? 0 : current.velocity;
    const destination = Math.round((current.rotation + speed * Math.abs(speed) / 1800) / 60) * 60;
    setSettleDuration(Math.min(800, Math.max(180, 1000 * Math.sqrt(2 * Math.abs(destination - current.rotation) / 900))));
    setRotation(destination);
    drag.current = null;
    if (!cancelled && !current.moved) current.action?.onClick();
  };

  return <div className="hex-wheel" aria-label="Main actions"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={event => settle(event, false)} onPointerCancel={event => settle(event, true)}
    onLostPointerCapture={event => settle(event, true)}>
    <svg ref={rotor} className="hex-wheel-art" viewBox="-150 -140 300 280"
      style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${settleDuration}ms` }}>
      <path d="M-75 -129.904H75L150 0 75 129.904H-75L-150 0Z" fill="#f1f1f1" />
      {actions.map(action => {
        const index = sectors.indexOf(action.key);
        return <g key={action.key} data-action={action.key} className={`wheel-sector hex-wheel-${action.key}`}
          transform={`rotate(${index * 60})`} role="button" aria-label={action.label}
          aria-disabled={action.disabled || undefined} tabIndex={action.disabled ? -1 : 0}
          onClick={event => { if (!event.detail && !action.disabled) action.onClick(); }}
          onKeyDown={event => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              if (!event.repeat && !action.disabled) action.onClick();
            }
          }}>
          <path className="wheel-wedge" d="M0 0L-75 -129.904H75Z" />
          <path d="M0 0L-63.45 -109.904" stroke="#d0d0d0" strokeWidth=".8" />
          <path d="M-75 -129.904H75L63.45 -109.904H-63.45Z" fill={colors[index]} />
          <text x="0" y="-119" dominantBaseline="central" textAnchor="middle">{action.label}</text>
          <image href={icons[action.key]} x="-17" y="-82" width="34" height="34" />
        </g>;
      })}
      <circle r="40" fill="#f1f1f1" />
    </svg>
    <span className="hex-wheel-center" aria-hidden="true">Hex</span>
  </div>;
};
