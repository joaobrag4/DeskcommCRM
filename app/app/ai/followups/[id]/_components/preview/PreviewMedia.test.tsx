import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreviewMedia } from "./PreviewMedia";

const origins = {
  internalOrigin: "http://storage-internal:8000",
  publicOrigin: "http://localhost:54321",
};

describe("PreviewMedia", () => {
  it.each(["ogg", "opus", "mp3", "m4a"])(
    "reproduz %s como áudio com controles manuais pela origem pública",
    (extension) => {
      const { container } = render(
        <PreviewMedia
          mediaUrl={`http://storage-internal:8000/storage/v1/object/public/demos/demo.${extension}`}
          origins={origins}
        />,
      );
      const player = container.querySelector("audio");
      expect(player).toHaveAttribute(
        "src",
        `http://localhost:54321/storage/v1/object/public/demos/demo.${extension}`,
      );
      expect(player).toHaveAttribute("controls");
      expect(player).toHaveAttribute("preload", "metadata");
      expect(player).not.toHaveAttribute("autoplay");
      expect(container.querySelector("video")).toBeNull();
    },
  );

  it("reproduz MP4 como vídeo sem iniciar nem baixar o arquivo inteiro automaticamente", () => {
    const { container } = render(
      <PreviewMedia mediaUrl="https://cdn.example.test/demo.mp4?token=public" />,
    );
    const player = container.querySelector("video");
    expect(player).toHaveAttribute("src", "https://cdn.example.test/demo.mp4?token=public");
    expect(player).toHaveAttribute("controls");
    expect(player).toHaveAttribute("preload", "metadata");
    expect(player).toHaveAttribute("playsinline");
    expect(player).not.toHaveAttribute("autoplay");
  });

  it("usa o MIME declarado com a mesma precedência do envio de produção", () => {
    const { container } = render(
      <PreviewMedia mediaUrl="https://cdn.example.test/audio.mp4" mediaType="audio/mp4" />,
    );
    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      "https://cdn.example.test/audio.mp4",
    );
    expect(container.querySelector("video")).toBeNull();
  });

  it("mostra imagem com carregamento lazy e texto alternativo", () => {
    render(
      <PreviewMedia mediaUrl="https://cdn.example.test/capa.png" filename="Capa da coleção" />,
    );
    expect(screen.getByAltText("Capa da coleção")).toHaveAttribute("loading", "lazy");
  });

  it("documento abre em link seguro sem fingir que a disponibilidade foi conferida", () => {
    const { container } = render(
      <PreviewMedia mediaUrl="https://cdn.example.test/material.pdf" filename="Material.pdf" />,
    );
    const link = screen.getByRole("link", { name: /abrir anexo/i });
    expect(link).toHaveAttribute("href", "https://cdn.example.test/material.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Material.pdf")).toBeInTheDocument();
    expect(screen.getByText(/disponibilidade.*não foi verificada/i)).toBeInTheDocument();
    expect(container.querySelector("iframe, object, embed")).toBeNull();
  });

  it.each([
    "https://cdn.example.test/demo.ogg",
    "https://cdn.example.test/demo.mp4",
    "https://cdn.example.test/demo.png",
  ])("falha de carregamento fica visível e mantém o acesso seguro ao anexo: %s", (mediaUrl) => {
    const { container } = render(<PreviewMedia mediaUrl={mediaUrl} />);
    const media = container.querySelector("audio, video, img");
    expect(media).not.toBeNull();
    fireEvent.error(media!);
    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível carregar este anexo/i);
    expect(screen.getByRole("link", { name: /abrir anexo/i })).toHaveAttribute("href", mediaUrl);
  });

  it("outra URL tenta carregar normalmente depois da falha de um anexo", () => {
    const { container, rerender } = render(
      <PreviewMedia mediaUrl="https://cdn.example.test/demo.ogg" />,
    );
    fireEvent.error(container.querySelector("audio")!);
    rerender(<PreviewMedia mediaUrl="https://cdn.example.test/outro.ogg" />);
    expect(container.querySelector("audio")).toHaveAttribute(
      "src",
      "https://cdn.example.test/outro.ogg",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["javascript:alert(1)", "https://user:password@example.test/demo.pdf"])(
    "URL insegura não cria mídia nem link: %s",
    (mediaUrl) => {
      const { container } = render(<PreviewMedia mediaUrl={mediaUrl} />);
      expect(screen.getByRole("status")).toHaveTextContent(/URL inválida ou não permitida/i);
      expect(container.querySelector("audio, video, img, a")).toBeNull();
    },
  );

  it("anexo sem URL fica explicitamente pendente", () => {
    render(<PreviewMedia mediaUrl=" " />);
    expect(screen.getByRole("status")).toHaveTextContent(/anexo pendente/i);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("tipo desconhecido mantém diagnóstico e link sem escolher um player arbitrário", () => {
    const { container } = render(<PreviewMedia mediaUrl="https://cdn.example.test/sem-extensao" />);
    expect(screen.getByRole("status")).toHaveTextContent(/tipo identificável/i);
    expect(screen.getByRole("link", { name: /abrir anexo/i })).toHaveAttribute(
      "href",
      "https://cdn.example.test/sem-extensao",
    );
    expect(container.querySelector("audio, video, img")).toBeNull();
  });
});
