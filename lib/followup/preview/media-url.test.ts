import { describe, expect, it } from "vitest";

import { resolvePreviewMediaUrl, type PreviewMediaOrigins } from "./media-url";

const origins: PreviewMediaOrigins = {
  internalOrigin: "http://storage-internal:8000",
  publicOrigin: "http://localhost:54321",
};

describe("resolvePreviewMediaUrl", () => {
  it("troca somente a origem do objeto público local, preservando caminho e parâmetros", () => {
    const url =
      "http://storage-internal:8000/storage/v1/object/public/demos/apresentacao.ogg?download=1#trecho";
    expect(resolvePreviewMediaUrl(url, origins)).toBe(
      "http://localhost:54321/storage/v1/object/public/demos/apresentacao.ogg?download=1#trecho",
    );
  });

  it.each([
    "http://storage-internal:8001/storage/v1/object/public/demos/apresentacao.ogg",
    "https://storage-internal:8000/storage/v1/object/public/demos/apresentacao.ogg",
    "http://storage-internal.evil:8000/storage/v1/object/public/demos/apresentacao.ogg",
    "http://storage-internal:8000/storage/v1/object/sign/demos/apresentacao.ogg?token=public",
    "http://storage-internal:8000/rest/v1/contacts",
    "http://storage-internal:8000/storage/v1/object/publicity/demos/apresentacao.ogg",
    "http://storage-internal:8000/storage/v1/object/public/",
    "http://storage-internal:8000/storage/v1/object/public/demos",
    "https://cdn.example.test/demo.mp4?source=http://storage-internal:8000",
  ])("não reescreve outra origem nem um caminho que não é de objeto público: %s", (url) => {
    expect(resolvePreviewMediaUrl(url, origins)).toBe(url);
  });

  it.each([
    "",
    "   ",
    "/storage/v1/object/public/demos/demo.ogg",
    "//cdn.example.test/demo.ogg",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///C:/demo.mp4",
    "blob:https://example.test/id",
    "ftp://example.test/demo.mp4",
    "https://user:password@example.test/demo.ogg",
    "https://user@example.test/demo.ogg",
    "https://example.test/de\nmo.ogg",
    "http:example.test/demo.ogg",
  ])("recusa URL inválida, credenciais ou esquema não permitido: %s", (url) => {
    expect(resolvePreviewMediaUrl(url, origins)).toBeNull();
  });

  it("aceita HTTP(S) externo sem configuração e sem buscar a URL", () => {
    expect(resolvePreviewMediaUrl("  https://cdn.example.test/demo.mp4  ")).toBe(
      "https://cdn.example.test/demo.mp4",
    );
  });

  it.each([
    {},
    { internalOrigin: origins.internalOrigin },
    { ...origins, publicOrigin: "https://placeholder.supabase.co" },
    { ...origins, publicOrigin: "https://sub.placeholder.supabase.co" },
    { ...origins, publicOrigin: "https://placeholder.invalid" },
    { ...origins, publicOrigin: "javascript:alert(1)" },
    { ...origins, publicOrigin: "https://user:password@public.example.test" },
    { ...origins, publicOrigin: "http://localhost:54321/prefix" },
    { ...origins, internalOrigin: "http://storage-internal:8000/?token=secret" },
  ])("configuração ausente ou inválida não amplia o mapeamento: %j", (configuration) => {
    const url = "http://storage-internal:8000/storage/v1/object/public/demos/demo.mp4";
    expect(resolvePreviewMediaUrl(url, configuration)).toBe(url);
  });

  it("recusa placeholder.supabase.co e não reescreve para host fantasma", () => {
    const url =
      "http://storage-internal:8000/storage/v1/object/public/demos/apresentacao.ogg";
    expect(
      resolvePreviewMediaUrl(url, {
        internalOrigin: "http://storage-internal:8000",
        publicOrigin: "https://placeholder.supabase.co",
      }),
    ).toBe(url);
  });

  it("reescreve host interno padrão do kong mesmo sem internalOrigin explícito", () => {
    const url =
      "http://supabase_kong_deskcomm-avaliacao:8000/storage/v1/object/public/demos/audio.ogg";
    expect(
      resolvePreviewMediaUrl(url, {
        publicOrigin: "http://localhost:54321",
      }),
    ).toBe("http://localhost:54321/storage/v1/object/public/demos/audio.ogg");
  });

  it("usa window.__PUBLIC_ENV__.NEXT_PUBLIC_SUPABASE_URL quando em ambiente de navegador", () => {
    const globalWithWindow = globalThis as unknown as {
      window?: { __PUBLIC_ENV__?: { NEXT_PUBLIC_SUPABASE_URL?: string } };
    };
    const prevWindow = globalWithWindow.window;
    try {
      globalWithWindow.window = {
        __PUBLIC_ENV__: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
      };
      const url =
        "http://supabase_kong_deskcomm-avaliacao:8000/storage/v1/object/public/demos/audio.ogg";
      expect(resolvePreviewMediaUrl(url)).toBe(
        "http://localhost:54321/storage/v1/object/public/demos/audio.ogg",
      );
    } finally {
      globalWithWindow.window = prevWindow;
    }
  });
});
