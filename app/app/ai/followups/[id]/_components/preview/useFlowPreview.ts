"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { createSession, dispatch } from "@/lib/followup/preview/session";
import type { PreviewEvent, PreviewSession } from "@/lib/followup/preview/types";

interface Options {
  graph: FlowGraph;
  contactName: string;
  cancelOnReply?: boolean;
  handoffPolicy?: "pause" | "cancel" | "allow";
  onSessionChange: (session: PreviewSession) => void;
}

/** Uma sessão em memória; cada efeito possui e cancela o seu único timer. */
export function useFlowPreview({
  graph,
  contactName,
  cancelOnReply,
  handoffPolicy,
  onSessionChange,
}: Options) {
  const [session, setSession] = useState(() =>
    createSession(graph, {
      context: { contact: { name: contactName } },
      cancelOnReply,
      handoffPolicy,
    }),
  );
  const [startedAtMs, setStartedAtMs] = useState(session.virtualNowMs);
  const notify = useRef(onSessionChange);

  useEffect(() => {
    notify.current = onSessionChange;
  }, [onSessionChange]);

  useEffect(() => {
    notify.current(session);
  }, [session]);

  const send = useCallback((event: PreviewEvent) => {
    setSession((current) => dispatch(current, event));
  }, []);

  useEffect(() => {
    if (session.status === "running") {
      const timer = window.setInterval(() => send({ type: "step" }), 400);
      return () => window.clearInterval(timer);
    }
    if (session.status === "waiting_time" || session.status === "waiting_reply") {
      let previous = Date.now();
      const timer = window.setInterval(() => {
        const now = Date.now();
        const elapsedMs = Math.max(0, now - previous);
        previous = now;
        send({ type: "tick", elapsedMs });
      }, 250);
      return () => window.clearInterval(timer);
    }
  }, [session.status, send]);

  const begin = useCallback(
    (latestDraft: boolean) => {
      const next = createSession(latestDraft ? graph : (session.graphSnapshot ?? graph), {
        context: { contact: { name: contactName.trim() || "Ana" } },
        cancelOnReply,
        handoffPolicy,
      });
      setStartedAtMs(next.virtualNowMs);
      setSession(dispatch(next, { type: "start" }));
    },
    [graph, session.graphSnapshot, contactName, cancelOnReply, handoffPolicy],
  );

  return {
    session,
    startedAtMs,
    start: () => begin(false),
    restart: () => begin(true),
    pause: () => send({ type: "pause" }),
    resume: () => send({ type: "resume" }),
    advance: () => send({ type: "advance" }),
    stop: () => send({ type: "stop" }),
    reply: (body: string) => send({ type: "reply", body }),
  };
}
