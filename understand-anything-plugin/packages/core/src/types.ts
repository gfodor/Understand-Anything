// Node types (21 total: 5 code + 8 non-code + 3 domain + 5 knowledge)
export type NodeType =
  | "file" | "function" | "class" | "module" | "concept"
  | "config" | "document" | "service" | "table" | "endpoint"
  | "pipeline" | "schema" | "resource"
  | "domain" | "flow" | "step"
  | "article" | "entity" | "topic" | "claim" | "source";

// Edge types (35 total in 8 categories: Structural, Behavioral, Data flow, Dependencies, Semantic, Infrastructure/Schema, Domain, Knowledge)
export type EdgeType =
  | "imports" | "exports" | "contains" | "inherits" | "implements"  // Structural
  | "calls" | "subscribes" | "publishes" | "middleware"              // Behavioral
  | "reads_from" | "writes_to" | "transforms" | "validates"         // Data flow
  | "depends_on" | "tested_by" | "configures"                       // Dependencies
  | "related" | "similar_to"                                         // Semantic
  | "deploys" | "serves" | "provisions" | "triggers"                // Infrastructure
  | "migrates" | "documents" | "routes" | "defines_schema"          // Schema/Data
  | "contains_flow" | "flow_step" | "cross_domain"                  // Domain
  | "cites" | "contradicts" | "builds_on" | "exemplifies" | "categorized_under" | "authored_by"; // Knowledge

// Optional knowledge metadata for article/entity/topic/claim/source nodes
export interface KnowledgeMeta {
  wikilinks?: string[];
  backlinks?: string[];
  category?: string;
  content?: string;
}

// Optional domain metadata for domain/flow/step nodes
export interface DomainMeta {
  entities?: string[];
  businessRules?: string[];
  crossDomainInteractions?: string[];
  entryPoint?: string;
  entryType?: "http" | "cli" | "event" | "cron" | "manual";
}

// GraphNode with 21 types: 5 code + 8 non-code + 3 domain + 5 knowledge
export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath?: string;
  lineRange?: [number, number];
  summary: string;
  tags: string[];
  complexity: "simple" | "moderate" | "complex";
  languageNotes?: string;
  domainMeta?: DomainMeta;
  knowledgeMeta?: KnowledgeMeta;
}

// GraphEdge with rich relationship modeling
export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  direction: "forward" | "backward" | "bidirectional";
  description?: string;
  weight: number; // 0-1
}

// Layer (logical grouping)
export interface Layer {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

// TourStep (for learn mode)
export interface TourStep {
  order: number;
  title: string;
  description: string;
  nodeIds: string[];
  languageLesson?: string;
}

// =========================================================================
// Mechanisms & Walkthroughs (depth-first deep-read concept)
// -------------------------------------------------------------------------
// A Mechanism is a piece of code worth recognizing on its own terms —
// algorithmic spine, architectural elision, cross-process protocol, or
// data-structure trick. Peer to a Flow but with a different discovery
// agent (mechanism-analyzer.md) that does not require a business-process
// shape or a request/response entry point.
//
// A Walkthrough is a depth-first narrative attachment that either a Flow
// or a Mechanism can carry. Distinct from the breadth-first Tour feature.
// Same JSON shape regardless of substrate; shape: "process" | "recognition"
// drives prose discipline (flow → process punchline, mechanism → climactic
// recognition with pull-quote).
//
// See proposals/mechanisms-and-walkthroughs.md in the spike repo for spec.
// =========================================================================

export type MechanismKind =
  | "algorithmic"
  | "architectural"
  | "architectural-elision"
  | "protocol"
  | "data-structure";

export interface Mechanism {
  id: string;                          // "mechanism:<kebab-name>"
  name: string;                        // human-readable, e.g. "The Split Key"
  kind: MechanismKind;
  premise: string;                     // one paragraph: what's the problem
  candidateRecognition: string;        // one sentence: what's the answer
  participantNodeIds: string[];        // 5-25 source locations
  climacticNodeId: string;             // the node where the recognition lives
  worthWalkthrough: boolean;           // agent's judgment
  walkthrough?: Walkthrough;           // populated opt-in
  tags?: string[];
}

export interface ReviewPrompt {
  id?: string;
  type: string;                        // e.g. "function-contract" | "counterfactual"
  question: string;
  hint?: string;
}

export interface WalkthroughOpening {
  problem: string;                     // problem framing (1 paragraph)
  tease: string;                       // surprising-shape hint (1-2 sentences)
  concreteInstance: string;            // specific values for the throughline
}

export interface WalkthroughCoda {
  summary: string;
  prompts: ReviewPrompt[];
}

export interface BeatPlaceholder {
  kind: "beat";
  beatType: "trace-execution" | "predict-outcome" | "spot-beacon" | "chunk-it";
  question: string;
  candidates: string[];
  answerIndex: number;
  reveal: string;
  windowSeconds?: number;
}

export interface FocalPlaceholder {
  kind: "focal";
  template: "sequence-diagram" | "state-diagram" | "data-structure" | "system-diagram" | "metric-strip";
  description: string;
  parameters?: Record<string, string>;
}

export interface SimPlaceholder {
  kind: "simulation";
  template: "parameter-scrubber" | "single-stepper" | "fillable-container" | "side-by-side-counterfactual";
  description: string;
  parameters?: Record<string, string>;
}

export type WalkthroughEmbed = BeatPlaceholder | FocalPlaceholder | SimPlaceholder;

export interface WalkthroughScene {
  id: string;                          // stable for SRS card anchoring
  prose: string;                       // markdown
  anchorNodeId?: string;               // sticky code excerpt for this scene
  codeExcerpt?: {
    path: string;
    lineRange: [number, number];
    highlightLine?: number;
    language?: string;
  };
  embed?: WalkthroughEmbed;
  isClimax?: boolean;                  // true for the one climactic scene
}

export interface Walkthrough {
  version: "1";
  attachedTo: { kind: "flow" | "mechanism"; id: string };
  shape: "process" | "recognition";
  title: string;
  subtitle: string;                    // masthead tension subtitle
  opening: WalkthroughOpening;
  scenes: WalkthroughScene[];
  pullQuote?: string;                  // climax sentence (recognition) or punchline (process)
  coda: WalkthroughCoda;
  generatedAt: string;                 // ISO timestamp
}

// Optional standalone artifact that hosts mechanism discovery output.
// Stored in .understand-anything/mechanism-graph.json — sibling to
// domain-graph.json, not a substring of knowledge-graph.json.
export interface MechanismGraph {
  version: string;
  project: ProjectMeta;
  mechanisms: Mechanism[];
  generatedAt: string;
}

// ProjectMeta
export interface ProjectMeta {
  name: string;
  languages: string[];
  frameworks: string[];
  description: string;
  analyzedAt: string;
  gitCommitHash: string;
}

// Root KnowledgeGraph
export interface KnowledgeGraph {
  version: string;
  kind?: "codebase" | "knowledge";
  project: ProjectMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layers: Layer[];
  tour: TourStep[];
  /** Optional. Populated by /understand-mechanisms or written separately
   *  in mechanism-graph.json. When present here, the dashboard reads from
   *  the same JSON it already fetches. */
  mechanisms?: Mechanism[];
}

// Theme configuration (for dashboard customization)
export interface ThemeConfig {
  presetId: string;
  accentId: string;
}

// AnalysisMeta (for persistence)
export interface AnalysisMeta {
  lastAnalyzedAt: string;
  gitCommitHash: string;
  version: string;
  analyzedFiles: number;
  theme?: ThemeConfig;
}

// Project config (for auto-update opt-in and language preference)
export interface ProjectConfig {
  autoUpdate: boolean;
  outputLanguage?: string;
}

// Non-code structural sub-interfaces
export interface SectionInfo {
  name: string;
  level: number;
  lineRange: [number, number];
}

export interface DefinitionInfo {
  name: string;
  /** Parser-reported definition kind. Known values: "table", "view", "index", "message", "enum", "type", "input", "interface", "union", "scalar", "variable", "output", "resource", "data", "section", "target", "stage" */
  kind: string;
  lineRange: [number, number];
  fields: string[];
}

export interface ServiceInfo {
  name: string;
  image?: string;
  ports: number[];
  lineRange?: [number, number];
}

export interface EndpointInfo {
  method?: string;
  path: string;
  lineRange: [number, number];
}

export interface StepInfo {
  name: string;
  lineRange: [number, number];
}

export interface ResourceInfo {
  name: string;
  kind: string;
  lineRange: [number, number];
}

export interface ReferenceResolution {
  source: string;
  target: string;
  referenceType: string; // "file", "image", "schema", "service"
  line?: number;
}

// Plugin interfaces
export interface StructuralAnalysis {
  functions: Array<{ name: string; lineRange: [number, number]; params: string[]; returnType?: string }>;
  classes: Array<{ name: string; lineRange: [number, number]; methods: string[]; properties: string[] }>;
  imports: Array<{ source: string; specifiers: string[]; lineNumber: number }>;
  exports: Array<{ name: string; lineNumber: number; isDefault?: boolean }>;
  // Non-code structural data (all optional for backward compat)
  sections?: SectionInfo[];
  definitions?: DefinitionInfo[];
  services?: ServiceInfo[];
  endpoints?: EndpointInfo[];
  steps?: StepInfo[];
  resources?: ResourceInfo[];
}

export interface ImportResolution {
  source: string;
  resolvedPath: string;
  specifiers: string[];
}

export interface CallGraphEntry {
  caller: string;
  callee: string;
  lineNumber: number;
}

export interface AnalyzerPlugin {
  name: string;
  languages: string[];
  analyzeFile(filePath: string, content: string): StructuralAnalysis;
  resolveImports?(filePath: string, content: string): ImportResolution[];
  extractCallGraph?(filePath: string, content: string): CallGraphEntry[];
  extractReferences?(filePath: string, content: string): ReferenceResolution[];
}
