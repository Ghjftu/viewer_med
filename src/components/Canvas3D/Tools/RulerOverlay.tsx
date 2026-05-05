import React from 'react';
import type { Drawing, TextNote, ToolType, Point } from '../../../types/tools';

interface RulerOverlayProps {
  drawings: Drawing[];
  textNotes: TextNote[];
  activeTool: ToolType;
  currentPoints: Point[];
  svgRef: React.RefObject<SVGSVGElement | null>;
  sectionLinePoints?: Point[];
}

export const RulerOverlay: React.FC<RulerOverlayProps> = ({
  drawings,
  textNotes,
  activeTool,
  currentPoints,
  svgRef,
  sectionLinePoints = [],
}) => {
  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
        touchAction: 'none',
      }}
    >
      {drawings.map((drawing, idx) => {
        if (drawing.type === 'ruler') {
          const lastPoint = drawing.points[drawing.points.length - 1];
          return (
            <g key={idx}>
              <path
                d={`M ${drawing.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                stroke="#3b82f6"
                strokeWidth="2"
                fill="none"
              />
              {drawing.points.map((point, pointIdx) => (
                <circle key={pointIdx} cx={point.x} cy={point.y} r={3} fill="#3b82f6" stroke="white" strokeWidth="1" />
              ))}
              <text x={lastPoint.x + 10} y={lastPoint.y} fill="#3b82f6" fontSize="16" fontWeight="bold">
                {drawing.value} mm
              </text>
            </g>
          );
        }
        if (drawing.type === 'circle') {
          if (drawing.points.length < 3) return null;
          const [p1, p2, p3] = drawing.points;
          const det = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
          if (Math.abs(det) < 1e-10) return null;
          const s1 = p1.x * p1.x + p1.y * p1.y;
          const s2 = p2.x * p2.x + p2.y * p2.y;
          const s3 = p3.x * p3.x + p3.y * p3.y;
          const cx = (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / det;
          const cy = (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / det;
          const r = Math.hypot(p1.x - cx, p1.y - cy);
          return (
            <g key={idx}>
              <circle cx={cx} cy={cy} r={r} stroke="#ef4444" strokeWidth="2" fill="none" />
              <text
                x={cx}
                y={cy}
                fill="#ef4444"
                fontSize="16"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                Ø {drawing.value}
              </text>
            </g>
          );
        }
        if (drawing.type === 'brush') {
          return (
            <path
              key={idx}
              d={`M ${drawing.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
              stroke="red"
              strokeWidth="2"
              fill="none"
            />
          );
        }
        if (drawing.type === 'angle') {
          return (
            <g key={idx}>
              <line
                x1={drawing.points[0].x}
                y1={drawing.points[0].y}
                x2={drawing.points[1].x}
                y2={drawing.points[1].y}
                stroke="yellow"
                strokeWidth="2"
              />
              <line
                x1={drawing.points[1].x}
                y1={drawing.points[1].y}
                x2={drawing.points[2].x}
                y2={drawing.points[2].y}
                stroke="yellow"
                strokeWidth="2"
              />
              <text x={drawing.points[1].x + 10} y={drawing.points[1].y - 10} fill="yellow" fontSize="16">
                {drawing.value}°
              </text>
            </g>
          );
        }
        if (drawing.type === 'text') {
          const note = textNotes.find((n) => n.id === drawing.textId);
          return (
            <g key={idx}>
              <line
                x1={drawing.target.x}
                y1={drawing.target.y}
                x2={drawing.labelPos.x}
                y2={drawing.labelPos.y}
                stroke={drawing.color}
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <circle cx={drawing.target.x} cy={drawing.target.y} r={3} fill={drawing.color} />
              <text
                x={drawing.labelPos.x}
                y={drawing.labelPos.y}
                fill={drawing.color}
                fontSize={drawing.fontSize}
                fontFamily="Arial"
                fontWeight="bold"
                alignmentBaseline="middle"
              >
                {note ? String(drawing.textId) : '?'}
              </text>
            </g>
          );
        }
        return null;
      })}

      {/* Текущие точки */}
      {activeTool === 'ruler' && currentPoints.length > 0 && (
        <>
          {currentPoints.length > 1 && (
            <path
              d={`M ${currentPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
              stroke="#3b82f6"
              strokeWidth="2"
              fill="none"
              strokeDasharray="4 4"
            />
          )}
          {currentPoints.map((point, idx) => (
            <circle key={idx} cx={point.x} cy={point.y} r={3} fill="#3b82f6" stroke="white" strokeWidth="1" />
          ))}
        </>
      )}
      {activeTool === 'circle' && currentPoints.length > 0 && (
        <>
          {currentPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill="red" stroke="white" strokeWidth="1" />
          ))}
          {currentPoints.length === 2 && (
            <line
              x1={currentPoints[0].x}
              y1={currentPoints[0].y}
              x2={currentPoints[1].x}
              y2={currentPoints[1].y}
              stroke="red"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}
        </>
      )}
      {activeTool === 'angle' &&
        currentPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="yellow" />)}
      {activeTool === 'brush' && currentPoints.length > 0 && (
        <path
          d={`M ${currentPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
          stroke="red"
          strokeWidth="2"
          fill="none"
        />
      )}
      {activeTool === 'text' && currentPoints.length === 1 && (
        <>
          <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="#ff0000" />
          <text
            x={currentPoints[0].x + 10}
            y={currentPoints[0].y - 10}
            fill="white"
            fontSize="10"
            stroke="black"
            strokeWidth="0.5"
          >
            Anchor
          </text>
        </>
      )}
      {sectionLinePoints.length > 0 && (
        <>
          {sectionLinePoints.map((point, idx) => (
            <circle key={idx} cx={point.x} cy={point.y} r={4} fill="#22c55e" stroke="white" strokeWidth="1" />
          ))}
          {sectionLinePoints.length === 1 && (
            <text x={sectionLinePoints[0].x + 10} y={sectionLinePoints[0].y - 10} fill="#bbf7d0" fontSize="12">
              1
            </text>
          )}
        </>
      )}
    </svg>
  );
};
