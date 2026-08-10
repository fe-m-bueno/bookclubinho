import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Bookclubinho: leia junto, sinta junto";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * O cartão que sai quando alguém cola o link do app em qualquer lugar.
 *
 * É a landing, não uma arte à parte: mesmo creme de fundo, mesma marca em
 * Fraunces, mesmo par de frases e os mesmos livros de ornamento. Quem clica
 * chega numa tela que reconhece do cartão.
 *
 * Runtime Node e não edge: a fonte é lida do disco. O edge exigiria buscá-la
 * por HTTP a cada geração, e a fonte não muda nunca.
 *
 * Os valores vêm da landing traduzidos para o que o Satori entende: ele não
 * resolve `oklch` nem gradiente radial com `ellipse ... at`, então o creme e os
 * sage entram em hex e o fundo é o gradiente linear mais próximo. Cada
 * elemento tem `display: flex` porque, no Satori, div com mais de um filho sem
 * display explícito é erro, não default.
 */

const CREME = "#f7ecdb";
const CREME_FUNDO = "#f2e4cf";
const CARVAO = "#2a2521";
const SAGE_ESCURO = "#3d6646";
const SAGE_300 = "#9ec2a2";
const SAGE_400 = "#7ba580";

/** O FloatingBook da landing: 56×80 com lombada, aqui em escala de cartaz. */
function Livro({
  x,
  y,
  rotacao,
  escala,
  opacidade,
}: {
  x: number;
  y: number;
  rotacao: number;
  escala: number;
  opacidade: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        width: 56 * escala,
        height: 80 * escala,
        borderRadius: 6 * escala,
        border: `${escala}px solid rgba(123,165,128,0.5)`,
        background: `linear-gradient(to bottom, ${SAGE_300}, ${SAGE_400})`,
        boxShadow: `${-3 * escala}px ${2 * escala}px ${8 * escala}px rgba(0,0,0,0.2)`,
        transform: `rotate(${rotacao}deg)`,
        opacity: opacidade,
      }}
    >
      {/* A lombada, na borda esquerda, como no BookSpine. `alignSelf` explícito
          porque no Satori o filho de um flex não estica sozinho. */}
      <div
        style={{
          display: "flex",
          width: 12 * escala,
          alignSelf: "stretch",
          borderRadius: `${6 * escala}px 0 0 ${6 * escala}px`,
          background:
            "linear-gradient(to right, rgba(0,0,0,0.25), rgba(0,0,0,0))",
        }}
      />

      {/* As três linhas da capa, como no FloatingBook. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6 * escala,
          marginTop: 16 * escala,
          marginLeft: 8 * escala,
          marginRight: 12 * escala,
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            height: escala,
            background: "rgba(61,102,70,0.35)",
          }}
        />
        <div
          style={{
            display: "flex",
            height: escala,
            width: "75%",
            background: "rgba(61,102,70,0.25)",
          }}
        />
        <div
          style={{
            display: "flex",
            height: escala,
            width: "50%",
            background: "rgba(61,102,70,0.2)",
          }}
        />
      </div>
    </div>
  );
}

export default async function OpengraphImage() {
  const fraunces = await readFile(
    path.join(process.cwd(), "public/fonts/fraunces-400.ttf"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${CREME} 0%, ${CREME_FUNDO} 100%)`,
          fontFamily: "Fraunces",
          position: "relative",
        }}
      >
        {/* Os livros, na mesma faixa lateral que sobra na landing quando a
            coluna de conteúdo trava no meio. */}
        <Livro x={96} y={70} rotacao={-12} escala={1.9} opacidade={0.6} />
        <Livro x={975} y={110} rotacao={8} escala={1.7} opacidade={0.5} />
        <Livro x={1010} y={420} rotacao={12} escala={1.5} opacidade={0.5} />
        <Livro x={130} y={410} rotacao={-8} escala={1.4} opacidade={0.45} />

        <div
          style={{
            display: "flex",
            fontSize: 44,
            color: "rgba(42,37,33,0.9)",
            letterSpacing: -1,
          }}
        >
          Bookclubinho
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 28,
            fontSize: 104,
            lineHeight: 1.05,
            letterSpacing: -3,
          }}
        >
          <div style={{ display: "flex", color: CARVAO }}>Leia junto.</div>
          <div style={{ display: "flex", color: SAGE_ESCURO }}>
            Sinta junto.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 30,
            color: "rgba(42,37,33,0.65)",
          }}
        >
          O jeito mais fácil de manter um clube do livro.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Fraunces",
          data: fraunces as unknown as ArrayBuffer,
          style: "normal",
        },
      ],
    },
  );
}
