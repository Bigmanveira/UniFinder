// ─────────────────────────────────────────────────────────────────────────────
// CvMarkdown — minimal Markdown → React renderer scoped to the subset our
// academic CV generator outputs. We deliberately avoid pulling in a full
// Markdown lib (react-markdown is ~30KB gzipped) because the format is
// known and narrow:
//
//   # H1               — candidate name (renders centred, uppercase)
//   {contact line}     — first paragraph after H1 (renders centred, slate)
//   ## H2              — section headers (centred ALL CAPS, hairline rule)
//   ### H3             — sub-section headers (rare; reviewer mode)
//   **bold**           — institution names, role titles
//   *italic*           — degrees, dates
//   - list item        — bullets within sections
//   plain paragraph    — research statement, prose
//
// Anything more exotic (tables, images, code blocks) the generator is
// told not to produce.
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  // Replace **bold** and *italic* with <strong>/<em>. We process bold
  // first because the syntax is a superset of italic.
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/;
  while (remaining.length > 0) {
    const m = pattern.exec(remaining);
    if (!m) {
      nodes.push(remaining);
      break;
    }
    if (m.index > 0) nodes.push(remaining.slice(0, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={key++}>{m[3]}</em>);
    }
    remaining = remaining.slice(m.index + m[0].length);
  }
  return nodes;
}

export default function CvMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  // Split on blank lines into blocks. Each block is then classified by
  // its first character: # heading, - bullet list, anything else =
  // paragraph. Lists are collected across consecutive `-` lines so
  // we render one <ul> instead of one per bullet.
  const blocks: ReactNode[] = [];
  const lines = markdown.split(/\r?\n/);

  let i = 0;
  let key = 0;
  let lastWasH1 = false;        // → next paragraph is the contact line; centre it.

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("# ")) {
      // Candidate name. Centred, uppercase, large — matches the standard
      // template the Builder follows. Reviewer / Converter outputs
      // tolerate centred names too (it's how most CVs print).
      blocks.push(
        <h1
          key={key++}
          className="text-3xl sm:text-4xl font-black tracking-[0.05em] text-slate-900 uppercase text-center mb-2"
        >
          {renderInline(line.slice(2))}
        </h1>,
      );
      lastWasH1 = true;
      i++;
    } else if (line.startsWith("## ")) {
      // Centred section headers with a hairline rule beneath — matches
      // the visual style of the Word-template the Builder follows
      // (centred ALL-CAPS title, thin separator line).
      blocks.push(
        <h2
          key={key++}
          className="text-[15px] font-black tracking-[0.18em] text-slate-900 uppercase mt-8 mb-3 pb-2 text-center border-b border-slate-300"
        >
          {renderInline(line.slice(3))}
        </h2>,
      );
      lastWasH1 = false;
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} className="text-sm font-black text-slate-900 mt-4 mb-1.5">
          {renderInline(line.slice(4))}
        </h3>,
      );
      lastWasH1 = false;
      i++;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Collect contiguous list items
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 my-2">
          {items.map((item, idx) => (
            <li key={idx} className="text-[14px] text-slate-700 leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      lastWasH1 = false;
    } else {
      // Paragraph — accumulate consecutive non-blank, non-special lines
      // into one paragraph so soft-wrapped prose renders as one block.
      const para: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#|\-|\*\s)/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      const isContactLine = lastWasH1;
      blocks.push(
        <p
          key={key++}
          className={
            isContactLine
              ? "text-[13px] text-slate-600 leading-relaxed text-center mb-6"
              : "text-[14px] text-slate-700 leading-relaxed my-2"
          }
        >
          {renderInline(para.join(" "))}
        </p>,
      );
      lastWasH1 = false;
    }
  }

  return <div className={className}>{blocks}</div>;
}
