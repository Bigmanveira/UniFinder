// ─────────────────────────────────────────────────────────────────────────────
// CvMarkdown — minimal Markdown → React renderer scoped to the subset our
// academic CV generator outputs. We deliberately avoid pulling in a full
// Markdown lib (react-markdown is ~30KB gzipped) because the format is
// known and narrow:
//
//   # H1               — candidate name
//   ## H2              — section headers
//   ### H3             — sub-section headers (rare; reviewer mode)
//   **bold**           — degree names, role titles
//   *italics*          — venue names
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
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++} className="text-3xl font-black tracking-tight text-slate-900 mb-1">{renderInline(line.slice(2))}</h1>);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="text-base font-black tracking-wider text-slate-900 uppercase mt-6 mb-2 pb-1 border-b border-slate-200">
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push(<h3 key={key++} className="text-sm font-black text-slate-900 mt-4 mb-1.5">{renderInline(line.slice(4))}</h3>);
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
          {items.map((item, idx) => <li key={idx} className="text-[14px] text-slate-700 leading-relaxed">{renderInline(item)}</li>)}
        </ul>,
      );
    } else {
      // Paragraph — accumulate consecutive non-blank, non-special lines
      // into one paragraph so soft-wrapped prose renders as one block.
      const para: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#|\-|\*\s)/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      blocks.push(
        <p key={key++} className="text-[14px] text-slate-700 leading-relaxed my-2">{renderInline(para.join(" "))}</p>,
      );
    }
  }

  return <div className={className}>{blocks}</div>;
}
