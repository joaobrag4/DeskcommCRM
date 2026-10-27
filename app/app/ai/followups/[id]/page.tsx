import { notFound, redirect } from "next/navigation";

import { env } from "@/lib/env";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";
import { FlowBuilder } from "./_components/FlowBuilder";

export const dynamic = "force-dynamic";

const DETAIL_COLUMNS =
  "id, name, status, active_version_id, draft_graph, handoff_policy, trigger_config, surface, created_at, updated_at";

export default async function FollowupFlowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const [{ data: pointer }, { data: versionRows }] = await Promise.all([
    supabase
      .from("followup_flow_pointers")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .eq("organization_id", activeOrg.orgId)
      // Roteiro de atendimento não abre no editor de follow-up (prova do #1130).
      .neq("surface", "atendimento")
      .maybeSingle(),
    supabase
      .from("followup_flow_versions")
      .select("id, created_at")
      .eq("organization_id", activeOrg.orgId)
      .eq("pointer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!pointer) notFound();

  // Mesma regra da rota: rascunho ausente COM versão publicada abre o que está
  // NO AR. Ver `lib/followup/rascunho.ts`.
  const draft_graph = await rascunhoDoFluxo(
    supabase,
    pointer as unknown as { draft_graph: unknown; active_version_id: string | null },
    activeOrg.orgId,
  );

  const flow: FollowupFlowDetailRow = {
    ...(pointer as unknown as Omit<FollowupFlowDetailRow, "versions_count" | "previous_version_id">),
    draft_graph,
    versions_count: versionRows?.length ?? 0,
    previous_version_id: versionRows?.[1]?.id ?? null,
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <FlowBuilder
        flowId={id}
        initialData={flow}
        previewOrigins={{
          internalOrigin: mediaOrigin(env.SUPABASE_SERVER_URL),
          publicOrigin: mediaOrigin(env.NEXT_PUBLIC_SUPABASE_URL),
        }}
      />
    </div>
  );
}

/** Only origins cross the server/client boundary; never credentials or private paths. */
function mediaOrigin(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
