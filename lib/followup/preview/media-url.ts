export type PreviewMediaOrigins = {
  internalOrigin?: string;
  publicOrigin?: string;
};

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";

function safeHttpUrl(value: string): URL | null {
  // URL() aceita protocolos relativos, credenciais e caracteres de controle
  // normalizados. A prévia só abre referências HTTP(S) absolutas e explícitas.
  if (!/^https?:\/\//i.test(value.trim()) || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function isPlaceholderHost(hostname: string): boolean {
  return (
    hostname === "placeholder.supabase.co" ||
    hostname.endsWith(".placeholder.supabase.co") ||
    hostname === "placeholder.invalid" ||
    hostname.endsWith(".placeholder.invalid") ||
    hostname === "build-placeholder.invalid"
  );
}

function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const url = safeHttpUrl(value);
  if (!url || url.pathname !== "/" || url.search || url.hash) return null;
  if (isPlaceholderHost(url.hostname)) return null;
  return url.origin;
}

/**
 * Referência de mídia para o navegador, sem buscar nem assinar arquivos.
 * Só o objeto PÚBLICO da origem interna desta instalação troca de origem;
 * links externos e arquivos privados continuam apontando para seu destino.
 */
export function resolvePreviewMediaUrl(
  mediaUrl: string,
  origins?: PreviewMediaOrigins,
): string | null {
  const url = safeHttpUrl(mediaUrl);
  if (!url) return null;

  const internalOrigin = configuredOrigin(origins?.internalOrigin);
  const runtimePublic =
    typeof window !== "undefined"
      ? configuredOrigin(
          (window as unknown as { __PUBLIC_ENV__?: { NEXT_PUBLIC_SUPABASE_URL?: string } })
            ?.__PUBLIC_ENV__?.NEXT_PUBLIC_SUPABASE_URL,
        )
      : null;
  const publicOrigin = configuredOrigin(origins?.publicOrigin) ?? runtimePublic;

  const objectPath = url.pathname.slice(PUBLIC_OBJECT_PATH.length);
  const matchesInternal =
    (internalOrigin && url.origin === internalOrigin) ||
    (!internalOrigin && /^(?:supabase_kong[\w-]*|kong)$/i.test(url.hostname));

  if (
    publicOrigin &&
    matchesInternal &&
    url.pathname.startsWith(PUBLIC_OBJECT_PATH) &&
    /^[^/]+\/.+/.test(objectPath)
  ) {
    return `${publicOrigin}${url.pathname}${url.search}${url.hash}`;
  }
  return url.href;
}
