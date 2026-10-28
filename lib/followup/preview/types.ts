import type { FlowGraph, FlowNode } from "../graph-schema";

export type PreviewStatus =
  | "ready"
  | "running"
  | "paused"
  | "waiting_reply"
  | "waiting_time"
  | "completed"
  | "unsupported"
  | "error"
  | "stopped";
export type PreviewActiveStatus = "running" | "waiting_reply" | "waiting_time";

export interface PreviewOptions {
  /** Sem relógio global: a mesma entrada produz a mesma sessão. */
  startAtMs?: number;
  context?: Record<string, unknown>;
  cancelOnReply?: boolean;
  handoffPolicy?: "pause" | "cancel" | "allow";
}

export type PreviewEvent =
  | { type: "start" | "step" | "advance" | "pause" | "resume" | "restart" | "stop" }
  | { type: "reply"; body: string }
  | { type: "tick"; elapsedMs: number };

export interface PreviewDiagnostic {
  code:
    | "invalid_graph"
    | "unsupported_node"
    | "max_steps"
    | "max_trace"
    | "node_failed"
    | "invalid_clock";
  message: string;
  nodeId?: string;
}

export interface PreviewTraceEvent {
  id: string;
  ordinal: number;
  atMs: number;
  kind:
    | "node"
    | "edge"
    | "message"
    | "task"
    | "wait"
    | "reply"
    | "clock"
    | "pause"
    | "resume"
    | "warning"
    | "complete"
    | "stop"
    | "error";
  nodeId: string | null;
  edgeId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PreviewMessage {
  id: string;
  nodeId: string;
  direction: "inbound" | "outbound" | "system";
  body: string;
  atMs: number;
  simulated: true;
  mediaUrl?: string;
  mediaType?: "audio" | "video" | "image" | "document";
  filename?: string;
  task?: Extract<FlowNode, { type: "internal_task" }>["config"];
}

export interface PreviewOccupancy {
  nodeId: string;
  phase: "action_sent" | "waiting";
  startedAtMs: number;
  immuneToReply: boolean;
}

export interface PreviewSession {
  graphSnapshot: FlowGraph | null;
  options: PreviewOptions;
  status: PreviewStatus;
  currentNodeId: string | null;
  visitedNodeIds: string[];
  traversedEdgeIds: string[];
  trace: PreviewTraceEvent[];
  transcript: PreviewMessage[];
  virtualNowMs: number;
  nextEventAtMs: number | null;
  steps: number;
  outcome: string | null;
  diagnostic: PreviewDiagnostic | null;
  occupancy: PreviewOccupancy | null;
  pausedStatus: PreviewActiveStatus | null;
  inboundSequence: number;
  consumedInboundIds: string[];
}
