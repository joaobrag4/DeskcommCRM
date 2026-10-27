"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { httpRequestConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

export function HttpRequestForm({
  config,
  onChange,
}: {
  config: ConfigOf<"http_request">;
  onChange: (c: ConfigOf<"http_request">) => void;
}) {
  const t = useT();
  const [method, setMethod] = useState(config.method);
  const [url, setUrl] = useState(config.url);
  const [headersText, setHeadersText] = useState(
    JSON.stringify(config.headers ?? {}, null, 2),
  );
  const [body, setBody] = useState(config.body ?? "");
  const [timeoutMs, setTimeoutMs] = useState(config.timeout_ms ?? 10000);
  const [savePath, setSavePath] = useState(config.save_response_path ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const commit = (overrides?: Partial<{
    method: typeof HTTP_METHODS[number];
    url: string;
    headers: Record<string, string>;
    body: string;
    timeout_ms: number;
    save_response_path: string;
  }>) => {
    let parsedHeaders: Record<string, string> = config.headers ?? {};
    if (overrides?.headers) {
      parsedHeaders = overrides.headers;
    } else {
      try {
        if (headersText.trim()) {
          parsedHeaders = JSON.parse(headersText);
        }
      } catch {
        setErro(t("Headers precisa ser um JSON válido."));
        return;
      }
    }

    const candidate = {
      method: overrides?.method ?? method,
      url: (overrides?.url ?? url).trim(),
      headers: parsedHeaders,
      body: overrides?.body ?? body,
      timeout_ms: overrides?.timeout_ms ?? timeoutMs,
      ...(overrides?.save_response_path !== undefined
        ? overrides.save_response_path.trim() ? { save_response_path: overrides.save_response_path.trim() } : {}
        : savePath.trim() ? { save_response_path: savePath.trim() } : {}),
    };

    const parsed = httpRequestConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setErro(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4" data-testid="http-request-form">
      <div className="space-y-2">
        <Label htmlFor="http-method">{t("Método HTTP")}</Label>
        <Select
          value={method}
          onValueChange={(v) => {
            const m = v as typeof HTTP_METHODS[number];
            setMethod(m);
            commit({ method: m });
          }}
        >
          <SelectTrigger id="http-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="http-url">{t("URL de Destino")}</Label>
        <Input
          id="http-url"
          type="url"
          placeholder="https://api.exemplo.com/webhook"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            commit({ url: e.target.value });
          }}
        />
        <p className="text-xs text-text-muted">
          {t("Suporta variáveis como {{contact.name}} ou {{contact.phone}}")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="http-headers">{t("Cabeçalhos (Headers em JSON)")}</Label>
        <Textarea
          id="http-headers"
          className="font-mono text-xs"
          rows={3}
          value={headersText}
          onChange={(e) => {
            setHeadersText(e.target.value);
            try {
              const h = JSON.parse(e.target.value);
              commit({ headers: h });
            } catch {
              // Permite digitação contínua
            }
          }}
        />
      </div>

      {method !== "GET" && (
        <div className="space-y-2">
          <Label htmlFor="http-body">{t("Corpo da Requisição (Payload)")}</Label>
          <Textarea
            id="http-body"
            className="font-mono text-xs"
            rows={4}
            placeholder='{"lead_id": "{{contact.id}}", "status": "novo"}'
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              commit({ body: e.target.value });
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="http-timeout">{t("Timeout (ms)")}</Label>
          <Input
            id="http-timeout"
            type="number"
            min={1000}
            max={30000}
            step={1000}
            value={timeoutMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeoutMs(v);
              commit({ timeout_ms: v });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="http-save-path">{t("Gravar resposta em")}</Label>
          <Input
            id="http-save-path"
            placeholder="lead_fields.chave"
            value={savePath}
            onChange={(e) => {
              setSavePath(e.target.value);
              commit({ save_response_path: e.target.value });
            }}
          />
        </div>
      </div>

      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}
