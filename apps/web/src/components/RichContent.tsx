import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
export function RichContent({
  content,
  format = "text",
}: {
  content: string;
  format?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current
      ?.querySelectorAll<HTMLElement>("[data-latex]")
      .forEach((node) => {
        try {
          katex.render(node.dataset.latex ?? "", node, {
            throwOnError: false,
            trust: false,
            displayMode: node.dataset.type === "block-math",
          });
        } catch {
          node.textContent = node.dataset.latex ?? "";
        }
      });
  }, [content, format]);
  return format === "html" ? (
    <div
      ref={root}
      className="lesson-content break-words"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(content, {
          ADD_ATTR: ["data-latex", "data-type"],
        }),
      }}
    />
  ) : (
    <div ref={root} className="whitespace-pre-wrap break-words">
      {content.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).map((part, i) =>
        part.startsWith("$") ? (
          <span
            key={i}
            data-type={part.startsWith("$$") ? "block-math" : "inline-math"}
            data-latex={part.slice(
              part.startsWith("$$") ? 2 : 1,
              part.startsWith("$$") ? -2 : -1,
            )}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </div>
  );
}
