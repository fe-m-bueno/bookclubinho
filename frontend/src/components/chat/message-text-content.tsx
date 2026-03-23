"use client";

import { Fragment } from "react";
import { isValidHttpUrl, TRAILING_PUNCT_RE } from "@/lib/url-utils";

interface MessageTextContentProps {
  text: string | null;
  richJson: Record<string, unknown> | null;
}

// Regex used to split text into alternating plain/URL segments.
// With a capturing group, split() returns [plain, url, plain, url, ...].
// Note: no `g` flag — split() uses it non-statefully.
const URL_SPLIT_RE = /(https?:\/\/[^\s<>"')\]]+)/;

/**
 * Renders the text body of a message.
 *
 * The backend always persists both `content_text` (plain-text fallback) and
 * `content_rich_json` (Tiptap JSON). We intentionally render only the plain
 * text here for safety — no `dangerouslySetInnerHTML`, no external HTML
 * parser. The `richJson` prop is accepted so the component signature stays
 * stable for future enrichment, but `content_text` is always the ground truth
 * displayed to the user.
 *
 * URLs detected in the text are rendered as safe anchor tags with
 * `target="_blank" rel="noopener noreferrer"`.
 */
export function MessageTextContent({ text }: MessageTextContentProps) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {lines.map((line, lineIdx) => (
        <span key={lineIdx}>
          {line.split(URL_SPLIT_RE).map((segment, segIdx) => {
            // With a capturing-group split, odd indices are URL matches.
            if (segIdx % 2 === 1) {
              const url = segment.replace(TRAILING_PUNCT_RE, "");
              const trailing = segment.slice(url.length);
              // Only linkify if the stripped value is still a valid URL.
              if (isValidHttpUrl(url)) {
                return (
                  <Fragment key={segIdx}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 break-all hover:text-primary/80"
                    >
                      {url}
                    </a>
                    {trailing}
                  </Fragment>
                );
              }
              return <Fragment key={segIdx}>{segment}</Fragment>;
            }
            return <Fragment key={segIdx}>{segment}</Fragment>;
          })}
          {lineIdx < lines.length - 1 && <br />}
        </span>
      ))}
    </p>
  );
}
