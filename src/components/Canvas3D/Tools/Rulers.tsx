import React, { useEffect, useState } from 'react';
import type { CameraParams } from '../../../types';
import { getStep, formatValue } from '../../../utils/math';

const RULER_THICKNESS = 30;

export const Rulers: React.FC<{
  cameraParams: CameraParams | null;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  leftOffset?: number;
  rightOffset?: number;
  topOffset?: number;
  bottomOffset?: number;
}> = ({ cameraParams, viewportRef, leftOffset = 0, rightOffset = 0, topOffset = 0, bottomOffset = 0 }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [viewportRef]);

  if (!cameraParams || size.width === 0 || size.height === 0) return null;

  const { worldWidth, worldHeight } = cameraParams;
  const hw = worldWidth / 2,
    hh = worldHeight / 2;
  const stepX = getStep(worldWidth, size.width);
  const stepY = getStep(worldHeight, size.height);
  const startX = Math.floor(-hw / stepX) * stepX;
  const endX = Math.ceil(hw / stepX) * stepX;
  const startY = Math.floor(-hh / stepY) * stepY;
  const endY = Math.ceil(hh / stepY) * stepY;

  const ticksX = [];
  for (let v = startX; v <= endX; v += stepX) {
    const x = ((v + hw) / worldWidth) * size.width;
    if (x >= leftOffset + RULER_THICKNESS && x <= size.width - rightOffset) ticksX.push({ value: v, x });
  }
  const ticksY = [];
  for (let v = startY; v <= endY; v += stepY) {
    const y = size.height - ((v + hh) / worldHeight) * size.height;
    if (y >= topOffset && y <= size.height - bottomOffset - RULER_THICKNESS) ticksY.push({ value: v, y });
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15, overflow: 'hidden' }}>
      {/* horizontal ruler */}
      <svg
        width="100%"
        height={RULER_THICKNESS}
        style={{ position: 'absolute', bottom: bottomOffset, left: 0 }}
      >
        <rect
          x={leftOffset}
          width={Math.max(0, size.width - leftOffset - rightOffset)}
          height={RULER_THICKNESS}
          fill="rgba(15,23,42,0.42)"
        />
        <line
          x1={leftOffset}
          y1="0"
          x2={size.width - rightOffset}
          y2="0"
          stroke="rgba(255,255,255,0.36)"
          strokeWidth="1"
        />
        {ticksX.map((t, i) => {
          const halfX = ((t.value - stepX / 2 + hw) / worldWidth) * size.width;
          return (
            <g key={`h-${i}`}>
              {halfX >= leftOffset + RULER_THICKNESS && halfX <= size.width - rightOffset && (
                <line x1={halfX} y1="0" x2={halfX} y2="5" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              )}
              <line x1={t.x} y1="0" x2={t.x} y2="10" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
              <text x={t.x} y="18" fill="rgba(255,255,255,0.78)" fontSize="8" textAnchor="middle" fontFamily="monospace">
                {formatValue(t.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* vertical ruler */}
      <svg width={RULER_THICKNESS} height="100%" style={{ position: 'absolute', top: 0, left: leftOffset }}>
        <rect
          y={topOffset}
          width={RULER_THICKNESS}
          height={Math.max(0, size.height - topOffset - bottomOffset)}
          fill="rgba(15,23,42,0.42)"
        />
        <line
          x1={RULER_THICKNESS}
          y1={topOffset}
          x2={RULER_THICKNESS}
          y2={size.height - bottomOffset}
          stroke="rgba(255,255,255,0.36)"
          strokeWidth="1"
        />
        {ticksY.map((t, i) => {
          const halfY = size.height - ((t.value + stepY / 2 + hh) / worldHeight) * size.height;
          return (
            <g key={`v-${i}`}>
              {halfY >= topOffset && halfY <= size.height - bottomOffset - RULER_THICKNESS && (
                <line
                  x1={RULER_THICKNESS - 5}
                  y1={halfY}
                  x2={RULER_THICKNESS}
                  y2={halfY}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="1"
                />
              )}
              <line
                x1={RULER_THICKNESS - 10}
                y1={t.y}
                x2={RULER_THICKNESS}
                y2={t.y}
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="1"
              />
              <text
                x={RULER_THICKNESS - 5}
                y={t.y + 3}
                fill="rgba(255,255,255,0.8)"
                fontSize="8"
                textAnchor="end"
                dominantBaseline="middle"
                fontFamily="monospace"
              >
                {formatValue(t.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* corner */}
      <svg
        width={RULER_THICKNESS}
        height={RULER_THICKNESS}
        style={{ position: 'absolute', bottom: bottomOffset, left: leftOffset }}
      >
        <rect width={RULER_THICKNESS} height={RULER_THICKNESS} fill="#111827" />
        <line x1={RULER_THICKNESS} y1="0" x2={RULER_THICKNESS} y2={RULER_THICKNESS} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <line x1="0" y1="0" x2={RULER_THICKNESS} y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
};
