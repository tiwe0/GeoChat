import { ADVANCED_DRAWING_TOOL_METADATA } from "./definitions";
import { compileParabolaFocusDirectrix } from "./macros/conic";
import { compileSquarePyramidSkeleton, compileTriangularPrismSkeleton } from "./macros/prism";
import { compileClassicalProbabilityGrid } from "./macros/probability";
import { compileQuadraticVertexDiagram } from "./macros/quadratic";
import { compileTetrahedronCircumsphere, compileTetrahedronInsphere } from "./macros/tetrahedron";
import { compileUnitCircleTrigProjection } from "./macros/trigonometry";
import type { AdvancedDrawingToolDefinition, AdvancedDrawingToolName } from "./types";

export const ADVANCED_DRAWING_TOOL_REGISTRY = {
  drawTriangularPrismSkeleton: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawTriangularPrismSkeleton,
    compile: compileTriangularPrismSkeleton
  },
  drawSquarePyramidSkeleton: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawSquarePyramidSkeleton,
    compile: compileSquarePyramidSkeleton
  },
  drawTetrahedronCircumsphere: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawTetrahedronCircumsphere,
    compile: compileTetrahedronCircumsphere
  },
  drawTetrahedronInsphere: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawTetrahedronInsphere,
    compile: compileTetrahedronInsphere
  },
  drawUnitCircleTrigProjection: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawUnitCircleTrigProjection,
    compile: compileUnitCircleTrigProjection
  },
  drawParabolaFocusDirectrix: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawParabolaFocusDirectrix,
    compile: compileParabolaFocusDirectrix
  },
  drawQuadraticVertexDiagram: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawQuadraticVertexDiagram,
    compile: compileQuadraticVertexDiagram
  },
  drawClassicalProbabilityGrid: {
    ...ADVANCED_DRAWING_TOOL_METADATA.drawClassicalProbabilityGrid,
    compile: compileClassicalProbabilityGrid
  }
} satisfies Record<AdvancedDrawingToolName, AdvancedDrawingToolDefinition>;
