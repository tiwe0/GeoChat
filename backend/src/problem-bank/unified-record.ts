export type UnifiedProblemUsage = "production" | "external" | "reasoning" | "evaluation";

export type UnifiedProblemModality = "text" | "image" | "multimodal";

export type UnifiedProblemConstruction = "open_ended" | "multiple_choice" | "fill_blank" | "worked_solution" | "reasoning_trace";

export type UnifiedProblemMedia = {
  kind: "image";
  path?: string;
  url?: string;
  r2Key?: string;
  r2Url?: string;
  trackingUrl?: string;
  sha256?: string;
  byteSize?: number;
  contentType?: string;
  bytes?: Uint8Array;
  width?: number;
  height?: number;
  alt?: string;
};

export type UnifiedProblemChoice = {
  label: string;
  text: string;
  isCorrect?: boolean;
};

export type UnifiedProblemSource = {
  datasetId: string;
  requestedId?: string;
  group: UnifiedProblemUsage;
  commit?: string;
  license?: string;
  sourceFile: string;
  sourceIndex?: number;
  sourceSplit?: string;
  sourceItemId?: string;
};

export type UnifiedProblemTaxonomy = {
  language?: string;
  subject?: string;
  grade?: string;
  gradeGroup?: string;
  difficulty?: string;
  knowledge?: string[];
  skills?: string[];
  tags?: string[];
};

export type UnifiedProblemAnswer = {
  final?: string;
  type?: "label" | "free_form" | "numeric" | "expression" | "multi_label" | "unknown";
  choices?: UnifiedProblemChoice[];
  solution?: string;
  analysis?: string;
  reasoningTrace?: unknown;
};

export type UnifiedProblemRecord = {
  id: string;
  source: UnifiedProblemSource;
  modality: UnifiedProblemModality;
  construction: UnifiedProblemConstruction;
  prompt: string;
  answer: UnifiedProblemAnswer;
  media: UnifiedProblemMedia[];
  taxonomy: UnifiedProblemTaxonomy;
  raw: unknown;
};
