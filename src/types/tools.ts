export type Point = { x: number; y: number };
export type WorldPoint = [number, number, number];
export type ToolType = 'none' | 'ruler' | 'angle' | 'circle' | 'brush' | 'text';

export type Drawing =
  | { type: 'ruler'; points: Point[]; value: number; worldPoints?: WorldPoint[] }
  | { type: 'angle'; points: Point[]; value: number; worldPoints?: WorldPoint[] }
  | { type: 'circle'; points: Point[]; value: number; worldPoints?: WorldPoint[] }
  | { type: 'brush'; points: Point[]; color: string; worldPoints?: WorldPoint[] }
  | {
      type: 'text';
      target: Point;
      labelPos: Point;
      textId: number;
      color: string;
      fontSize: number;
      worldTarget?: WorldPoint;
      worldLabelPos?: WorldPoint;
    };

export interface TextNote {
  id: number;
  text: string;
}
