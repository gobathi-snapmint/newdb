// Exports for the Review Report: standalone HTML (inline SVG charts), Markdown
// (charts embedded as PNG images) and PowerPoint (native, editable charts and tables).
// Everything is generated in the browser — no data leaves the machine.
import { METRIC, fmt, fmtDelta, fmtPct } from './metrics';

const PREV = '#94a3b8', CURR = '#4f46e5', TEXT = '#1e293b', MUTED = '#64748b', GRID = '#e2e8f0';
const FONT = 'Arial, Helvetica, sans-serif';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (k, v) => fmt(k, v, { short: true });
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- SVG charts ----------
export function svgBars(key, rows, { width = 620 } = {}) {
  const left = 140, right = 70, top = 26, rowH = 32, h = top + rows.length * rowH + 8;
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.curr || 0, r.prev || 0]));
  const w = width - left - right;
  const bar = (v, y, color) => {
    const bw = Math.max(0, ((v || 0) / max) * w);
    return `<rect x="${left}" y="${y}" width="${bw.toFixed(1)}" height="11" rx="2" fill="${color}"/>`
      + `<text x="${(left + bw + 4).toFixed(1)}" y="${y + 9}" font-size="10" fill="${MUTED}">${esc(v == null ? '—' : short(key, v))}</text>`;
  };
  const body = rows.map((r, i) => {
    const y = top + i * rowH;
    return `<text x="${left - 8}" y="${y + 15}" font-size="11" fill="${TEXT}" text-anchor="end">${esc(cut(String(r.group), 20))}</text>${bar(r.prev, y + 2, PREV)}${bar(r.curr, y + 15, CURR)}`;
  }).join('');
  const legend = `<rect x="${left}" y="6" width="10" height="10" fill="${PREV}"/><text x="${left + 14}" y="15" font-size="11" fill="${MUTED}">Previous</text>`
    + `<rect x="${left + 84}" y="6" width="10" height="10" fill="${CURR}"/><text x="${left + 98}" y="15" font-size="11" fill="${MUTED}">Current</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>${legend}${body}</svg>`, width, height: h };
}

export function svgTrend(key, points, { width = 620, height = 220 } = {}) {
  const L = 64, R = 12, T = 26, B = 30, w = width - L - R, h = height - T - B;
  const vals = points.flatMap((p) => [p.curr, p.prev]).filter((v) => v != null);
  if (!vals.length) return { svg: '', width, height };
  const isCount = METRIC[key].kind === 'count';
  let lo = isCount ? 0 : Math.min(...vals), hi = Math.max(...vals);
  if (!isCount) { const pad = (hi - lo) * 0.1 || hi * 0.05 || 1; lo -= pad; hi += pad; }
  if (hi === lo) hi = lo + 1;
  const x = (i) => L + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v) => T + h - ((v - lo) / (hi - lo)) * h;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const grid = ticks.map((t) => `<line x1="${L}" x2="${L + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${GRID}"/><text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" font-size="10" fill="${MUTED}" text-anchor="end">${esc(short(key, t))}</text>`).join('');
  const every = Math.ceil(points.length / 8);
  const xl = points.map((p, i) => (i % every === 0 ? `<text x="${x(i).toFixed(1)}" y="${height - 10}" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('');
  const path = (k) => {
    let d = '', pen = false;
    points.forEach((p, i) => { if (p[k] == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`; pen = true; });
    return d;
  };
  const legend = `<line x1="${L}" x2="${L + 16}" y1="12" y2="12" stroke="${PREV}" stroke-width="2.5" stroke-dasharray="4 3"/><text x="${L + 20}" y="16" font-size="11" fill="${MUTED}">Previous</text>`
    + `<line x1="${L + 84}" x2="${L + 100}" y1="12" y2="12" stroke="${CURR}" stroke-width="2.5"/><text x="${L + 104}" y="16" font-size="11" fill="${MUTED}">Current</text>`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>${legend}${grid}${xl}`
      + `<path d="${path('prev')}" fill="none" stroke="${PREV}" stroke-width="2" stroke-dasharray="4 3"/><path d="${path('curr')}" fill="none" stroke="${CURR}" stroke-width="2.4"/></svg>`,
    width, height,
  };
}

function svgToPng({ svg, width, height }, scale = 2) {
  return new Promise((resolve) => {
    if (!svg) return resolve('');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = width * scale; c.height = height * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ---------- shared pieces ----------
const shareHead = (s) => (s.isCount ? 'Share (curr)' : 'Share of sent');
const tableRows = (s, b) => b.rows.map((r) => [r.group, fmt(s.key, r.prev), fmt(s.key, r.curr), fmtDelta(s.key, r.abs), r.isNew ? 'new' : fmtPct(r.pct), r.shareCurr == null ? '—' : `${r.shareCurr.toFixed(1)}%`]);
const tableHead = (s, b) => [b.title, 'Previous', 'Current', 'Δ', 'Δ %', shareHead(s)];
const kpiRow = (s) => [fmt(s.key, s.overall.prev), fmt(s.key, s.overall.curr), fmtDelta(s.key, s.overall.abs), fmtPct(s.overall.pct)];
const scopeHead = ['Metric', 'Previous', 'Current', 'Δ', 'Δ %'];
const scopeRows = (kpis) => kpis.map((k) => [k.label, fmt(k.key, k.prev), fmt(k.key, k.curr), fmtDelta(k.key, k.abs), fmtPct(k.pct)]);

const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * report: buildReport() output; notes: { metric: {key: text}, why: {id: text}, actions };
 * whys: [{ id, title, kpis }]; title: report title.
 */

// ---------- HTML ----------
export function reportHtml({ report, notes, whys, title }) {
  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const note = (t) => `<div class="note">${t?.trim() ? esc(t).replace(/\n/g, '<br>') : '<span class="empty">No notes added.</span>'}</div>`;
  const toc = [...report.sections.map((s, i) => `<a href="#m-${s.key}">${i + 1}. ${esc(s.title)}</a>`), ...whys.map((w) => `<a href="#w-${w.id}">What changed – ${esc(w.title)}</a>`), '<a href="#actions">Action items</a>'].join('');
  const sections = report.sections.map((s, i) => `
<section id="m-${s.key}"><h2>${i + 1}. ${esc(s.title)}</h2>
<h3>${esc(s.overallTitle)}</h3>${table(['Previous', 'Current', 'Δ', 'Δ %'], [kpiRow(s)])}
<div class="chart">${svgTrend(s.key, s.trend).svg}</div>
<div class="grid">${s.breakdowns.map((b) => `<div><h3>Breakup by ${esc(b.title.toLowerCase())}</h3><div class="chart">${svgBars(s.key, b.rows, { width: 520 }).svg}</div>${table(tableHead(s, b), tableRows(s, b))}${b.summary ? `<p class="auto">${esc(b.summary)}</p>` : ''}</div>`).join('')}</div>
<h3>Insights</h3>${note(notes.metric?.[s.key])}</section>`).join('');
  const why = whys.map((w) => `<section id="w-${w.id}"><h2>What has changed and why? – ${esc(w.title)}</h2>${table(scopeHead, scopeRows(w.kpis))}${note(notes.why?.[w.id])}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
body{font-family:${FONT};color:${TEXT};background:#f8fafc;margin:0;padding:24px 16px;line-height:1.45}
main{max-width:1180px;margin:0 auto}
h1{margin:0 0 4px;font-size:26px}.meta{color:${MUTED};margin-bottom:16px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}nav a{font-size:12px;padding:4px 9px;border:1px solid ${GRID};border-radius:999px;background:#fff;color:${TEXT};text-decoration:none}
section{background:#fff;border:1px solid ${GRID};border-radius:12px;padding:18px 20px;margin-bottom:18px;break-inside:avoid-page}
h2{margin:0 0 10px;font-size:20px}h3{margin:14px 0 6px;font-size:14px;color:#334155}
table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 6px}th,td{border-bottom:1px solid ${GRID};padding:5px 8px;text-align:right;white-space:nowrap}.grid>div{overflow-x:auto}th:first-child,td:first-child{text-align:left}th{background:#f1f5f9;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}@media(max-width:900px){.grid{grid-template-columns:1fr}}
.chart svg{max-width:100%;height:auto}.auto{font-size:12px;color:${MUTED};margin:4px 0}
.note{border-left:4px solid ${CURR};background:#eef2ff;padding:10px 14px;border-radius:6px;white-space:normal;font-size:13.5px}.empty{color:${MUTED};font-style:italic}
@media print{body{background:#fff}section{border:none;page-break-before:always}nav{display:none}}
</style></head><body><main>
<h1>${esc(title)}</h1><div class="meta">${esc(report.periodLabel)} · generated ${stamp()}</div>
<nav>${toc}</nav>${sections}${why}
<section id="actions"><h2>Action items</h2>${note(notes.actions)}</section>
</main></body></html>`;
}

export function downloadHtml(args) {
  download(new Blob([reportHtml(args)], { type: 'text/html' }), `crm-review-${stamp()}.html`);
}

// ---------- Markdown ----------
export async function reportMarkdown({ report, notes, whys, title }) {
  const md = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? ' ---: ' : ' --- ')).join('|')}|`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
  const note = (t) => (t?.trim() ? t.trim().split('\n').map((l) => `> ${l}`).join('\n') : '> _No notes added._');
  const out = [`# ${title}`, '', `_${report.periodLabel} · generated ${stamp()}_`, ''];
  for (const [i, s] of report.sections.entries()) {
    out.push(`## ${i + 1}. ${s.title}`, '', `### ${s.overallTitle}`, '', md(['Previous', 'Current', 'Δ', 'Δ %'], [kpiRow(s)]), '');
    const trend = await svgToPng(svgTrend(s.key, s.trend));
    if (trend) out.push(`![${s.overallTitle} trend](${trend})`, '');
    for (const b of s.breakdowns) {
      out.push(`### Breakup by ${b.title.toLowerCase()}`, '');
      const img = await svgToPng(svgBars(s.key, b.rows));
      if (img) out.push(`![${s.title} by ${b.title}](${img})`, '');
      out.push(md(tableHead(s, b), tableRows(s, b)), '');
      if (b.summary) out.push(`_${b.summary}_`, '');
    }
    out.push('### Insights', '', note(notes.metric?.[s.key]), '');
  }
  whys.forEach((w) => out.push(`## What has changed and why? – ${w.title}`, '', md(scopeHead, scopeRows(w.kpis)), '', note(notes.why?.[w.id]), ''));
  out.push('## Action items', '', note(notes.actions), '');
  return out.join('\n');
}

export async function downloadMarkdown(args) {
  download(new Blob([await reportMarkdown(args)], { type: 'text/markdown' }), `crm-review-${stamp()}.md`);
}

// ---------- PowerPoint ----------
const hex = (c) => c.replace('#', '');
const numFmt = (key) => {
  const m = METRIC[key];
  if (m.kind === 'pct') return '0.00"%"';
  if (m.kind === 'ratio') return '"₹"#,##0.00';
  if (m.unit === '₹') return '"₹"#,##0';
  return '#,##0';
};

export async function downloadPptx({ report, notes, whys, title }) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = title;
  const head = { fill: { color: 'F1F5F9' }, bold: true, color: hex(TEXT) };
  const tbl = (rows) => [rows[0].map((t) => ({ text: t, options: head })), ...rows.slice(1).map((r) => r.map((t) => ({ text: String(t) })))];
  const header = (s, text, sub) => {
    s.background = { color: 'FFFFFF' };
    s.addText(text, { x: 0.4, y: 0.25, w: 12.5, h: 0.55, fontSize: 24, bold: true, color: hex(TEXT), fontFace: 'Arial' });
    if (sub) s.addText(sub, { x: 0.4, y: 0.78, w: 12.5, h: 0.3, fontSize: 12, color: hex(MUTED), fontFace: 'Arial' });
  };
  const noteBox = (s, t, box) => s.addText(t?.trim() || 'Insights: (add notes)', {
    ...box, fontSize: 12, color: t?.trim() ? hex(TEXT) : hex(MUTED), italic: !t?.trim(), fontFace: 'Arial', valign: 'top',
    fill: { color: 'EEF2FF' }, line: { color: hex(CURR), width: 1 }, margin: 8,
  });

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addText(title, { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 36, bold: true, color: hex(TEXT), fontFace: 'Arial' });
  cover.addText(`${report.periodLabel}\nGenerated ${stamp()}`, { x: 0.6, y: 3.4, w: 12, h: 0.9, fontSize: 16, color: hex(MUTED), fontFace: 'Arial' });
  cover.addText(report.sections.map((s, i) => `${i + 1}. ${s.title}`).join('   ·   '), { x: 0.6, y: 4.6, w: 12, h: 1.2, fontSize: 12, color: hex(MUTED), fontFace: 'Arial' });

  report.sections.forEach((s, i) => {
    const series = (rows) => [
      { name: 'Previous', labels: rows.map((r) => cut(String(r.group), 22)), values: rows.map((r) => r.prev ?? 0) },
      { name: 'Current', labels: rows.map((r) => cut(String(r.group), 22)), values: rows.map((r) => r.curr ?? 0) },
    ];
    const chartOpts = { chartColors: [hex(PREV), hex(CURR)], showLegend: true, legendPos: 'b', legendFontSize: 9, valAxisLabelFormatCode: numFmt(s.key), dataLabelFormatCode: numFmt(s.key), catAxisLabelFontSize: 9, valAxisLabelFontSize: 8 };

    // Slide 1: overall + trend + insights
    const a = pptx.addSlide();
    header(a, `${i + 1}. ${s.title}`, `${s.overallTitle} · ${report.periodLabel}`);
    a.addTable(tbl([['Previous', 'Current', 'Δ', 'Δ %'], kpiRow(s)]), { x: 0.4, y: 1.2, w: 6.2, fontSize: 12, fontFace: 'Arial', border: { type: 'solid', color: 'E2E8F0', pt: 0.75 }, align: 'center' });
    if (s.trend.some((p) => p.curr != null || p.prev != null)) {
      a.addChart(pptx.charts.LINE, [
        { name: 'Previous', labels: s.trend.map((p) => p.label), values: s.trend.map((p) => p.prev ?? 0) },
        { name: 'Current', labels: s.trend.map((p) => p.label), values: s.trend.map((p) => p.curr ?? 0) },
      ], { x: 0.4, y: 2.0, w: 7.6, h: 5.1, ...chartOpts, lineSize: 2, lineDataSymbol: 'none', catAxisLabelFontSize: 8 });
    }
    const autos = s.breakdowns.map((b) => b.summary).filter(Boolean).join('\n');
    a.addText(autos || ' ', { x: 8.2, y: 1.2, w: 4.75, h: 2.2, fontSize: 10, color: hex(MUTED), fontFace: 'Arial', valign: 'top' });
    noteBox(a, notes.metric?.[s.key], { x: 8.2, y: 3.5, w: 4.75, h: 3.6 });

    // Slide 2: breakup charts (2 x 2)
    const b = pptx.addSlide();
    header(b, `${i + 1}. ${s.title} — breakups`, report.periodLabel);
    s.breakdowns.forEach((bd, j) => {
      const x = 0.4 + (j % 2) * 6.35, y = 1.15 + Math.floor(j / 2) * 3.15;
      b.addText(`By ${bd.title.toLowerCase()}`, { x, y, w: 6.1, h: 0.3, fontSize: 12, bold: true, color: hex(TEXT), fontFace: 'Arial' });
      b.addChart(pptx.charts.BAR, series(bd.rows), { x, y: y + 0.3, w: 6.1, h: 2.8, barDir: 'bar', barGrouping: 'clustered', catAxisOrientation: 'maxMin', showValue: true, dataLabelFontSize: 7, ...chartOpts });
    });

    // Slide 3: breakup tables (2 x 2)
    const c = pptx.addSlide();
    header(c, `${i + 1}. ${s.title} — breakup tables`, report.periodLabel);
    s.breakdowns.forEach((bd, j) => {
      const x = 0.4 + (j % 2) * 6.35, y = 1.15 + Math.floor(j / 2) * 3.15;
      c.addText(`By ${bd.title.toLowerCase()}`, { x, y, w: 6.1, h: 0.3, fontSize: 12, bold: true, color: hex(TEXT), fontFace: 'Arial' });
      c.addTable(tbl([tableHead(s, bd), ...tableRows(s, bd)]), { x, y: y + 0.32, w: 6.1, fontSize: 7.5, fontFace: 'Arial', rowH: 0.22, colW: [1.6, 0.95, 0.95, 0.95, 0.75, 0.9], border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, autoPage: false });
    });
  });

  whys.forEach((w) => {
    const s = pptx.addSlide();
    header(s, `What has changed and why? – ${w.title}`, report.periodLabel);
    s.addTable(tbl([scopeHead, ...scopeRows(w.kpis)]), { x: 0.4, y: 1.25, w: 5.6, fontSize: 11, fontFace: 'Arial', border: { type: 'solid', color: 'E2E8F0', pt: 0.75 }, colW: [1.4, 1.1, 1.1, 1.1, 0.9] });
    noteBox(s, notes.why?.[w.id], { x: 6.3, y: 1.25, w: 6.6, h: 5.8 });
  });

  const act = pptx.addSlide();
  header(act, 'Action items', report.periodLabel);
  noteBox(act, notes.actions, { x: 0.4, y: 1.25, w: 12.5, h: 5.8 });

  await pptx.writeFile({ fileName: `crm-review-${stamp()}.pptx` });
}
