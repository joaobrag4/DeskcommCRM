"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { resolvePreviewMediaUrl, type PreviewMediaOrigins } from "@/lib/followup/preview/media-url";
import {
  classificarMidiaComLegenda,
  type TipoDeMidiaComLegenda,
} from "@/lib/messaging/media/midia-com-legenda";

type Props = {
  mediaUrl: string;
  mediaType?: string;
  origins?: PreviewMediaOrigins;
  filename?: string;
};

function AttachmentLink({ src }: { src: string }) {
  const t = useT();
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {t("Abrir anexo")}
    </a>
  );
}

function MediaFile({
  src,
  type,
  filename,
}: {
  src: string;
  type: TipoDeMidiaComLegenda;
  filename?: string;
}) {
  const t = useT();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted p-3">
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Não foi possível carregar este anexo. Confira o arquivo na etapa; a prévia textual pode continuar.",
          )}
        </p>
        <AttachmentLink src={src} />
      </div>
    );
  }

  if (type === "audio") {
    return (
      <audio
        src={src}
        aria-label={filename || t("Áudio da prévia")}
        controls
        preload="metadata"
        onError={(e) => {
          console.warn("[preview/audio] Falha ao carregar áudio:", src, e);
          setFailed(true);
        }}
        className="block w-full min-w-[240px] max-w-full"
      />
    );
  }

  if (type === "video") {
    return (
      <video
        src={src}
        aria-label={filename || t("Vídeo da prévia")}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className="max-h-80 w-full rounded-md bg-muted object-contain"
      />
    );
  }

  if (type === "image") {
    return (
      // A URL é uma referência pública/external do rascunho, sem proxy do servidor.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={filename || t("Imagem da prévia")}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 max-w-full rounded-md object-contain"
      />
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted p-3">
      <p className="text-sm font-medium break-words">{filename || t("Documento da prévia")}</p>
      <p className="text-xs text-muted-foreground">
        {t("A disponibilidade deste documento não foi verificada. Abra o anexo para conferir.")}
      </p>
      <AttachmentLink src={src} />
    </div>
  );
}

/** Renderiza só o anexo do ensaio; não cria mensagem nem modifica o grafo. */
export function PreviewMedia({ mediaUrl, mediaType, origins, filename }: Props) {
  const t = useT();
  const src = resolvePreviewMediaUrl(mediaUrl, origins);
  if (!src) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
      >
        {mediaUrl.trim()
          ? t("Este anexo usa uma URL inválida ou não permitida.")
          : t("Anexo pendente: informe uma URL de mídia na etapa.")}
      </p>
    );
  }

  const media = classificarMidiaComLegenda(src, mediaType);
  if (!media.ok) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted p-3">
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Este anexo não tem um tipo identificável. Confira a URL ou o tipo do arquivo na etapa.",
          )}
        </p>
        <AttachmentLink src={src} />
      </div>
    );
  }

  return <MediaFile key={`${src}:${media.type}`} src={src} type={media.type} filename={filename} />;
}
