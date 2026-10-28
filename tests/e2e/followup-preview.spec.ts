import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test, expect } from "./helpers/test";
import type { FlowGraph } from "@/lib/followup/graph-schema";

function credentials(): { password: string; users: Record<string, { email: string }> } {
  if (!existsSync(".e2e-creds.json")) {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  return JSON.parse(readFileSync(".e2e-creds.json", "utf8"));
}

const graph: FlowGraph = {
  nodes: [
    { id: "start", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    { id: "message", type: "action", label: "Convite", position: { x: 350, y: 0 }, config: { mode: "text", body: "Quer receber o material?" } },
    { id: "wait", type: "wait", label: "Pausa de cinco segundos", position: { x: 700, y: 0 }, config: { mode: "fixed", duration_ms: 5000 } },
    { id: "question", type: "match_reply", label: "Decisão do contato", position: { x: 1050, y: 0 }, config: { branches: [{ id: "yes", label: "Aceitou", op: "eq", pattern: "sim" }], grace_timeout_ms: 900000 } },
    { id: "yes", type: "end", label: "Aceite", position: { x: 1400, y: 0 }, config: { outcome: "converted" } },
    { id: "no", type: "end", label: "Sem aceite", position: { x: 1400, y: 300 }, config: { outcome: "exhausted" } },
  ],
  edges: [
    { id: "first", source: "start", target: "message", priority: 0, condition: { type: "always" } },
    { id: "second", source: "message", target: "wait", priority: 0, condition: { type: "always" } },
    { id: "third", source: "wait", target: "question", priority: 0, condition: { type: "always" } },
    { id: "accepted", source: "question", target: "yes", priority: 0, condition: { type: "branch", branch_id: "yes" } },
    { id: "fallback", source: "question", target: "no", priority: 1, condition: { type: "always" } },
  ],
};

test("prévia usa o rascunho, mostra percurso e não executa efeitos externos", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const creds = credentials();
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.manager!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app(?:\/|$)/);

  const created = await page.request.post("/api/v1/ai/followup-flows", { data: { name: `E2E Prévia ${Date.now()}` } });
  expect(created.ok()).toBe(true);
  const { data: flow } = await created.json() as { data: { id: string } };
  const url = `/api/v1/ai/followup-flows/${flow.id}`;
  try {
    expect((await page.request.patch(url, { data: { draft_graph: graph } })).ok()).toBe(true);
    await page.goto(`/app/ai/followups/${flow.id}`);
    await expect(page.getByTestId("node-card-message")).toBeVisible();
    await page.getByTestId("node-card-message").click();
    await page.getByLabel("Texto enviado ao contato").fill("Convite editado sem salvar");

    const prohibited: string[] = [];
    await page.route("**/*", async (route) => {
      const req = route.request();
      const sameOrigin = new URL(req.url()).origin === new URL(page.url()).origin;
      if (sameOrigin && !["GET", "HEAD", "OPTIONS"].includes(req.method())) {
        prohibited.push(`${req.method()} ${new URL(req.url()).pathname}`);
        await route.abort();
      } else await route.continue();
    });
    await page.getByTestId("open-flow-preview").click();
    const panel = page.getByTestId("flow-preview");
    await panel.getByRole("button", { name: "Iniciar prévia", exact: true }).click();
    await expect(panel.getByTestId("preview-transcript")).toContainText("Convite editado sem salvar");
    await expect(page.locator('[data-id="wait"][data-preview-state="waiting_time"]')).toBeVisible();
    await panel.getByRole("button", { name: "Avançar até o próximo evento", exact: true }).click();
    await expect(page.locator('[data-id="question"][data-preview-state="waiting_reply"]')).toBeVisible();
    await expect(page.locator(".flow-preview-edge")).toHaveCount(3);
    await expect(page.getByTestId("preview-canvas-status")).toContainText("Decisão do contato");

    await page.screenshot({ path: testInfo.outputPath("preview-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog", { name: "Prévia da conversa" })).toBeVisible();
    await expect(page.getByTestId("flow-preview-canvas-inert-region")).toHaveAttribute("inert", "");
    await panel.getByLabel("Resposta do contato fictício").scrollIntoViewIfNeeded();
    await expect(panel.getByLabel("Resposta do contato fictício")).toBeVisible();
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("preview-mobile.png"), fullPage: true });
    await panel.getByLabel("Resposta do contato fictício").fill(" SIM ");
    await panel.getByRole("button", { name: "Enviar resposta", exact: true }).click();
    await expect(page.locator('[data-id="yes"][data-preview-state="completed"]')).toHaveCount(1);
    await expect(page.locator('.flow-preview-edge[data-id="accepted"]')).toHaveCount(1);
    expect(prohibited).toEqual([]);
    await panel.getByRole("button", { name: "Fechar prévia", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("open-flow-preview")).toBeFocused();
    await page.unroute("**/*");
    const stored = await (await page.request.get(url)).json() as { data: { draft_graph: FlowGraph } };
    expect(stored.data.draft_graph).toEqual(graph);
  } finally {
    await page.unroute("**/*");
    expect((await page.request.delete(url)).ok()).toBe(true);
  }
});
