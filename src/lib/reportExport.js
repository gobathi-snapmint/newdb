// Exports for the Review Report: standalone HTML (inline SVG charts), Markdown
// (charts embedded as PNG images) and PowerPoint (native, editable charts and tables).
// Everything is generated in the browser — no data leaves the machine.
//
// Each section is first described as plain blocks (tables + chart specs) by `sectionBlocks`,
// for both report types (period vs comparison, month on month); the three writers only draw blocks.
import { METRIC, fmt, fmtDelta, fmtPct } from './metrics';
import { pctChange } from './review';

const PREV = '#94a3b8', CURR = '#4f46e5', TEXT = '#1e293b', MUTED = '#64748b', GRID = '#e2e8f0';
const SERIES = ['#4f46e5', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316', '#64748b', '#a855f7'];
const FONT = 'Arial, Helvetica, sans-serif';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (k, v) => fmt(k, v, { short: true });
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- blocks ----------
// chart spec: { kind: 'hbar' | 'lines' | 'columns', key, labels, series: [{ name, color, values, dash }] }
const prevCurr = (prev, curr) => [{ name: 'Previous', color: PREV, values: prev, dash: true }, { name: 'Current', color: CURR, values: curr }];

function monthRow(key, name, values) {
  const n = values.length - 1;
  return [name, ...values.map((v, i) => {
    const p = i ? pctChange(v, values[i - 1]) : null;
    return `${short(key, v)}${p != null ? ` (${fmtPct(p)})` : ''}`;
  }), fmtPct(pctChange(values[n], values[0]))];
}

function sectionBlocks(report, s) {
  if (report.mode === 'trend') {
    const months = report.ranges.map((r) => r.short), span = `${months[0]} → ${months[months.length - 1]}`;
    return {
      overall: {
        table: { head: ['', ...months, span], rows: [monthRow(s.key, s.overallTitle, s.values)] },
        chart: s.isCount
          ? { kind: 'columns', key: s.key, labels: months, series: [{ name: s.overallTitle, color: CURR, values: s.values }] }
          : { kind: 'lines', key: s.key, labels: months, series: [{ name: s.overallTitle, color: CURR, values: s.values }], showValues: true },
      },
      breakups: s.breakdowns.map((b) => ({
        title: b.title,
        summary: b.summary,
        chart: { kind: 'lines', key: s.key, labels: months, series: b.series.map((g, j) => ({ name: g.group, color: g.others ? PREV : SERIES[j % SERIES.length], values: g.values, dash: g.others })) },
        table: { head: [b.title, ...months, span], rows: b.series.map((g) => monthRow(s.key, g.group, g.values)) },
      })),
      note: '(…) is the change vs the month before.',
    };
  }
  return {
    overall: {
      table: { head: ['Previous', 'Current', 'Δ', 'Δ %'], rows: [[fmt(s.key, s.overall.prev), fmt(s.key, s.overall.curr), fmtDelta(s.key, s.overall.abs), fmtPct(s.overall.pct)]] },
      chart: { kind: 'lines', key: s.key, labels: s.trend.map((p) => p.label), series: prevCurr(s.trend.map((p) => p.prev), s.trend.map((p) => p.curr)) },
    },
    breakups: s.breakdowns.map((b) => ({
      title: b.title,
      summary: b.summary,
      chart: { kind: 'hbar', key: s.key, labels: b.rows.map((r) => String(r.group)), series: prevCurr(b.rows.map((r) => r.prev), b.rows.map((r) => r.curr)) },
      table: {
        head: [b.title, 'Previous', 'Current', 'Δ', 'Δ %', s.isCount ? 'Share (curr)' : 'Share of sent'],
        rows: b.rows.map((r) => [r.group, fmt(s.key, r.prev), fmt(s.key, r.curr), fmtDelta(s.key, r.abs), r.isNew ? 'new' : fmtPct(r.pct), r.shareCurr == null ? '—' : `${r.shareCurr.toFixed(1)}%`]),
      },
    })),
  };
}

function whyTable(report, w) {
  if (report.mode === 'trend') {
    const months = report.ranges.map((r) => r.short);
    return { head: ['Metric', ...months, `${months[0]} → ${months[months.length - 1]}`], rows: w.kpis.map((k) => monthRow(k.key, k.label, k.values)) };
  }
  return { head: ['Metric', 'Previous', 'Current', 'Δ', 'Δ %'], rows: w.kpis.map((k) => [k.label, fmt(k.key, k.prev), fmt(k.key, k.curr), fmtDelta(k.key, k.abs), fmtPct(k.pct)]) };
}

// ---------- SVG charts ----------
const legendSvg = (series, x0, y0, width) => {
  let x = x0, y = y0, out = '';
  series.forEach((s) => {
    const w = 26 + Math.min(s.name.length, 22) * 6.2;
    if (x + w > width - 8) { x = x0; y += 16; }
    out += `<rect x="${x}" y="${y - 9}" width="10" height="10" fill="${s.color}"/><text x="${x + 14}" y="${y}" font-size="11" fill="${MUTED}">${esc(cut(s.name, 22))}</text>`;
    x += w;
  });
  return { svg: out, height: y - y0 + 16 };
};

function svgHBar({ key, labels, series }, width) {
  const left = 140, right = 70, rowH = 32;
  const leg = legendSvg(series, left, 15, width), top = 10 + leg.height;
  const h = top + labels.length * rowH + 8;
  const max = Math.max(1e-9, ...series.flatMap((s) => s.values.map((v) => v || 0)));
  const w = width - left - right;
  const bar = (v, y, color) => {
    const bw = Math.max(0, ((v || 0) / max) * w);
    return `<rect x="${left}" y="${y}" width="${bw.toFixed(1)}" height="11" rx="2" fill="${color}"/>`
      + `<text x="${(left + bw + 4).toFixed(1)}" y="${y + 9}" font-size="10" fill="${MUTED}">${esc(v == null ? '—' : short(key, v))}</text>`;
  };
  const body = labels.map((l, i) => {
    const y = top + i * rowH;
    return `<text x="${left - 8}" y="${y + 15}" font-size="11" fill="${TEXT}" text-anchor="end">${esc(cut(l, 20))}</text>${series.map((s, j) => bar(s.values[i], y + 2 + j * 13, s.color)).join('')}`;
  }).join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>${leg.svg}${body}</svg>`, width, height: h };
}

function svgXY({ kind, key, labels, series, showValues }, width, height = 240) {
  const vals = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!vals.length) return { svg: '', width, height };
  const leg = legendSvg(series, 64, 15, width);
  const L = 64, R = 14, T = 14 + leg.height + (showValues || kind === 'columns' ? 12 : 0), B = 30, w = width - L - R, h = height - T - B;
  const zero = METRIC[key].kind === 'count' || kind === 'columns';
  let lo = zero ? 0 : Math.min(...vals), hi = Math.max(...vals);
  if (!zero) { const pad = (hi - lo) * 0.1 || hi * 0.05 || 1; lo -= pad; hi += pad; }
  if (hi === lo) hi = lo + 1;
  const n = labels.length;
  const inset = 30; // keeps the first / last labels inside the chart
  const x = kind === 'columns' ? (i) => L + ((i + 0.5) / n) * w : (i) => L + inset + (n > 1 ? (i / (n - 1)) * (w - 2 * inset) : (w - 2 * inset) / 2);
  const y = (v) => T + h - ((v - lo) / (hi - lo)) * h;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const grid = ticks.map((t) => `<line x1="${L}" x2="${L + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${GRID}"/><text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" font-size="10" fill="${MUTED}" text-anchor="end">${esc(short(key, t))}</text>`).join('');
  const every = Math.ceil(n / 8);
  const xl = labels.map((l, i) => (i % every === 0 ? `<text x="${x(i).toFixed(1)}" y="${height - 10}" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
  let marks = '';
  if (kind === 'columns') {
    const bw = (w / n) * 0.6;
    series[0].values.forEach((v, i) => {
      if (v == null) return;
      marks += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(T + h - y(v)).toFixed(1)}" rx="3" fill="${series[0].color}"/>`
        + `<text x="${x(i).toFixed(1)}" y="${(y(v) - 4).toFixed(1)}" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(short(key, v))}</text>`;
    });
  } else {
    series.forEach((s) => {
      let d = '', pen = false;
      s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      marks += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dash ? 2 : 2.4}"${s.dash ? ' stroke-dasharray="4 3"' : ''}/>`;
      if (n <= 24) s.values.forEach((v, i) => { if (v != null) marks += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${s.color}"/>`; });
      if (showValues) s.values.forEach((v, i) => { if (v != null) marks += `<text x="${x(i).toFixed(1)}" y="${(y(v) - 7).toFixed(1)}" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(short(key, v))}</text>`; });
    });
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><rect width="100%" height="100%" fill="#fff"/>${leg.svg}${grid}${xl}${marks}</svg>`,
    width, height,
  };
}

const svgChart = (spec, width = 620) => (spec.kind === 'hbar' ? svgHBar(spec, width) : svgXY(spec, width));

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

const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fileName = (report, ext) => `crm-review${report.mode === 'trend' ? '-mom' : ''}-${stamp()}.${ext}`;

/**
 * report: buildReport() / buildTrendReport() output; notes: { metric: {key: text}, why: {id: text}, actions };
 * whys: [{ id, title, kpis }]; title: report title.
 */

// ---------- HTML ----------
export function reportHtml({ report, notes, whys, title }) {
  const trend = report.mode === 'trend';
  const table = ({ head, rows }) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const note = (t) => `<div class="note">${t?.trim() ? esc(t).replace(/\n/g, '<br>') : '<span class="empty">No notes added.</span>'}</div>`;
  const toc = [...report.sections.map((s, i) => `<a href="#m-${s.key}">${i + 1}. ${esc(s.title)}</a>`), ...whys.map((w) => `<a href="#w-${w.id}">What changed – ${esc(w.title)}</a>`), '<a href="#actions">Action items</a>'].join('');
  const sections = report.sections.map((s, i) => {
    const b = sectionBlocks(report, s);
    const breakup = (x) => `<div><h3>Breakup by ${esc(x.title.toLowerCase())}</h3><div class="chart">${svgChart(x.chart, trend ? 1080 : 520).svg}</div>${table(x.table)}${x.summary ? `<p class="auto">${esc(x.summary)}</p>` : ''}</div>`;
    return `
<section id="m-${s.key}"><h2>${i + 1}. ${esc(s.title)}</h2>
<h3>${esc(s.overallTitle)}${trend ? ' — month on month' : ''}</h3>${table(b.overall.table)}
<div class="chart">${svgChart(b.overall.chart, trend ? 1080 : 620).svg}</div>
<div class="${trend ? 'one' : 'grid'}">${b.breakups.map(breakup).join('')}</div>
${b.note ? `<p class="auto">${esc(b.note)}</p>` : ''}<h3>Insights</h3>${note(notes.metric?.[s.key])}</section>`;
  }).join('');
  const why = whys.map((w) => `<section id="w-${w.id}"><h2>What has changed and why? – ${esc(w.title)}</h2>${table(whyTable(report, w))}${note(notes.why?.[w.id])}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
body{font-family:${FONT};color:${TEXT};background:#f8fafc;margin:0;padding:24px 16px;line-height:1.45}
main{max-width:1180px;margin:0 auto}
h1{margin:0 0 4px;font-size:26px}.meta{color:${MUTED};margin-bottom:16px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}nav a{font-size:12px;padding:4px 9px;border:1px solid ${GRID};border-radius:999px;background:#fff;color:${TEXT};text-decoration:none}
section{background:#fff;border:1px solid ${GRID};border-radius:12px;padding:18px 20px;margin-bottom:18px;break-inside:avoid-page}
h2{margin:0 0 10px;font-size:20px}h3{margin:14px 0 6px;font-size:14px;color:#334155}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 6px}th,td{border-bottom:1px solid ${GRID};padding:5px 8px;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{background:#f1f5f9;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}@media(max-width:900px){.grid{grid-template-columns:1fr}}.grid>div,.one>div{min-width:0}
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
  download(new Blob([reportHtml(args)], { type: 'text/html' }), fileName(args.report, 'html'));
}

// ---------- Markdown ----------
export async function reportMarkdown({ report, notes, whys, title }) {
  const trend = report.mode === 'trend';
  const md = ({ head, rows }) => [`| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? ' ---: ' : ' --- ')).join('|')}|`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
  const note = (t) => (t?.trim() ? t.trim().split('\n').map((l) => `> ${l}`).join('\n') : '> _No notes added._');
  const out = [`# ${title}`, '', `_${report.periodLabel} · generated ${stamp()}_`, ''];
  for (const [i, s] of report.sections.entries()) {
    const b = sectionBlocks(report, s);
    out.push(`## ${i + 1}. ${s.title}`, '', `### ${s.overallTitle}${trend ? ' — month on month' : ''}`, '', md(b.overall.table), '');
    const img = await svgToPng(svgChart(b.overall.chart, trend ? 900 : 620));
    if (img) out.push(`![${s.overallTitle}](${img})`, '');
    for (const x of b.breakups) {
      out.push(`### Breakup by ${x.title.toLowerCase()}`, '');
      const ci = await svgToPng(svgChart(x.chart, trend ? 900 : 620));
      if (ci) out.push(`![${s.title} by ${x.title}](${ci})`, '');
      out.push(md(x.table), '');
      if (x.summary) out.push(`_${x.summary}_`, '');
    }
    if (b.note) out.push(`_${b.note}_`, '');
    out.push('### Insights', '', note(notes.metric?.[s.key]), '');
  }
  whys.forEach((w) => out.push(`## What has changed and why? – ${w.title}`, '', md(whyTable(report, w)), '', note(notes.why?.[w.id]), ''));
  out.push('## Action items', '', note(notes.actions), '');
  return out.join('\n');
}

export async function downloadMarkdown(args) {
  download(new Blob([await reportMarkdown(args)], { type: 'text/markdown' }), fileName(args.report, 'md'));
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
  const trend = report.mode === 'trend';
  const head = { fill: { color: 'F1F5F9' }, bold: true, color: hex(TEXT) };
  const tbl = ({ head: h, rows }) => [h.map((t) => ({ text: t, options: head })), ...rows.map((r) => r.map((t) => ({ text: String(t) })))];
  const border = { type: 'solid', color: 'E2E8F0', pt: 0.5 };
  const header = (s, text, sub) => {
    s.background = { color: 'FFFFFF' };
    s.addText(text, { x: 0.4, y: 0.25, w: 12.5, h: 0.55, fontSize: 24, bold: true, color: hex(TEXT), fontFace: 'Arial' });
    if (sub) s.addText(sub, { x: 0.4, y: 0.78, w: 12.5, h: 0.3, fontSize: 12, color: hex(MUTED), fontFace: 'Arial' });
  };
  const noteBox = (s, t, box) => s.addText(t?.trim() || 'Insights: (add notes)', {
    ...box, fontSize: 12, color: t?.trim() ? hex(TEXT) : hex(MUTED), italic: !t?.trim(), fontFace: 'Arial', valign: 'top',
    fill: { color: 'EEF2FF' }, line: { color: hex(CURR), width: 1 }, margin: 8,
  });
  const chart = (slide, spec, box) => {
    if (!spec.series.some((s) => s.values.some((v) => v != null))) return;
    const labels = spec.labels.map((l) => cut(l, 22));
    const data = spec.series.map((s) => ({ name: cut(s.name, 24), labels, values: s.values.map((v) => v ?? 0) }));
    const opts = {
      ...box, chartColors: spec.series.map((s) => hex(s.color)), showLegend: spec.series.length > 1, legendPos: 'b', legendFontSize: 9,
      valAxisLabelFormatCode: numFmt(spec.key), dataLabelFormatCode: numFmt(spec.key), catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, dataLabelFontSize: 8,
    };
    if (spec.kind === 'hbar') slide.addChart(pptx.charts.BAR, data, { ...opts, barDir: 'bar', barGrouping: 'clustered', catAxisOrientation: 'maxMin', showValue: true, dataLabelFontSize: 7 });
    else if (spec.kind === 'columns') slide.addChart(pptx.charts.BAR, data, { ...opts, barDir: 'col', showValue: true, dataLabelPosition: 'outEnd' });
    else slide.addChart(pptx.charts.LINE, data, { ...opts, lineSize: 2, lineDataSymbol: labels.length > 31 ? 'none' : 'circle', lineDataSymbolSize: 5, showValue: !!spec.showValues, dataLabelPosition: 't' });
  };
  const colW = (cols, w) => [w * (trend ? 0.2 : 0.26), ...Array(cols - 1).fill((w * (trend ? 0.8 : 0.74)) / (cols - 1))];

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addText(title, { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 36, bold: true, color: hex(TEXT), fontFace: 'Arial' });
  cover.addText(`${report.periodLabel}\nGenerated ${stamp()}`, { x: 0.6, y: 3.4, w: 12, h: 0.9, fontSize: 16, color: hex(MUTED), fontFace: 'Arial' });
  cover.addText(report.sections.map((s, i) => `${i + 1}. ${s.title}`).join('   ·   '), { x: 0.6, y: 4.6, w: 12, h: 1.2, fontSize: 12, color: hex(MUTED), fontFace: 'Arial' });

  report.sections.forEach((s, i) => {
    const b = sectionBlocks(report, s);

    // Slide 1: overall table + chart + insights
    const a = pptx.addSlide();
    header(a, `${i + 1}. ${s.title}`, `${s.overallTitle}${trend ? ' — month on month' : ''} · ${report.periodLabel}`);
    const ot = b.overall.table;
    a.addTable(tbl(ot), { x: 0.4, y: 1.2, w: trend ? 12.5 : 6.2, fontSize: trend ? 9 : 12, fontFace: 'Arial', border, align: 'center', colW: trend ? colW(ot.head.length, 12.5) : undefined });
    chart(a, b.overall.chart, { x: 0.4, y: trend ? 1.95 : 2.0, w: 7.6, h: trend ? 5.2 : 5.1 });
    const autos = [...b.breakups.map((x) => x.summary).filter(Boolean), b.note].filter(Boolean).join('\n');
    a.addText(autos || ' ', { x: 8.2, y: trend ? 1.95 : 1.2, w: 4.75, h: 2.2, fontSize: 10, color: hex(MUTED), fontFace: 'Arial', valign: 'top' });
    noteBox(a, notes.metric?.[s.key], { x: 8.2, y: trend ? 4.2 : 3.5, w: 4.75, h: trend ? 2.95 : 3.6 });

    // Slide 2: breakup charts (2 x 2)
    const c2 = pptx.addSlide();
    header(c2, `${i + 1}. ${s.title} — breakups`, report.periodLabel);
    b.breakups.forEach((x, j) => {
      const bx = 0.4 + (j % 2) * 6.35, by = 1.15 + Math.floor(j / 2) * 3.15;
      c2.addText(`By ${x.title.toLowerCase()}`, { x: bx, y: by, w: 6.1, h: 0.3, fontSize: 12, bold: true, color: hex(TEXT), fontFace: 'Arial' });
      chart(c2, x.chart, { x: bx, y: by + 0.3, w: 6.1, h: 2.8 });
    });

    // Slide 3: breakup tables (2 x 2; one per half-slide in month-on-month mode, which has wider tables)
    const perSlide = trend ? 2 : 4;
    for (let k = 0; k < b.breakups.length; k += perSlide) {
      const c3 = pptx.addSlide();
      header(c3, `${i + 1}. ${s.title} — breakup tables`, report.periodLabel);
      b.breakups.slice(k, k + perSlide).forEach((x, j) => {
        const bx = trend ? 0.4 : 0.4 + (j % 2) * 6.35, by = 1.15 + (trend ? j : Math.floor(j / 2)) * 3.15, w = trend ? 12.5 : 6.1;
        c3.addText(`By ${x.title.toLowerCase()}`, { x: bx, y: by, w, h: 0.3, fontSize: 12, bold: true, color: hex(TEXT), fontFace: 'Arial' });
        c3.addTable(tbl(x.table), { x: bx, y: by + 0.32, w, fontSize: 7.5, fontFace: 'Arial', rowH: 0.22, colW: colW(x.table.head.length, w), border, autoPage: false });
      });
    }
  });

  whys.forEach((w) => {
    const s = pptx.addSlide();
    header(s, `What has changed and why? – ${w.title}`, report.periodLabel);
    const t = whyTable(report, w);
    if (trend) {
      s.addTable(tbl(t), { x: 0.4, y: 1.25, w: 12.5, fontSize: 9, fontFace: 'Arial', border, colW: colW(t.head.length, 12.5) });
      noteBox(s, notes.why?.[w.id], { x: 0.4, y: 4.0, w: 12.5, h: 3.1 });
    } else {
      s.addTable(tbl(t), { x: 0.4, y: 1.25, w: 5.6, fontSize: 11, fontFace: 'Arial', border, colW: [1.4, 1.1, 1.1, 1.1, 0.9] });
      noteBox(s, notes.why?.[w.id], { x: 6.3, y: 1.25, w: 6.6, h: 5.8 });
    }
  });

  const act = pptx.addSlide();
  header(act, 'Action items', report.periodLabel);
  noteBox(act, notes.actions, { x: 0.4, y: 1.25, w: 12.5, h: 5.8 });

  await pptx.writeFile({ fileName: fileName(report, 'pptx') });
}
