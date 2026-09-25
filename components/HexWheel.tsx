import React, { useRef, useState } from 'react';

interface Action {
  key: string;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  actions: Action[];
}

interface DragState {
  pointerId: number;
  lastAngle: number;
  lastTime: number;
  rotation: number;
  velocity: number;
  moved: boolean;
}

const angleAt = (event: React.PointerEvent<HTMLDivElement>): number => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.atan2(event.clientX - bounds.left - bounds.width / 2,
    bounds.top + bounds.height / 2 - event.clientY) * 180 / Math.PI;
};

const isNearCenter = (event: React.PointerEvent<HTMLDivElement>): boolean => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const dx = event.clientX - bounds.left - bounds.width / 2;
  const dy = event.clientY - bounds.top - bounds.height / 2;
  return Math.hypot(dx, dy) < Math.min(bounds.width, bounds.height) * .18;
};

const wrapAngle = (angle: number): number => ((angle + 540) % 360) - 180;

export const HexWheel: React.FC<Props> = ({ actions }) => {
  const [rotation, setRotation] = useState(-8);
  const [settleDuration, setSettleDuration] = useState(0);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    suppressClick.current = false;
    if (isNearCenter(event)) return;
    drag.current = {
      pointerId: event.pointerId, lastAngle: angleAt(event), lastTime: event.timeStamp,
      rotation, velocity: 0, moved: false,
    };
    setSettleDuration(0);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const angle = angleAt(event);
    const delta = wrapAngle(angle - current.lastAngle);
    if (!current.moved && Math.abs(delta) < 3) return;
    if (!current.moved) {
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const elapsed = event.timeStamp - current.lastTime;
    current.rotation += delta;
    current.lastAngle = angle;
    current.lastTime = event.timeStamp;
    if (elapsed > 0) {
      const sample = Math.max(-720, Math.min(720, delta * 1000 / elapsed));
      current.velocity = current.velocity * .65 + sample * .35;
    }
    setRotation(current.rotation);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved) {
      suppressClick.current = true;
      const velocity = event.timeStamp - current.lastTime > 80 ? 0 : current.velocity;
      const distance = Math.sign(velocity) * Math.min(Math.abs(velocity), 720) ** 2 / 1800;
      const destination = Math.round((current.rotation + distance) / 60) * 60;
      const duration = Math.min(850, Math.max(220, Math.abs(destination - current.rotation) * 2.5));
      setSettleDuration(duration);
      setRotation(destination);
    }
    drag.current = null;
  };

  return <div
    className="hex-wheel"
    aria-label="Main actions"
    style={{ transform: `rotate(${rotation}deg)`, transitionDuration: `${settleDuration}ms` }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { drag.current = null; }}
    onClickCapture={event => {
      // Pointer capture retargets a completed drag to the wheel. Guard the
      // action as well if a browser still dispatches the click to a child.
      if (suppressClick.current && event.detail > 0) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    }}
  >
    <svg className="hex-wheel-art" viewBox="0 0 300 280" aria-hidden="true">
      <path d="M75 10H225L300 140L225 270H75L0 140Z" fill="#f1f1f1" />
      <path d="M75 10H225L216 27H84Z" fill="#cc5c57" />
      <path d="M225 10L300 140L280 140L211 28Z" fill="#5f6ec2" />
      <path d="M300 140L225 270L215 252L280 140Z" fill="#f9db00" />
      <path d="M225 270H75L84 253H216Z" fill="#b7cf47" />
      <path d="M75 270L0 140H20L85 252Z" fill="#f48935" />
      <path d="M0 140L75 10L85 28L20 140Z" fill="#4ba5e2" />
      <path d="M150 140L75 10M150 140L225 10M150 140L300 140M150 140L225 270M150 140L75 270M150 140L0 140" stroke="#d0d0d0" strokeWidth="1" />
      <circle cx="150" cy="140" r="48" fill="#f1f1f1" />
    </svg>
    <span className="hex-wheel-center" aria-hidden="true">Hex</span>
    {actions.map(action => <button
      key={action.key}
      type="button"
      className={`hex-wheel-action hex-wheel-${action.key}`}
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.label}
    >{action.icon}<span>{action.label}</span></button>)}
  </div>;
};
