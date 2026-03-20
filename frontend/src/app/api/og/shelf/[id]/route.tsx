import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { ShelfResponse } from "@/lib/types/shelf";

export const runtime = "edge";

async function fetchShelf(id: string): Promise<ShelfResponse | null> {
  try {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    // next.revalidate is not supported in edge runtime — CDN caching is
    // handled by the Cache-Control response header set below
    const res = await fetch(`${apiUrl}/api/v1/shelf/${id}`);
    if (!res.ok) return null;
    return res.json() as Promise<ShelfResponse>;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shelf = await fetchShelf(id);

  const groupName = shelf?.group_name ?? "Clube do Livro";
  const books = shelf?.books ?? [];
  const bookCount = books.length;
  const covers = books
    .slice(0, 4)
    .map((b) => b.book_cover_url)
    .filter((u): u is string => Boolean(u));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #F8DFBF 0%, #DFB98A 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px",
          fontFamily: "sans-serif",
          gap: "0px",
        }}
      >
        {/* Book covers collage */}
        {covers.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "36px",
              alignItems: "flex-end",
            }}
          >
            {covers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                style={{
                  width: "108px",
                  height: "162px",
                  objectFit: "cover",
                  borderRadius: "8px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
                  transform: `rotate(${(i - (covers.length - 1) / 2) * 3}deg)`,
                }}
              />
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <p
            style={{
              fontSize: "20px",
              color: "#7A5C40",
              margin: "0",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Estante do
          </p>
          <h1
            style={{
              fontSize: "52px",
              fontWeight: "bold",
              color: "#30261D",
              textAlign: "center",
              margin: "0",
              lineHeight: "1.1",
            }}
          >
            {groupName}
          </h1>
          <p
            style={{
              fontSize: "24px",
              color: "#5A4032",
              margin: "0",
              marginTop: "4px",
            }}
          >
            {bookCount} livro{bookCount !== 1 ? "s" : ""} lido
            {bookCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
