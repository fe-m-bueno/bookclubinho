"use client";

interface MessageTextContentProps {
  text: string | null;
  richJson: Record<string, unknown> | null;
}

/**
 * Renders the text body of a message.
 *
 * The backend always persists both `content_text` (plain-text fallback) and
 * `content_rich_json` (Tiptap JSON). We intentionally render only the plain
 * text here for safety — no `dangerouslySetInnerHTML`, no external HTML
 * parser. The `richJson` prop is accepted so the component signature stays
 * stable for future enrichment, but `content_text` is always the ground truth
 * displayed to the user.
 */
export function MessageTextContent({ text }: MessageTextContentProps) {
  if (!text) return null;

  // Split on newlines and interleave <br> elements so we preserve intentional
  // line breaks without needing dangerouslySetInnerHTML.
  const lines = text.split("\n");

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </p>
  );
}
