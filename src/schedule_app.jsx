import { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } from "react";

/* ═══════════════ Markdown Parser ═══════════════ */
function parseMd(src) {
  if (!src) return "";
  let html = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // code blocks ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-pre"><code class="md-code-block">${code.trim()}</code></pre>`;
  });

  const lines = html.split("\n");
  const out = [];
  let inList = false;
  let listType = "";
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // skip if inside a pre block (already handled)
    if (line.includes('<pre class="md-pre">')) {
      if (inList) { out.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      if (inBlockquote) { out.push("</blockquote>"); inBlockquote = false; }
      let block = line;
      while (!block.includes("</pre>") && i + 1 < lines.length) {
        i++;
        block += "\n" + lines[i];
      }
      out.push(block);
      continue;
    }

    // inline formatting
    line = line.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    line = line.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    line = line.replace(/\*(.+?)\*/g, "<em>$1</em>");
    line = line.replace(/~~(.+?)~~/g, "<del>$1</del>");
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>');

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { out.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      if (inBlockquote) { out.push("</blockquote>"); inBlockquote = false; }
      out.push('<hr class="md-hr"/>');
      continue;
    }

    // headers
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      if (inList) { out.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      if (inBlockquote) { out.push("</blockquote>"); inBlockquote = false; }
      const level = hMatch[1].length;
      out.push(`<h${level} class="md-h md-h${level}">${hMatch[2]}</h${level}>`);
      continue;
    }

    // blockquote
    const bqMatch = line.match(/^&gt;\s?(.*)$/);
    if (bqMatch) {
      if (inList) { out.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }
      if (!inBlockquote) { out.push('<blockquote class="md-bq">'); inBlockquote = true; }
      out.push(`<p>${bqMatch[1]}</p>`);
      continue;
    } else if (inBlockquote) {
      out.push("</blockquote>");
      inBlockquote = false;
    }

    // unordered list
    const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (ulMatch) {
      if (inList && listType !== "ul") { out.push("</ol>"); inList = false; }
      if (!inList) { out.push('<ul class="md-ul">'); inList = true; listType = "ul"; }
      out.push(`<li>${ulMatch[1]}</li>`);
      continue;
    }

    // ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList && listType !== "ol") { out.push("</ul>"); inList = false; }
      if (!inList) { out.push('<ol class="md-ol">'); inList = true; listType = "ol"; }
      out.push(`<li>${olMatch[1]}</li>`);
      continue;
    }

    // close list if no longer list item
    if (inList) { out.push(listType === "ul" ? "</ul>" : "</ol>"); inList = false; }

    // checkbox (task list)
    line = line.replace(/\[x\]/gi, '<span class="md-check">✓</span>');
    line = line.replace(/\[\s?\]/g, '<span class="md-uncheck">☐</span>');

    // empty line
    if (line.trim() === "") {
      out.push("<br/>");
      continue;
    }

    out.push(`<p class="md-p">${line}</p>`);
  }

  if (inList) out.push(listType === "ul" ? "</ul>" : "</ol>");
  if (inBlockquote) out.push("</blockquote>");

  return out.join("\n");
}

/* ═══════════════ Constants ═══════════════ */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const LAYOUT = { analytics: 300, gap: 14, calendar: 290, timePanel: 120, gridGap: 10 };
LAYOUT.mainGrid = LAYOUT.calendar + LAYOUT.gridGap + LAYOUT.timePanel + LAYOUT.gridGap + LAYOUT.timePanel; // 550
LAYOUT.outerWrap = LAYOUT.analytics + LAYOUT.gap + LAYOUT.mainGrid; // 864

/* ═══════════════ Theme Tokens ═══════════════ */
const themes = {
  dark: {
    bgRoot: "#0a0a0a",
    bgPopup: "#1a1a1a",
    bgMdPopup: "#141414",
    bgCard: "rgba(255,255,255,0.04)",
    bgButton: "rgba(255,255,255,0.06)",
    bgInput: "rgba(255,255,255,0.04)",
    bgSelected: "rgba(255,255,255,0.92)",
    bgHover: "rgba(255,255,255,0.08)",
    bgToolbar: "rgba(0,0,0,0.2)",
    bgToast: "rgba(255,255,255,0.1)",
    bgManualInput: "rgba(20,20,20,0.95)",
    bgBlob: "#e8e8e8",
    bgBarChart: "rgba(255,255,255,0.85)",
    bgBarChartDim: "rgba(255,255,255,0.2)",
    bgChartTrack: "rgba(255,255,255,0.03)",
    bgQueueTrack: "rgba(255,255,255,0.06)",
    bgTimeSlot: "rgba(255,255,255,0.04)",
    bgTimeSlotSel: "rgba(255,255,255,0.92)",
    bgTimeBadge: "rgba(255,255,255,0.04)",
    bgTimeBadgeWarn: "rgba(245,200,60,0.08)",
    bgImportConflict: "rgba(245,200,60,0.06)",
    bgDailyBar: "rgba(255,255,255,0.7)",
    bgDailyBarTrack: "rgba(255,255,255,0.03)",
    bgFYAdd: "rgba(255,255,255,0.06)",
    bgMdHint: "rgba(255,255,255,0.03)",
    bgCodeBlock: "rgba(0,0,0,0.45)",
    bgInlineCode: "rgba(110,75,180,0.15)",
    bgWarn: "rgba(245,166,35,0.1)",
    bgError: "rgba(200,60,60,0.25)",
    bgAccent: "rgba(100,160,255,0.12)",
    bgViewToggleSel: "rgba(255,255,255,0.1)",
    border: "rgba(255,255,255,0.08)",
    borderLight: "rgba(255,255,255,0.06)",
    borderMedium: "rgba(255,255,255,0.1)",
    borderStrong: "rgba(255,255,255,0.15)",
    borderAccent: "rgba(100,160,255,0.25)",
    borderTimeSlot: "rgba(255,255,255,0.06)",
    borderTimeSlotSel: "rgba(255,255,255,0.95)",
    borderBottom: "rgba(255,255,255,0.06)",
    borderTimeBadge: "rgba(255,255,255,0.08)",
    borderTimeBadgeWarn: "rgba(245,200,60,0.25)",
    borderImportConflict: "rgba(245,200,60,0.15)",
    borderError: "rgba(200,60,60,0.4)",
    borderCode: "rgba(160,120,220,0.2)",
    borderBlockquote: "rgba(255,255,255,0.15)",
    borderHr: "rgba(255,255,255,0.1)",
    borderManual: "rgba(255,255,255,0.2)",
    borderHint: "rgba(255,255,255,0.05)",
    textPrimary: "#fff",
    textSecondary: "#e0e0e0",
    textBody: "#ddd",
    textInput: "#ccc",
    textSubtle: "#aaa",
    textMuted: "#999",
    textDim: "#888",
    textWeak: "#666",
    textVeryWeak: "#555",
    textGhost: "#444",
    textInverted: "#111",
    textNonCurrent: "#3a3a3a",
    textMd: "#d4d4d4",
    textCode: "#c9d1d9",
    textAccent: "#6af",
    textLink: "#6bc5ff",
    textWarn: "#f5a623",
    textError: "#c44",
    textCheck: "#5bf",
    textCodePurple: "#d4a4f8",
    textSun: "#884444",
    textSat: "#446688",
    accent: "#6af",
    scrollbarThumb: "#333",
    gradientHeader: "linear-gradient(to bottom, rgba(18,18,18,1) 0%, rgba(18,18,18,0.9) 45%, rgba(18,18,18,0.45) 75%, transparent 100%)",
    overlay: "rgba(0,0,0,0.7)",
    shadowHeavy: "0 24px 80px rgba(0,0,0,0.8)",
    shadowPopup: "0 20px 60px rgba(0,0,0,0.7)",
    shadowDropdown: "0 8px 32px rgba(0,0,0,0.6)",
    shadowManual: "0 4px 16px rgba(0,0,0,0.5)",
    boxShadowToday: "inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  light: {
    bgRoot: "#d8d9e2",
    bgPopup: "rgba(255,255,255,0.72)",
    bgMdPopup: "rgba(255,255,255,0.78)",
    bgCard: "rgba(255,255,255,0.58)",
    bgButton: "rgba(255,255,255,0.4)",
    bgInput: "rgba(255,255,255,0.5)",
    bgSelected: "rgba(0,0,0,0.78)",
    bgHover: "rgba(255,255,255,0.65)",
    bgToolbar: "rgba(255,255,255,0.35)",
    bgToast: "rgba(255,255,255,0.72)",
    bgManualInput: "rgba(255,255,255,0.88)",
    bgBlob: "#555",
    bgBarChart: "rgba(0,0,0,0.55)",
    bgBarChartDim: "rgba(0,0,0,0.12)",
    bgChartTrack: "rgba(0,0,0,0.05)",
    bgQueueTrack: "rgba(0,0,0,0.06)",
    bgTimeSlot: "rgba(255,255,255,0.45)",
    bgTimeSlotSel: "rgba(0,0,0,0.78)",
    bgTimeBadge: "rgba(255,255,255,0.5)",
    bgTimeBadgeWarn: "rgba(245,200,60,0.15)",
    bgImportConflict: "rgba(245,200,60,0.12)",
    bgDailyBar: "rgba(0,0,0,0.4)",
    bgDailyBarTrack: "rgba(0,0,0,0.05)",
    bgTimePanel: "rgba(255,255,255,0.72)",
    bgFYAdd: "rgba(255,255,255,0.4)",
    bgMdHint: "rgba(255,255,255,0.35)",
    bgCodeBlock: "rgba(255,255,255,0.5)",
    bgInlineCode: "rgba(110,75,180,0.08)",
    bgWarn: "rgba(245,166,35,0.12)",
    bgError: "rgba(200,60,60,0.12)",
    bgAccent: "rgba(100,160,255,0.12)",
    bgViewToggleSel: "rgba(255,255,255,0.6)",
    border: "rgba(255,255,255,0.45)",
    borderLight: "rgba(255,255,255,0.3)",
    borderMedium: "rgba(255,255,255,0.55)",
    borderStrong: "rgba(255,255,255,0.6)",
    borderAccent: "rgba(100,160,255,0.35)",
    borderTimeSlot: "rgba(255,255,255,0.35)",
    borderTimeSlotSel: "rgba(0,0,0,0.8)",
    borderBottom: "rgba(255,255,255,0.4)",
    borderTimeBadge: "rgba(255,255,255,0.45)",
    borderTimeBadgeWarn: "rgba(245,200,60,0.3)",
    borderImportConflict: "rgba(245,200,60,0.25)",
    borderError: "rgba(200,60,60,0.35)",
    borderCode: "rgba(110,75,180,0.15)",
    borderBlockquote: "rgba(0,0,0,0.1)",
    borderHr: "rgba(0,0,0,0.08)",
    borderManual: "rgba(0,0,0,0.12)",
    borderHint: "rgba(255,255,255,0.25)",
    textPrimary: "#1a1a2e",
    textSecondary: "#2d2d44",
    textBody: "#3a3a52",
    textInput: "#2a2a42",
    textSubtle: "#4a4a62",
    textMuted: "#5a5a72",
    textDim: "#6a6a82",
    textWeak: "#8888a0",
    textVeryWeak: "#9898ae",
    textGhost: "#a8a8be",
    textInverted: "#fff",
    textNonCurrent: "#b8b8ca",
    textMd: "#3a3a52",
    textCode: "#3a3a52",
    textAccent: "#2a6fff",
    textLink: "#1a65d8",
    textWarn: "#a07010",
    textError: "#c44",
    textCheck: "#1a7fdd",
    textCodePurple: "#6d28d9",
    textSun: "#cc4444",
    textSat: "#446688",
    accent: "#2a6fff",
    scrollbarThumb: "rgba(255,255,255,0.5)",
    gradientHeader: "linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 45%, rgba(255,255,255,0.3) 75%, transparent 100%)",
    overlay: "rgba(0,0,0,0.25)",
    shadowHeavy: "0 24px 80px rgba(0,0,0,0.12)",
    shadowPopup: "0 20px 60px rgba(0,0,0,0.1)",
    shadowDropdown: "0 8px 32px rgba(0,0,0,0.1)",
    shadowManual: "0 4px 16px rgba(0,0,0,0.08)",
    boxShadowToday: "inset 0 0 0 1px rgba(0,0,0,0.15)",
  },
};

const StyleContext = createContext(null);

function genTimes() {
  const t = [];
  for (let h = 6; h <= 23; h++) for (let m = 0; m < 60; m += 15)
    t.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return t;
}
const ALL_TIMES = genTimes();

function getCalDays(y, m) {
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const prevLast = new Date(y, m, 0); // last day of previous month
  const days = [];
  // previous month trailing days
  for (let i = first.getDay() - 1; i >= 0; i--) {
    days.push({ day: prevLast.getDate() - i, type: "prev" });
  }
  // current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ day: d, type: "current" });
  }
  // next month leading days (fill to complete last row)
  const rem = days.length % 7;
  if (rem > 0) {
    for (let d = 1; d <= 7 - rem; d++) {
      days.push({ day: d, type: "next" });
    }
  }
  return days;
}

function getFY(y, m) { return m >= 2 ? y : y - 1; }
function getFYLabel(y, m) { return `${getFY(y,m)}年度`; }
function getFileName(y, m) { return `勤怠記録_${getFY(y,m)}年度.csv`; }

/* ─── SVG Icons ─── */
const Icon = ({ d, size = 16, sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);
const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);
const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const ChartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const PushIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const FolderIcon = () => <Icon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />;
const SaveIcon = () => <Icon d="M20 6L9 17l-5-5" size={14} />;
const ImportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
  </svg>
);
const QueueIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const FolderOpenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 11 15 14"/>
  </svg>
);

/* ─── MD toolbar icons ─── */
const mdToolbar = [
  { label: "H1", insert: "# ", tip: "見出し1" },
  { label: "H2", insert: "## ", tip: "見出し2" },
  { label: "H3", insert: "### ", tip: "見出し3" },
  { label: "B", insert: "****", cursor: -2, tip: "太字", style: { fontWeight: 700 } },
  { label: "I", insert: "**", cursor: -1, tip: "斜体", style: { fontStyle: "italic" } },
  { label: "~", insert: "~~~~", cursor: -2, tip: "取消線" },
  { label: "`", insert: "``", cursor: -1, tip: "インラインコード" },
  { label: "```", insert: "```\n\n```", cursor: -4, tip: "コードブロック" },
  { label: "•", insert: "- ", tip: "リスト" },
  { label: "1.", insert: "1. ", tip: "番号リスト" },
  { label: "☑", insert: "[x] ", tip: "チェック済" },
  { label: "☐", insert: "[ ] ", tip: "チェック未" },
  { label: ">", insert: "> ", tip: "引用" },
  { label: "—", insert: "---\n", tip: "区切り線" },
];

/* ─── TimePanel ─── */
function smoothScrollTo(container, target, duration = 400) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenter = targetRect.top + targetRect.height / 2 - containerRect.top;
  const desiredScroll = container.scrollTop + targetCenter - containerRect.height / 2;
  const start = container.scrollTop;
  const diff = desiredScroll - start;
  let startTime = null;
  function ease(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2; } // easeInOutCubic
  function step(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;
    const progress = Math.min(elapsed / duration, 1);
    container.scrollTop = start + diff * ease(progress);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ─── TimePanel icons ─── */
const ClockNowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const KeyboardIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/>
    <line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/>
    <line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/>
    <line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/>
    <line x1="8" y1="16" x2="16" y2="16"/>
  </svg>
);

function TimePanel({ label, value, onChange, height, ...rest }) {
  const { S } = useContext(StyleContext);
  const refs = useRef({});
  const listRef = useRef(null);
  const [manualInput, setManualInput] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const manualRef = useRef(null);

  useEffect(() => {
    if (value && refs.current[value] && listRef.current) {
      smoothScrollTo(listRef.current, refs.current[value], 500);
    }
  }, [value]);

  useEffect(() => {
    if (manualInput && manualRef.current) manualRef.current.focus();
  }, [manualInput]);

  const setNow = () => {
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    onChange(t);
    setManualInput(false);
  };

  const commitManual = () => {
    const cleaned = manualValue.replace(/[^\d:]/g, "");
    // parse HH:MM or HHMM
    let h, m;
    if (cleaned.includes(":")) {
      [h, m] = cleaned.split(":").map(Number);
    } else if (cleaned.length >= 3) {
      h = parseInt(cleaned.slice(0, -2), 10);
      m = parseInt(cleaned.slice(-2), 10);
    } else {
      setManualInput(false);
      return;
    }
    if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      onChange(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
    setManualInput(false);
    setManualValue("");
  };

  return (
    <div style={{ ...S.timePanel, ...(height ? { height } : {}), position:"relative" }} {...rest}>
      <div style={S.timePanelLabel}>
        <button style={S.tpIconBtn} onClick={setNow} title="現在時刻を設定">
          <ClockNowIcon />
        </button>
        <span style={S.tpLabelText}>{label}</span>
        <button style={S.tpIconBtn} onClick={() => { if (manualInput) { commitManual(); } else { setManualValue(value || ""); setManualInput(true); } }} title="時刻を直接入力">
          <KeyboardIcon />
        </button>
      </div>
      {manualInput && (
        <div style={S.manualInputWrap}>
          <input
            ref={manualRef}
            style={S.manualTimeInput}
            value={manualValue}
            onChange={e => setManualValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitManual(); if (e.key === "Escape") setManualInput(false); }}
            onBlur={commitManual}
            placeholder="HH:MM"
            maxLength={5}
          />
        </div>
      )}
      <div style={S.timeListWrap}>
        <div style={S.timeList} ref={listRef} className="time-scroll">
          {ALL_TIMES.map(t => (
            <button key={t} ref={el => refs.current[t] = el} onClick={() => onChange(t === value ? null : t)}
              style={{ ...S.timeSlot, ...(t === value ? S.timeSlotSel : {}) }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Markdown Preview ─── */
function createMdStyles(t) {
  return `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  .md-preview { font-size: 13px; line-height: 1.75; color: ${t.textMd}; word-wrap: break-word; font-family: 'Hiragino Sans', 'Noto Sans JP', 'SF Pro Display', sans-serif; }
  .md-preview .md-h { margin: 12px 0 6px; color: ${t.textPrimary}; font-weight: 600; }
  .md-preview .md-h1 { font-size: 20px; border-bottom: 1px solid ${t.borderHr}; padding-bottom: 6px; }
  .md-preview .md-h2 { font-size: 17px; border-bottom: 1px solid ${t.borderLight}; padding-bottom: 4px; }
  .md-preview .md-h3 { font-size: 15px; }
  .md-preview .md-p { margin: 4px 0; }
  .md-preview strong { color: ${t.textPrimary}; }
  .md-preview em { color: ${t.textInput}; }
  .md-preview del { color: ${t.textDim}; text-decoration: line-through; }
  .md-preview .md-inline-code {
    background: ${t.bgInlineCode}; border: 1px solid ${t.borderCode};
    border-radius: 4px; padding: 2px 6px; font-family: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace; font-size: 12px; color: ${t.textCodePurple}; letter-spacing: 0.3px;
  }
  .md-preview .md-pre {
    background: ${t.bgCodeBlock}; border: 1px solid ${t.border};
    border-radius: 8px; padding: 14px 16px; margin: 8px 0; overflow-x: auto;
  }
  .md-preview .md-code-block {
    font-family: 'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace; font-size: 12px; color: ${t.textCode}; line-height: 1.7; letter-spacing: 0.3px;
  }
  .md-preview .md-ul, .md-preview .md-ol { margin: 6px 0; padding-left: 22px; }
  .md-preview li { margin: 3px 0; }
  .md-preview .md-bq {
    border-left: 3px solid ${t.borderBlockquote}; margin: 8px 0; padding: 4px 14px; color: ${t.textSubtle};
  }
  .md-preview .md-bq p { margin: 2px 0; }
  .md-preview .md-hr { border: none; border-top: 1px solid ${t.borderHr}; margin: 12px 0; }
  .md-preview .md-link { color: ${t.textLink}; text-decoration: none; }
  .md-preview .md-check { color: ${t.textCheck}; margin-right: 4px; }
  .md-preview .md-uncheck { color: ${t.textWeak}; margin-right: 4px; }
  .md-preview br { display: block; margin: 2px 0; content: ""; }
`;
}

function MdPreview({ text }) {
  const { t } = useContext(StyleContext);
  const html = useMemo(() => parseMd(text), [text]);
  const mdStyles = useMemo(() => createMdStyles(t), [t]);
  return (
    <>
      <style>{mdStyles}</style>
      <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

/* ─── AnimatedBar ─── */
function AnimatedBar({ pct, delay, color, active }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 80 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div style={{
      height: 18, borderRadius: 4, transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)",
      width: `${width}%`, background: color,
      boxShadow: active ? `0 0 12px ${color}44` : "none",
    }} />
  );
}

/* ─── DrillIcon ─── */
const DrillIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
  </svg>
);
const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

/* ─── DailyTimeBar ─── */
const AXIS_START = 6; // 6:00
const AXIS_END = 24;  // 24:00
const AXIS_RANGE = AXIS_END - AXIS_START; // 18 hours

function DailyTimeBar({ clockIn, clockOut, delay }) {
  const { S, t } = useContext(StyleContext);
  const [width, setWidth] = useState(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!clockIn || !clockOut) { setWidth(0); return; }
    const [ih, im] = clockIn.split(":").map(Number);
    const [oh, om] = clockOut.split(":").map(Number);
    const startH = ih + im / 60;
    const endH = oh + om / 60;
    if (endH <= startH) { setWidth(0); return; }

    const l = Math.max(0, ((startH - AXIS_START) / AXIS_RANGE) * 100);
    const r = Math.min(100, ((endH - AXIS_START) / AXIS_RANGE) * 100);

    setTimeout(() => {
      setLeft(l);
      setWidth(r - l);
    }, 60 + delay);
  }, [clockIn, clockOut, delay]);

  return (
    <div style={S.dailyBarTrack}>
      <div style={{
        position: "absolute", left: `${left}%`, height: "100%",
        width: `${width}%`, borderRadius: 3,
        background: t.bgDailyBar,
        transition: "width 0.6s cubic-bezier(0.22,1,0.36,1), left 0.3s ease",
      }} />
    </div>
  );
}

/* ─── DailyDetailView ─── */
function DailyDetailView({ monthIdx, fiscalYear, records }) {
  const { S, t } = useContext(StyleContext);
  const y = monthIdx >= 2 ? fiscalYear : fiscalYear + 1;
  const prefix = `${y}-${String(monthIdx + 1).padStart(2, "0")}`;
  const daysInMonth = new Date(y, monthIdx + 1, 0).getDate();
  const DAYS_JP = ["日","月","火","水","木","金","土"];

  const fmtH = (h) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h${mins}m` : `${hrs}h`;
  };

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${prefix}-${String(d).padStart(2, "0")}`;
    const rec = records[key];
    const dow = new Date(y, monthIdx, d).getDay();
    days.push({ day: d, dow, key, rec: rec || null });
  }

  // axis labels
  const axisLabels = [6, 9, 12, 15, 18, 21, 24];

  return (
    <div>
      {/* axis */}
      <div style={S.dailyAxisRow}>
        <span style={S.dailyDayCol} />
        <span style={S.dailyDowCol} />
        <div style={S.dailyAxisTrack}>
          {axisLabels.map(h => (
            <span key={h} style={{ ...S.dailyAxisLabel, left: `${((h - AXIS_START) / AXIS_RANGE) * 100}%` }}>
              {h}
            </span>
          ))}
        </div>
        <span style={S.dailyHoursCol} />
      </div>

      {/* days */}
      <div style={S.dailyGrid}>
        {days.map((d, i) => {
          const isWeekend = d.dow === 0 || d.dow === 6;
          const hasData = d.rec?.clockIn && d.rec?.clockOut;
          let hours = 0;
          if (hasData) {
            const [ih, im] = d.rec.clockIn.split(":").map(Number);
            const [oh, om] = d.rec.clockOut.split(":").map(Number);
            hours = (oh * 60 + om - ih * 60 - im) / 60;
          }

          return (
            <div key={i} style={{
              ...S.dailyRow,
              ...(isWeekend ? { opacity: 0.5 } : {}),
            }}>
              <span style={S.dailyDayCol}>{d.day}</span>
              <span style={{ ...S.dailyDowCol, ...(d.dow === 0 ? { color: t.textSun } : d.dow === 6 ? { color: t.textSat } : {}) }}>
                {DAYS_JP[d.dow]}
              </span>
              <DailyTimeBar clockIn={d.rec?.clockIn} clockOut={d.rec?.clockOut} delay={i * 30} />
              <span style={S.dailyHoursCol}>
                {hasData ? fmtH(hours) : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── AnalyticsPanel (inline) ─── */
function AnalyticsPanel({ analytics, month, fiscalYear, records, onNavigateMonth }) {
  const { S, t } = useContext(StyleContext);
  const { monthlyData, cur, avgHours, maxHours } = analytics;
  const [drillMonth, setDrillMonth] = useState(null);
  const [hoverMonth, setHoverMonth] = useState(null);
  const [fadeMonth, setFadeMonth] = useState(null);
  const hideTimer = useRef(null);

  const fmtH = (h) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  const statCards = [
    { label: "勤務日数", value: `${cur.days} 日`, sub: `${month + 1}月` },
    { label: "総勤務時間", value: fmtH(cur.hours), sub: cur.days > 0 ? `${Math.round(cur.totalMin)}分` : "—" },
    { label: "平均 / 日", value: fmtH(avgHours), sub: cur.days > 0 ? "per day" : "—" },
  ];

  return (
    <div style={S.analyticsInline}>
      {/* header */}
      <div style={S.analyticsInlineHeader}>
        <span style={S.analyticsInlineTitle}>
          {fiscalYear}年度{drillMonth !== null ? ` ／ ${drillMonth + 1}月` : ""}
        </span>
        {drillMonth !== null && (
          <button style={S.headerBackBtn} onClick={() => setDrillMonth(null)} title="一覧に戻る"><BackIcon /></button>
        )}
      </div>

      {drillMonth !== null ? (
        <div style={{padding:"0 12px 14px"}}>
          <DailyDetailView
            monthIdx={drillMonth}
            fiscalYear={fiscalYear}
            records={records}
          />
        </div>
      ) : (
        <>
          {/* stat cards */}
          <div style={S.statRow}>
            {statCards.map((s, i) => (
              <div key={i} style={S.statCard}>
                <div style={S.statLabel}>{s.label}</div>
                <div style={S.statValue}>{s.value}</div>
                <div style={S.statSub}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* bar chart */}
          <div style={S.chartSection}>
            <div style={S.chartTitle}>月別勤務時間</div>
            <div style={S.chartGrid}>
              {monthlyData.map((m, i) => {
                const pct = maxHours > 0 ? (m.hours / maxHours) * 100 : 0;
                const isCurrentMonth = m.month === month;
                const isHovered = hoverMonth === i;
                const isFading = fadeMonth === i;
                const barColor = isCurrentMonth ? t.bgBarChart : isHovered ? t.bgBarChart : t.bgBarChartDim;
                const avgH = m.days > 0 ? m.hours / m.days : 0;
                const hrs = Math.floor(m.hours);
                const mins = Math.round((m.hours - hrs) * 60);
                return (
                  <div key={i} style={S.chartRow}>
                    <span style={{ ...S.chartLabel, ...(isCurrentMonth ? { color: t.textPrimary, fontWeight: 600 } : {}) }}>{m.label}</span>
                    <div
                      style={{ height:18, borderRadius:4, position:"relative", cursor: m.days > 0 ? "pointer" : "default" }}
                      onMouseEnter={() => { clearTimeout(hideTimer.current); setFadeMonth(null); setHoverMonth(i); }}
                      onMouseLeave={() => { hideTimer.current = setTimeout(() => { setFadeMonth(i); setHoverMonth(null); }, 120); }}
                      onClick={() => { if (m.days > 0 && onNavigateMonth) onNavigateMonth(m.month); }}
                    >
                      <div style={{ height:"100%", background:t.bgChartTrack, borderRadius:4, overflow:"hidden" }}>
                        <AnimatedBar pct={pct} delay={i * 50} color={barColor} active={isCurrentMonth || isHovered} />
                      </div>
                      {(isHovered || isFading) && (
                        <div style={{
                          position:"absolute", left:"100%", top:0, marginLeft:6, zIndex:10,
                          background:t.bgMdPopup[0]==='#'?`rgba(${parseInt(t.bgMdPopup.slice(1,3),16)},${parseInt(t.bgMdPopup.slice(3,5),16)},${parseInt(t.bgMdPopup.slice(5,7),16)},0.75)`:t.bgMdPopup,
                          border:`1px solid ${t.borderMedium}`, borderRadius:8,
                          padding:"6px 8px 4px", fontSize:11, lineHeight:1.5,
                          backdropFilter:"blur(24px) saturate(1.4)", WebkitBackdropFilter:"blur(24px) saturate(1.4)",
                          boxShadow:t.shadowDropdown, whiteSpace:"nowrap",
                          color:t.textBody,
                          opacity: isFading ? 0 : 1,
                          transition: "opacity 0.2s ease",
                          pointerEvents: isFading ? "none" : "auto",
                        }}
                        onMouseEnter={() => { clearTimeout(hideTimer.current); setFadeMonth(null); setHoverMonth(i); }}
                        onMouseLeave={() => { hideTimer.current = setTimeout(() => { setFadeMonth(i); setHoverMonth(null); }, 120); }}
                        onTransitionEnd={() => { if (isFading) setFadeMonth(null); }}
                        >
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                            <span style={{fontWeight:600,color:t.textPrimary}}>{m.label}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDrillMonth(m.month); setHoverMonth(null); }}
                              style={{background:"none",border:"none",cursor:"pointer",padding:1,display:"flex",color:t.textDim,transition:"color .15s"}}
                              title={`${m.label}の詳細を開く`}
                              onMouseEnter={e => e.currentTarget.style.color = t.textAccent}
                              onMouseLeave={e => e.currentTarget.style.color = t.textDim}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                            </button>
                          </div>
                          <div>勤務日数: {m.days}日</div>
                          <div>合計: {hrs}h{mins > 0 ? ` ${mins}m` : ""}</div>
                          {m.days > 0 && <div>平均: {Math.floor(avgH)}h{Math.round((avgH % 1) * 60) > 0 ? ` ${Math.round((avgH % 1) * 60)}m` : ""}/日</div>}
                        </div>
                      )}
                    </div>
                    <span style={{ ...S.chartHours, ...(isCurrentMonth ? { color: t.textPrimary } : {}) }}>
                      {m.hours > 0 ? fmtH(m.hours) : "—"}
                    </span>
                    <span style={S.chartDays}>{m.days > 0 ? `${m.days}日` : ""}</span>
                    <button
                      style={{ ...S.drillBtn, ...(m.days > 0 ? {} : { opacity: 0.2, pointerEvents: "none" }) }}
                      onClick={() => setDrillMonth(m.month)}
                      title={`${m.label}の詳細`}
                    >
                      <DrillIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── MetaballGrid (calendar with gooey blob selection) ─── */
function MetaballGrid({ calDays, selectedDay, month, year, records, isToday, onDayClick }) {
  const { S, t } = useContext(StyleContext);
  const gridRef = useRef(null);
  const cellMap = useRef({});
  const blobMain = useRef(null);
  const blobTrail = useRef(null);
  const anim = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, trailX: 0, trailY: 0, trailScale: 0, trailDecay: 0.85, angle: 0, running: false });
  const prevSel = useRef(null);
  const mounted = useRef(false);

  const getCellPos = useCallback((day) => {
    const cell = cellMap.current[`cur-${day}`];
    const grid = gridRef.current;
    if (!cell || !grid) return null;
    const gr = grid.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    return { x: cr.left - gr.left + cr.width / 2, y: cr.top - gr.top + cr.height / 2, w: cr.width, h: cr.height };
  }, []);

  // spring tick
  const tick = useCallback(() => {
    const a = anim.current;
    const bm = blobMain.current;
    const bt = blobTrail.current;
    if (!bm || !bt) return;

    const STIFF = 0.1;
    const DAMP = 0.7;

    a.vx += (a.tx - a.x) * STIFF;
    a.vy += (a.ty - a.y) * STIFF;
    a.vx *= DAMP;
    a.vy *= DAMP;
    a.x += a.vx;
    a.y += a.vy;

    // trail shrink
    a.trailScale *= a.trailDecay;

    // velocity-based squash & stretch
    const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    const stretch = 1 + speed * 0.06;
    const squash = 1 / Math.sqrt(stretch); // volume preservation

    // smooth angle: only update when speed is meaningful
    if (speed > 0.5) {
      const targetAngle = Math.atan2(a.vy, a.vx);
      // lerp angle (handle wrapping)
      let diff = targetAngle - a.angle;
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      a.angle += diff * 0.3;
    }
    // as speed drops, smoothly blend stretch back to 1
    const smoothStretch = 1 + (stretch - 1) * Math.min(speed / 1.5, 1);
    const smoothSquash = 1 + (squash - 1) * Math.min(speed / 1.5, 1);

    // main blob
    const sz = 36;
    bm.style.left = `${a.x - sz / 2}px`;
    bm.style.top = `${a.y - sz / 2}px`;
    bm.style.width = `${sz}px`;
    bm.style.height = `${sz}px`;
    bm.style.transform = `rotate(${a.angle}rad) scale(${smoothStretch},${smoothSquash}) rotate(${-a.angle}rad)`;
    bm.style.opacity = "1";

    // trail blob
    if (a.trailScale > 0.02) {
      const ts = sz * a.trailScale;
      bt.style.left = `${a.trailX - ts / 2}px`;
      bt.style.top = `${a.trailY - ts / 2}px`;
      bt.style.width = `${ts}px`;
      bt.style.height = `${ts}px`;
      bt.style.opacity = `${Math.min(a.trailScale * 1.5, 1)}`;
      bt.style.transform = "none";
    } else {
      bt.style.opacity = "0";
    }

    const settled = speed < 0.1 &&
                    Math.abs(a.tx - a.x) < 0.3 && Math.abs(a.ty - a.y) < 0.3 &&
                    a.trailScale < 0.02;
    if (!settled) {
      requestAnimationFrame(tick);
    } else {
      a.x = a.tx; a.y = a.ty; a.vx = 0; a.vy = 0;
      bm.style.left = `${a.x - 18}px`;
      bm.style.top = `${a.y - 18}px`;
      bm.style.transform = "scale(1,1)";
      bt.style.opacity = "0";
      a.running = false;
    }
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      // first render: place blob instantly
      mounted.current = true;
      requestAnimationFrame(() => {
        const pos = getCellPos(selectedDay);
        if (pos && blobMain.current) {
          const a = anim.current;
          a.x = pos.x; a.y = pos.y; a.tx = pos.x; a.ty = pos.y;
          a.trailScale = 0;
          blobMain.current.style.left = `${pos.x - 18}px`;
          blobMain.current.style.top = `${pos.y - 18}px`;
          blobMain.current.style.width = "36px";
          blobMain.current.style.height = "36px";
          blobMain.current.style.opacity = "1";
          blobMain.current.style.transform = "none";
        }
      });
      prevSel.current = selectedDay;
      return;
    }

    if (prevSel.current === selectedDay) return;

    const oldPos = getCellPos(prevSel.current);
    const newPos = getCellPos(selectedDay);
    prevSel.current = selectedDay;

    if (!newPos) return;

    const a = anim.current;

    if (oldPos) {
      // compute grid distance for decay rate
      const cellW = oldPos.w || 40;
      const cellH = oldPos.h || 40;
      const gridDx = Math.abs(newPos.x - oldPos.x) / cellW;
      const gridDy = Math.abs(newPos.y - oldPos.y) / cellH;
      const gridDist = Math.sqrt(gridDx * gridDx + gridDy * gridDy);

      // adjacent (≤1.5 cells): slow trail decay → long gooey bridge
      // distant: fast trail decay → shrink/grow
      a.trailDecay = gridDist <= 1.5 ? 0.92 : gridDist <= 3 ? 0.85 : 0.75;

      a.trailX = a.x;
      a.trailY = a.y;
      a.trailScale = 1;
    } else {
      a.trailScale = 0;
      a.x = newPos.x;
      a.y = newPos.y;
    }

    a.tx = newPos.x;
    a.ty = newPos.y;

    if (!a.running) {
      a.running = true;
      requestAnimationFrame(tick);
    }
  }, [selectedDay, calDays]);

  // on month change, instantly reposition
  useEffect(() => {
    requestAnimationFrame(() => {
      const pos = getCellPos(selectedDay);
      if (pos && blobMain.current) {
        const a = anim.current;
        a.x = pos.x; a.y = pos.y; a.tx = pos.x; a.ty = pos.y;
        a.vx = 0; a.vy = 0; a.trailScale = 0;
        blobMain.current.style.left = `${pos.x - 18}px`;
        blobMain.current.style.top = `${pos.y - 18}px`;
        blobMain.current.style.width = "36px";
        blobMain.current.style.height = "36px";
        blobMain.current.style.opacity = "1";
        blobMain.current.style.transform = "none";
        if (blobTrail.current) blobTrail.current.style.opacity = "0";
      }
    });
  }, [month, year]);

  const rows = Array.from({ length: Math.ceil(calDays.length / 7) });

  return (
    <div ref={gridRef} style={{ position: "relative" }}>
      {/* Gooey SVG filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
      </svg>

      {/* Blob layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", filter: "url(#goo)" }}>
        <div ref={blobTrail} style={{ position: "absolute", background: t.bgBlob, borderRadius: "50%", opacity: 0, willChange: "transform, left, top, width, height, opacity" }} />
        <div ref={blobMain} style={{ position: "absolute", background: t.bgBlob, borderRadius: "50%", opacity: 0, willChange: "transform, left, top, width, height" }} />
      </div>

      {/* Day cells */}
      {rows.map((_, row) => (
        <div key={row} style={S.weekRow}>
          {calDays.slice(row * 7, row * 7 + 7).map((entry, i) => {
            const { day, type } = entry;
            const isCurrent = type === "current";
            const sel = isCurrent && day === selectedDay;
            const dot = isCurrent && !!records[`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`];
            const ci = row * 7 + i;
            const isWeekend = ci % 7 === 0 || ci % 7 === 6;
            return (
              <button
                key={i}
                ref={el => { if (isCurrent) cellMap.current[`cur-${day}`] = el; }}
                onClick={() => onDayClick(entry)}
                style={{
                  ...S.dayCell, ...S.dayCellBtn,
                  position: "relative", zIndex: 2,
                  ...(sel ? { color: t.textInverted, fontWeight: 700 } : {}),
                  ...(isCurrent && isToday(day) && !sel ? S.dayCellToday : {}),
                  ...(!isCurrent ? { color: t.textNonCurrent } : isWeekend && !sel ? { color: t.textWeak } : {}),
                }}
              >
                {day}{dot && <span style={S.dot} />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── TimeBadge (hoverable time with clear) ─── */
function TimeBadge({ label, time, onClear, warn }) {
  const { S } = useContext(StyleContext);
  const [hover, setHover] = useState(false);
  return (
    <span
      style={{ ...S.timeBadge, ...(warn ? S.timeBadgeWarn : {}) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={S.timeBadgeLabel}>{label}</span>
      <span style={S.timeBadgeTime}>{time}</span>
      {hover && (
        <span style={S.timeBadgeClear} onClick={e => { e.stopPropagation(); onClear(); }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      )}
    </span>
  );
}

/* ═══════════════ Setup Wizard ═══════════════ */
const WIZARD_STEPS = [
  { title: "ようこそ", subtitle: "勤怠記録アプリへようこそ" },
  { title: "外観を選択", subtitle: "ダークモード・ライトモードを選べます" },
  { title: "保存先フォルダ", subtitle: "CSVファイルの保存先を設定します" },
  { title: "年度の確認", subtitle: "記録する年度を確認します" },
  { title: "設定完了", subtitle: "初期設定が完了しました" },
];

function SetupWizard({ step, wizardTheme, wizardFY, setWizardTheme, setWizardFY,
  folderName, onFolderPick, onNext, onPrev, onComplete, S, t }) {
  const defaultFY = (() => { const now = new Date(); return getFY(now.getFullYear(), now.getMonth()); })();
  const currentFY = wizardFY || defaultFY;

  return (
    <div style={S.wizardOverlay}>
      <div style={S.wizardCard}>
        {/* step indicator */}
        <div style={S.wizardStepIndicator}>
          {WIZARD_STEPS.map((_, i) => (
            <div key={i} style={{ ...S.wizardDot, ...(i === step ? S.wizardDotActive : {}), ...(i < step ? { background: t.accent, border: `1px solid ${t.accent}` } : {}) }} />
          ))}
        </div>

        {/* header */}
        <div style={S.wizardHeader}>
          {step === 0 && (
            <>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div style={S.wizardTitle}>勤怠記録へようこそ</div>
              <div style={S.wizardSubtitle}>
                初回設定を行います。<br/>
                テーマ、保存先、年度を順に設定します。
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div style={S.wizardTitle}>外観を選択</div>
              <div style={S.wizardSubtitle}>使いやすいテーマを選んでください</div>
            </>
          )}
          {step === 2 && (
            <>
              <div style={S.wizardTitle}>保存先フォルダ</div>
              <div style={S.wizardSubtitle}>勤怠記録のCSVファイルを保存する場所を選びます</div>
            </>
          )}
          {step === 3 && (
            <>
              <div style={S.wizardTitle}>年度の確認</div>
              <div style={S.wizardSubtitle}>記録する年度を確認・変更できます</div>
            </>
          )}
          {step === 4 && (
            <>
              <div style={{ fontSize: 40, marginBottom: 12, color: t.accent }}>✓</div>
              <div style={S.wizardTitle}>設定完了</div>
              <div style={S.wizardSubtitle}>以下の設定で始めます</div>
            </>
          )}
        </div>

        {/* body */}
        <div style={S.wizardBody}>
          {step === 1 && (
            <div style={{ display: "flex", gap: 12 }}>
              {["dark", "light"].map(mode => {
                const tk = themes[mode];
                const sel = wizardTheme === mode;
                return (
                  <div key={mode} onClick={() => setWizardTheme(mode)}
                    style={{ ...S.wizardThemeCard, ...(sel ? S.wizardThemeCardSel : {}), background: tk.bgRoot }}>
                    <div style={{ height: 60, background: tk.bgCard, borderRadius: 8, border: `1px solid ${tk.border}`, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 12, color: tk.textSecondary }}>{mode === "dark" ? "ダーク" : "ライト"}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: sel ? t.accent : t.textSubtle }}>
                      {mode === "dark" ? "ダーク" : "ライト"}モード
                    </div>
                    {sel && <div style={{ fontSize: 11, color: t.accent, marginTop: 4 }}>✓ 選択中</div>}
                  </div>
                );
              })}
            </div>
          )}
          {step === 2 && (
            <div>
              <div style={{ ...S.folderRow, marginBottom: 8 }}>
                <div style={S.folderInputRow}>
                  <FolderIcon />
                  <input style={S.settingsInput} value={folderName} readOnly placeholder="デフォルトの場所" />
                </div>
                <button style={S.folderPickBtn} onClick={onFolderPick}>
                  <FolderOpenIcon />
                  <span style={{ marginLeft: 6, fontSize: 12 }}>参照</span>
                </button>
              </div>
              <p style={S.hint}>「参照」ボタンで保存先フォルダを選択できます。スキップするとデフォルトの場所に保存されます。</p>
            </div>
          )}
          {step === 3 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: t.textPrimary, marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>
                {currentFY}年度
              </div>
              <p style={{ fontSize: 12, color: t.textWeak, marginBottom: 16 }}>{currentFY}年4月 〜 {currentFY + 1}年3月</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: t.textMuted }}>年度を変更:</span>
                <input
                  style={S.wizardFYInput}
                  value={wizardFY || ""}
                  onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setWizardFY(v ? parseInt(v) : null); }}
                  placeholder={String(defaultFY)}
                  maxLength={4}
                />
                <span style={{ fontSize: 12, color: t.textMuted }}>年度</span>
              </div>
            </div>
          )}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "外観", value: wizardTheme === "dark" ? "ダークモード" : "ライトモード" },
                { label: "保存先", value: folderName || "デフォルト" },
                { label: "年度", value: `${currentFY}年度` },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.borderLight}` }}>
                  <span style={{ fontSize: 12, color: t.textMuted }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: t.textBody, fontWeight: 500 }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={S.wizardBtnRow}>
          <div>
            {step > 0 && <button style={S.wizardBtnSecondary} onClick={onPrev}>戻る</button>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step < 4 ? (
              <button style={S.wizardBtnPrimary} onClick={onNext}>次へ</button>
            ) : (
              <button style={S.wizardBtnPrimary} onClick={onComplete}>始める</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ CSV Creation Popup ═══════════════ */
function CSVCreationPopup({ fy, saveFolderPath, onConfirm, onCustomize, S, t }) {
  const fileName = `勤怠記録_${fy}年度.csv`;
  return (
    <div style={S.overlay}>
      <div style={S.csvPopup} onClick={e => e.stopPropagation()}>
        <div style={S.popupHeader}>
          <span style={S.popupTitle}>CSVファイルの作成</span>
        </div>
        <div style={{ padding: "12px 20px 8px" }}>
          <p style={{ fontSize: 13, color: t.textBody, lineHeight: 1.6, marginBottom: 16 }}>
            選択された年度の勤怠記録CSVファイルを作成します。
          </p>
          <div style={S.csvInfoRow}>
            <span style={S.csvInfoLabel}>年度</span>
            <span style={S.csvInfoValue}>{fy}年度（{fy}年4月 〜 {fy + 1}年3月）</span>
          </div>
          <div style={S.csvInfoRow}>
            <span style={S.csvInfoLabel}>ファイル名</span>
            <span style={S.csvInfoValue}>{fileName}</span>
          </div>
          <div style={S.csvInfoRow}>
            <span style={S.csvInfoLabel}>保存先</span>
            <span style={{ ...S.csvInfoValue, fontSize: 12, wordBreak: "break-all" }}>{saveFolderPath || "アプリ内データフォルダ"}</span>
          </div>
        </div>
        <div style={{ ...S.popupFooter, justifyContent: "center", gap: 10 }}>
          <button style={S.popupSaveBtn} onClick={onCustomize}>カスタマイズ...</button>
          <button style={{ ...S.popupSaveBtn, background: t.accent, borderColor: t.accent, color: "#fff", fontWeight: 600 }} onClick={onConfirm}>
            作成する
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Usage Tour ═══════════════ */
const TOUR_STEPS = [
  { target: "calendar", title: "月カレンダー", desc: "左右の ‹ › ボタンで月を移動し、日付をクリックして選択します。マウスホイールでも月を切り替えられます。" },
  { target: "timeIn", title: "出勤時刻", desc: "スクロールして出勤時刻を選択します。時刻を直接入力することもできます。" },
  { target: "timeOut", title: "退勤時刻", desc: "同様に退勤時刻を選択します。出勤・退勤の情報は自動で保存されます。" },
  { target: "workNote", title: "作業内容", desc: "タイトルを入力し、展開ボタンでMarkdownエディタを開けます。詳細な作業メモを記録できます。" },
  { target: "analytics", title: "分析パネル", desc: "月別勤務時間のグラフと統計を確認できます。月をクリックで詳細表示に切り替わります。" },
  { target: "importBtn", title: "インポート", desc: "Excelファイル（.xlsx）から勤怠データを一括インポートできます。複数ファイルの同時インポートも可能です。" },
  { target: "settingsBtn", title: "設定", desc: "テーマの変更、保存先フォルダの設定などが行えます。ウィザードやツアーの再実行もここから。" },
  { target: "fyPicker", title: "年度選択", desc: "年度を切り替えて別の年度の記録を表示します。新しい年度を追加することもできます。" },
];

function UsageTour({ step, onNext, onPrev, onSkip, onComplete, S, t }) {
  const [pos, setPos] = useState(null);
  const tourDef = TOUR_STEPS[step];

  useEffect(() => {
    const calc = () => {
      const el = document.querySelector(`[data-tour="${tourDef.target}"]`);
      if (!el) { setPos(null); return; }
      const r = el.getBoundingClientRect();
      const pad = 8;
      const vw = window.innerWidth, vh = window.innerHeight;
      let tooltipSide = "right";
      const tooltipW = 280, tooltipH = 200;
      if (r.right + pad + tooltipW + 20 < vw) tooltipSide = "right";
      else if (r.left - pad - tooltipW - 20 > 0) tooltipSide = "left";
      else if (r.bottom + pad + tooltipH + 20 < vh) tooltipSide = "bottom";
      else tooltipSide = "top";
      setPos({ top: r.top, left: r.left, width: r.width, height: r.height, side: tooltipSide });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [step, tourDef.target]);

  if (!pos) return null;

  const pad = 8;
  let tooltipStyle = {};
  if (pos.side === "right") tooltipStyle = { top: pos.top, left: pos.left + pos.width + pad + 12 };
  else if (pos.side === "left") tooltipStyle = { top: pos.top, left: pos.left - 280 - pad - 12 };
  else if (pos.side === "bottom") tooltipStyle = { top: pos.bottom + pad + 12, left: pos.left + pos.width / 2 - 140 };
  else tooltipStyle = { top: pos.top - 200 - pad - 12, left: pos.left + pos.width / 2 - 140 };

  return (
    <div style={S.tourOverlay}>
      <div style={{
        ...S.tourSpotlight,
        top: pos.top - pad,
        left: pos.left - pad,
        width: pos.width + pad * 2,
        height: pos.height + pad * 2,
      }} />
      <div style={{ ...S.tourTooltip, ...tooltipStyle }}>
        <div style={S.tourTooltipNum}>{step + 1} / {TOUR_STEPS.length}</div>
        <div style={S.tourTooltipTitle}>{tourDef.title}</div>
        <div style={S.tourTooltipDesc}>{tourDef.desc}</div>
        <div style={S.tourTooltipNav}>
          <button style={S.tourSkipBtn} onClick={onSkip}>スキップ</button>
          <span style={S.tourStepText}>{step + 1} / {TOUR_STEPS.length}</span>
          <div style={S.tourNavBtns}>
            {step > 0 && <button style={S.tourPrevBtn} onClick={onPrev}>戻る</button>}
            {step < TOUR_STEPS.length - 1 ? (
              <button style={S.tourNextBtn} onClick={onNext}>次へ</button>
            ) : (
              <button style={S.tourNextBtn} onClick={onComplete}>完了</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Main App ═══════════════ */
export default function ScheduleApp() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [clockIn, setClockIn] = useState(null);
  const [clockOut, setClockOut] = useState(null);
  const [records, setRecords] = useState({});
  const [workNote, setWorkNote] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saveFolderPath, setSaveFolderPath] = useState("");
  const [tempFolder, setTempFolder] = useState("");
  const [folderHandle, setFolderHandle] = useState(null);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState("split"); // "edit" | "split" | "preview"
  const [importData, setImportData] = useState(null); // { fileName, year, month, records }
  const [availableFYs, setAvailableFYs] = useState([]);
  const [showFYPicker, setShowFYPicker] = useState(false);
  const [fyInput, setFYInput] = useState("");
  const [importQueue, setImportQueue] = useState([]); // [{id,path,status,result}]
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [setupCompleted, setSetupCompleted] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardTheme, setWizardTheme] = useState("dark");
  const [wizardFY, setWizardFY] = useState(null);
  const [showCSVPopup, setShowCSVPopup] = useState(false);
  const [csvFY, setCsvFY] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourCompleted, setTourCompleted] = useState(null);
  const [wizardFolderPath, setWizardFolderPath] = useState("");
  const queueIdRef = useRef(0);
  const autoSaveTimer = useRef(null);
  const textareaRef = useRef(null);
  const calRef = useRef(null);
  const mainGridRef = useRef(null);
  const [calHeight, setCalHeight] = useState(0);
  const [mainGridWidth, setMainGridWidth] = useState(0);
  const [appVersion, setAppVersion] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [platform, setPlatform] = useState("darwin");

  const styleCtx = useMemo(() => {
    const tk = themes[theme] || themes.dark;
    return { S: createStyles(tk), t: tk };
  }, [theme]);

  // measure calendar height
  useEffect(() => {
    if (!calRef.current) return;
    const ro = new ResizeObserver(([entry]) => setCalHeight(entry.contentRect.height + 40));
    ro.observe(calRef.current);
    return () => ro.disconnect();
  }, [showWizard]);

  // measure mainGrid width
  useEffect(() => {
    if (!mainGridRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setMainGridWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    });
    ro.observe(mainGridRef.current);
    return () => ro.disconnect();
  }, [showWizard]);

  // ── Layout debug (disabled) ──
  // useEffect(() => {
  //   const raf = () => {
  //     const log = (label, el) => {
  //       if (!el) return;
  //       const r = el.getBoundingClientRect();
  //       console.log(`[${label}] left=${Math.round(r.left)} right=${Math.round(r.right)} width=${Math.round(r.width)}`);
  //     };
  //     log("outerWrap   ", document.querySelector("[data-dbg='outerWrap']"));
  //     log("header      ", document.querySelector("[data-dbg='header']"));
  //     log("headerAct   ", document.querySelector("[data-dbg='headerActions']"));
  //     log("topLayout   ", document.querySelector("[data-dbg='topLayout']"));
  //     log("analytics   ", document.querySelector("[data-dbg='analytics']"));
  //     log("contentWrap ", document.querySelector("[data-dbg='contentWrap']"));
  //     log("mainGrid    ", document.querySelector("[data-dbg='mainGrid']"));
  //     log("calendarCard", document.querySelector("[data-dbg='calendarCard']"));
  //     log("timePanel出 ", document.querySelector("[data-dbg='timeIn']"));
  //     log("timePanel退 ", document.querySelector("[data-dbg='timeOut']"));
  //     log("bottomArea  ", document.querySelector("[data-dbg='bottomArea']"));
  //     console.log(`mainGridWidth(state)=${mainGridWidth}`);
  //     console.log("---");
  //   };
  //   raf();
  //   const id = setInterval(raf, 2000);
  //   return () => clearInterval(id);
  // }, [mainGridWidth]);

  const dateKey = `${year}-${String(month+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`;
  const fiscalYear = getFY(year, month);
  const fileName = getFileName(year, month);

  useEffect(() => {
    const rec = records[dateKey];
    setClockIn(rec?.clockIn || null);
    setClockOut(rec?.clockOut || null);
    setWorkNote(rec?.note || "");
    setDirty(false);
  }, [dateKey, records]);

  useEffect(() => {
    (async () => {
      // check first-launch
      try {
        const setup = await window.storage.get("setup_completed");
        if (!setup || !setup.value) {
          setSetupCompleted(false);
          setShowWizard(true);
          setWizardStep(0);
        } else {
          setSetupCompleted(true);
          const tour = await window.storage.get("tour_completed");
          if (!tour || !tour.value) {
            setShowTour(true);
            setTourStep(0);
          } else {
            setTourCompleted(true);
          }
        }
      } catch {}

      // load persisted data
      try { const r = await window.storage.get("schedule_records"); if (r?.value) setRecords(JSON.parse(r.value)); } catch {}
      try { const p = await window.storage.get("save_folder"); if (p?.value) { setSaveFolderPath(p.value); setTempFolder(p.value); setWizardFolderPath(p.value); } } catch {}
      try { const th = await window.storage.get("theme"); if (th?.value) { setTheme(th.value); setWizardTheme(th.value); } } catch {}

      // app info & update check
      try { const v = await window.appInfo?.getVersion(); if (v) setAppVersion(v); } catch {}
      try { const s = await window.appInfo?.getLastSync(); if (s) setLastSync(formatSyncTime(s)); } catch {}
      try { const p = await window.appInfo?.getPlatform(); if (p) setPlatform(p); } catch {}
      // register download listeners (used on Windows for in-app update)
      window.updateAPI?.onProgress(p => { setUpdateDownloading(true); setUpdateProgress(p.percent); });
      window.updateAPI?.onDownloaded(() => { setUpdateDownloading(false); setUpdateDownloaded(true); });
      window.updateAPI?.check();

    })();
  }, []);

  useEffect(() => {
    window.electronAPI?.listFYs().then(fys => { if (fys?.length) setAvailableFYs(fys); }).catch(() => {});
  }, []);

  // cleanup update listeners
  useEffect(() => () => { window.updateAPI?.removeListeners?.(); }, []);

  const formatSyncTime = (iso) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    } catch { return iso; }
  };

  useEffect(() => {
    if (!dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => persistRecord(), 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [clockIn, clockOut, workNote, dirty]);

  const persistRecord = useCallback(() => {
    const updated = { ...records, [dateKey]: { clockIn, clockOut, note: workNote } };
    setRecords(updated);
    setDirty(false);
    window.storage.set("schedule_records", JSON.stringify(updated)).then(() => {
      setLastSync(formatSyncTime(new Date().toISOString()));
    }).catch(() => {});
    flash("自動保存しました");
  }, [records, dateKey, clockIn, clockOut, workNote]);

  const manualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const updated = { ...records, [dateKey]: { clockIn, clockOut, note: workNote } };
    setRecords(updated);
    setDirty(false);
    window.storage.set("schedule_records", JSON.stringify(updated)).then(() => {
      setLastSync(formatSyncTime(new Date().toISOString()));
    }).catch(() => {});
    flash("保存しました");
  };

  const reloadRecords = async () => {
    try {
      const r = await window.storage.get("schedule_records");
      if (r?.value) {
        setRecords(JSON.parse(r.value));
        setLastSync(formatSyncTime(new Date().toISOString()));
        flash("データを再読み込みしました");
      } else { flash("保存データがありません"); }
    } catch { flash("読み込みに失敗しました"); }
  };

  const showUpdateStatus = (text) => {
    setUpdateStatusText(text);
    setTimeout(() => setUpdateStatusText(null), 3000);
  };

  const checkForUpdate = async () => {
    if (!window.updateAPI || updateInfo || updateChecking) return;
    setUpdateChecking(true);
    setUpToDate(false);
    setUpdateStatusText(null);
    try {
      const result = await window.updateAPI.check();
      setUpdateChecking(false);
      if (result?.available) {
        setUpdateInfo({ version: result.version, releaseNotes: result.releaseNotes });
      } else if (result?.error) {
        showUpdateStatus("取得失敗");
      } else if (result?.reason === "dev") {
        showUpdateStatus("dev版");
      } else {
        setUpToDate(true);
        showUpdateStatus("最新です");
        setTimeout(() => setUpToDate(false), 3000);
      }
    } catch (e) {
      setUpdateChecking(false);
      showUpdateStatus("取得失敗");
    }
  };

  const pushRecords = async () => {
    manualSave();
    await exportCSV();
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const markDirty = () => setDirty(true);
  const handleClockIn = (v) => { setClockIn(v); markDirty(); };
  const handleClockOut = (v) => { setClockOut(v); markDirty(); };
  const handleNoteChange = (v) => { setWorkNote(v); markDirty(); };

  // ── wizard / tour handlers ──
  const handleWizardComplete = async () => {
    if (wizardTheme) {
      setTheme(wizardTheme);
      await window.storage.set("theme", wizardTheme);
    }
    if (wizardFolderPath) {
      setSaveFolderPath(wizardFolderPath);
      setTempFolder(wizardFolderPath);
      await window.storage.set("save_folder", wizardFolderPath);
    }
    const fy = wizardFY || getFY(today.getFullYear(), today.getMonth());
    await window.electronAPI.addFY(fy);
    setShowWizard(false);
    setCsvFY(fy);
    setShowCSVPopup(true);
  };

  const handleCSVConfirm = async () => {
    setShowCSVPopup(false);
    await window.storage.set("setup_completed", true);
    setSetupCompleted(true);
    const fys = await window.electronAPI.listFYs();
    if (fys?.length) setAvailableFYs(fys);
    const r = await window.storage.get("schedule_records");
    if (r?.value) setRecords(JSON.parse(r.value));
    setShowTour(true);
    setTourStep(0);
  };

  const handleCSVCustomize = () => {
    setShowCSVPopup(false);
    setShowSettings(true);
  };

  const handleTourComplete = async () => {
    setShowTour(false);
    setTourCompleted(true);
    await window.storage.set("tour_completed", true);
  };

  const handleTourSkip = async () => {
    setShowTour(false);
    setTourCompleted(true);
    await window.storage.set("tour_completed", true);
  };

  const handleWizardFolderPick = async () => {
    try {
      if (window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        setFolderHandle(handle);
        setWizardFolderPath(handle.name);
        flash(`フォルダ「${handle.name}」を選択しました`);
      } else {
        flash("このブラウザはフォルダ選択に対応していません");
      }
    } catch (e) {
      if (e.name !== "AbortError") flash("フォルダ選択がキャンセルされました");
    }
  };

  // ── import ──
  const startImport = async () => {
    try {
      const result = await window.electronAPI.importExcel();
      if (!result) return;
      if (result.error) { flash(result.error); return; }
      setImportData(result);
    } catch { flash("インポートに失敗しました"); }
  };
  const applyImport = (overwrite) => {
    if (!importData) return;
    const updated = { ...records };
    let added = 0, skipped = 0;
    for (const [date, rec] of Object.entries(importData.records)) {
      const existing = records[date];
      const hasExisting = existing && (existing.clockIn || existing.clockOut || existing.note);
      if (hasExisting && !overwrite) { skipped++; continue; }
      updated[date] = rec;
      added++;
    }
    setRecords(updated);
    window.storage.set("schedule_records", JSON.stringify(updated)).catch(() => {});
    setImportData(null);
    flash(overwrite ? `${added}件インポート（上書き）` : skipped > 0 ? `${added}件インポート（${skipped}件スキップ）` : `${added}件インポート`);
  };

  // ── FY picker ──
  const switchFY = (fy) => {
    setYear(fy);
    setMonth(2); // March
    setSelectedDay(1);
    setShowFYPicker(false);
  };
  const addNewFY = async (fy) => {
    if (!fy || isNaN(fy) || fy < 2000 || fy > 2100) { flash("正しい年度を入力してください"); return; }
    if (availableFYs.includes(fy)) { switchFY(fy); setFYInput(""); return; }
    await window.electronAPI.addFY(fy);
    setAvailableFYs(prev => [...prev, fy].sort((a, b) => b - a));
    switchFY(fy);
    setFYInput("");
    flash(`${fy}年度を追加しました`);
  };

  // ── batch import ──
  const startBatchImport = async () => {
    try {
      const paths = await window.electronAPI.selectExcelFiles();
      if (!paths || paths.length === 0) return;
      const entries = paths.map(p => ({ id: ++queueIdRef.current, path: p, status: "pending", result: null }));
      setImportQueue(entries);
      setShowQueuePanel(true);
      processQueue(entries);
    } catch (e) {
      // fallback: old single-file import
      console.warn("selectExcelFiles failed, falling back:", e?.message || e);
      try {
        const result = await window.electronAPI.importExcel();
        if (!result) return;
        if (result.error) { flash(result.error); return; }
        setImportData(result);
      } catch (e2) {
        flash("インポートに失敗しました");
      }
    }
  };
  const processQueue = async (queue) => {
    let currentRecords = { ...records };
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      setImportQueue(prev => prev.map(q => q.id === entry.id ? { ...q, status: "processing" } : q));
      // small delay to let UI update
      await new Promise(r => setTimeout(r, 50));
      try {
        const parsed = await window.electronAPI.parseExcelFile(entry.path);
        if (parsed.error) {
          setImportQueue(prev => prev.map(q => q.id === entry.id ? { ...q, status: "error", result: parsed.error } : q));
          continue;
        }
        // auto-create FY if needed
        if (parsed.year && parsed.month) {
          const fy = parsed.month >= 2 ? parsed.year : parsed.year - 1;
          if (!availableFYs.includes(fy)) {
            await window.electronAPI.addFY(fy);
            setAvailableFYs(prev => [...prev, fy].sort((a, b) => b - a));
          }
        }
        // merge: new entries only, skip conflicts
        let added = 0, conflicts = 0;
        const updated = { ...currentRecords };
        for (const [date, rec] of Object.entries(parsed.records)) {
          const ex = currentRecords[date];
          if (ex && (ex.clockIn || ex.clockOut || ex.note)) { conflicts++; continue; }
          updated[date] = rec;
          added++;
        }
        currentRecords = updated;
        setImportQueue(prev => prev.map(q => q.id === entry.id ? { ...q, status: "done", result: { added, conflicts, total: Object.keys(parsed.records).length } } : q));
      } catch (e) {
        setImportQueue(prev => prev.map(q => q.id === entry.id ? { ...q, status: "error", result: e.message } : q));
      }
    }
    // final save
    setRecords(currentRecords);
    window.storage.set("schedule_records", JSON.stringify(currentRecords)).catch(() => {});
  };
  const queueDone = importQueue.length > 0 && importQueue.every(q => q.status === "done" || q.status === "error");
  const queueActive = importQueue.some(q => q.status === "processing" || q.status === "pending");

  // ── folder picker ──
  const pickFolder = async () => {
    try {
      if (window.showDirectoryPicker) {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        setFolderHandle(handle);
        setTempFolder(handle.name);
        setSaveFolderPath(handle.name);
        window.storage.set("save_folder", handle.name).catch(() => {});
        flash(`フォルダ「${handle.name}」を選択しました`);
      } else {
        flash("このブラウザはフォルダ選択に対応していません");
      }
    } catch (e) {
      if (e.name !== "AbortError") flash("フォルダ選択がキャンセルされました");
    }
  };

  // ── CSV export (with File System Access fallback) ──
  const exportCSV = useCallback(async () => {
    const BOM = "\uFEFF";
    const fyS = `${fiscalYear}-03-01`, fyE = `${fiscalYear+1}-02-29`;
    let csv = BOM + "日付,曜日,出勤,退勤,作業内容\n";
    Object.keys(records).filter(k => k >= fyS && k <= fyE).sort().forEach(k => {
      const r = records[k], d = new Date(k), dow = DAYS_JP[d.getDay()];
      csv += `${k},${dow},${r.clockIn||""},${r.clockOut||""},"${(r.note||"").replace(/\n/g," ").replace(/"/g,'""')}"\n`;
    });

    // try writing directly to chosen folder
    if (folderHandle) {
      try {
        const fh = await folderHandle.getFileHandle(fileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        await writable.close();
        flash(`${folderHandle.name}/${fileName} に保存しました`);
        return;
      } catch { /* fall through to download */ }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    flash(`${fileName} をダウンロードしました`);
  }, [records, fiscalYear, fileName, folderHandle]);

  // ── Analytics computation ──
  const analytics = useMemo(() => {
    const FY_MONTHS = [2,3,4,5,6,7,8,9,10,11,0,1]; // Mar(2)..Feb(1), 0-indexed
    const monthlyData = FY_MONTHS.map(mi => {
      const y = mi >= 2 ? fiscalYear : fiscalYear + 1;
      const prefix = `${y}-${String(mi+1).padStart(2,"0")}`;
      let totalMin = 0, days = 0;
      Object.keys(records).filter(k => k.startsWith(prefix)).forEach(k => {
        const r = records[k];
        if (r.clockIn && r.clockOut) {
          const [ih, im] = r.clockIn.split(":").map(Number);
          const [oh, om] = r.clockOut.split(":").map(Number);
          const diff = (oh * 60 + om) - (ih * 60 + im);
          if (diff > 0) { totalMin += diff; days++; }
        }
      });
      const label = `${mi+1}月`;
      return { month: mi, label, totalMin, days, hours: totalMin / 60 };
    });

    // current month stats
    const curIdx = FY_MONTHS.indexOf(month);
    const cur = curIdx >= 0 ? monthlyData[curIdx] : { totalMin: 0, days: 0, hours: 0 };
    const avgHours = cur.days > 0 ? cur.hours / cur.days : 0;
    const maxHours = 200;

    return { monthlyData, cur, avgHours, maxHours };
  }, [records, fiscalYear, month]);

  // ── MD toolbar insert ──
  const insertMd = (item) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = workNote.slice(0, start), after = workNote.slice(end);
    const selected = workNote.slice(start, end);

    let newText, cursorPos;
    if (selected && item.cursor) {
      // wrap selection
      const half = Math.floor(item.insert.length / 2);
      const wrap = item.insert.slice(0, half) + selected + item.insert.slice(half);
      newText = before + wrap + after;
      cursorPos = start + half + selected.length;
    } else {
      newText = before + item.insert + after;
      cursorPos = item.cursor ? start + item.insert.length + item.cursor : start + item.insert.length;
    }
    handleNoteChange(newText);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = cursorPos; }, 0);
  };

  // ── calendar ──
  const prevMonth = (keepDay) => { if (month === 0) { setMonth(11); setYear(year-1); } else setMonth(month-1); if (!keepDay) setSelectedDay(1); };
  const nextMonth = (keepDay) => { if (month === 11) { setMonth(0); setYear(year+1); } else setMonth(month+1); if (!keepDay) setSelectedDay(1); };

  const wheelTimer = useRef(null);
  const handleCalWheel = (e) => {
    e.preventDefault();
    if (wheelTimer.current) return; // debounce
    wheelTimer.current = setTimeout(() => { wheelTimer.current = null; }, 300);
    if (e.deltaY > 0) nextMonth(false);
    else if (e.deltaY < 0) prevMonth(false);
  };

  const handleDayClick = (entry) => {
    if (entry.type === "prev") { prevMonth(true); setSelectedDay(entry.day); }
    else if (entry.type === "next") { nextMonth(true); setSelectedDay(entry.day); }
    else setSelectedDay(entry.day);
  };
  const calDays = getCalDays(year, month);
  const isToday = d => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const dow = new Date(year, month, selectedDay).getDay();

  const dateLabel = `${month+1}/${selectedDay} (${DAYS_JP[dow]})`;

  const { S, t } = styleCtx;

  return (
    <StyleContext.Provider value={styleCtx}>
    <div style={S.root}>
      <style>{`
        .time-scroll::-webkit-scrollbar { display: none; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ═══ Setup Wizard ═══ */}
      {showWizard && (
        <SetupWizard
          step={wizardStep}
          wizardTheme={wizardTheme}
          wizardFY={wizardFY}
          setWizardTheme={setWizardTheme}
          setWizardFY={setWizardFY}
          folderName={wizardFolderPath || saveFolderPath || "アプリ内データフォルダ"}
          onFolderPick={handleWizardFolderPick}
          onNext={() => setWizardStep(s => s + 1)}
          onPrev={() => setWizardStep(s => s - 1)}
          onComplete={handleWizardComplete}
          S={S}
          t={t}
        />
      )}

      {/* ═══ CSV Creation Popup ═══ */}
      {showCSVPopup && (
        <CSVCreationPopup
          fy={csvFY || getFY(today.getFullYear(), today.getMonth())}
          saveFolderPath={wizardFolderPath || saveFolderPath}
          onConfirm={handleCSVConfirm}
          onCustomize={handleCSVCustomize}
          S={S}
          t={t}
        />
      )}

      {/* ═══ Usage Tour ═══ */}
      {showTour && (
        <UsageTour
          step={tourStep}
          onNext={() => setTourStep(s => s + 1)}
          onPrev={() => setTourStep(s => s - 1)}
          onSkip={handleTourSkip}
          onComplete={handleTourComplete}
          S={S}
          t={t}
        />
      )}

      {!showWizard && (
      <div style={S.outerWrap} data-dbg="outerWrap">
      {/* Header */}
      <div style={S.header} data-dbg="header">
        <div style={S.headerLeft}>
          <span style={S.headerTitle}>勤怠記録</span>
          <div style={{position:"relative"}}>
            <button style={S.fyBadgeBtn} onClick={() => setShowFYPicker(v => !v)} data-tour="fyPicker">
              {getFYLabel(year, month)}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:4}}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showFYPicker && (
              <>
                <div style={S.fyOverlay} onClick={() => setShowFYPicker(false)} />
                <div style={S.fyDropdown}>
                  {availableFYs.map(fy => (
                    <button key={fy} style={{ ...S.fyItem, ...(fy === fiscalYear ? S.fyItemActive : {}) }}
                      onClick={() => switchFY(fy)}>
                      {fy}年度{fy === fiscalYear ? " ✓" : ""}
                    </button>
                  ))}
                  <div style={S.fyAddRow}>
                    <input style={S.fyAddInput} value={fyInput} onChange={e => setFYInput(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="年度" maxLength={4} onKeyDown={e => { if (e.key === "Enter") addNewFY(parseInt(fyInput)); }} />
                    <span style={{color:t.textVeryWeak,fontSize:11,whiteSpace:"nowrap"}}>年度</span>
                    <button style={S.fyAddSubmitBtn} onClick={() => addNewFY(parseInt(fyInput))} disabled={!fyInput || fyInput.length < 4}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={S.headerActions} data-dbg="headerActions">
          <button style={S.iconBtn} onClick={startBatchImport} title="インポート" data-tour="importBtn"><ImportIcon /></button>
          <div style={{position:"relative"}}>
            <button style={{...S.iconBtn, ...(queueActive ? S.iconBtnActive : {})}} onClick={() => setShowQueuePanel(v => !v)} title="インポートキュー">
              <QueueIcon />
              {importQueue.length > 0 && <span style={S.queueBadge}>{importQueue.filter(q=>q.status==="done").length}/{importQueue.length}</span>}
            </button>
            {showQueuePanel && importQueue.length > 0 && (
              <>
                <div style={S.fyOverlay} onClick={() => setShowQueuePanel(false)} />
                <div style={S.queuePanel}>
                  <div style={S.queuePanelHeader}>
                    <span style={{fontSize:12,fontWeight:600,color:t.textMuted}}>インポートキュー</span>
                    {queueDone && <button style={{...S.closeBtn,padding:2}} onClick={() => { setImportQueue([]); setShowQueuePanel(false); }}><CloseIcon /></button>}
                  </div>
                  {importQueue.map(q => (
                    <div key={q.id} style={S.queueItem}>
                      <span style={S.queueItemIcon}>
                        {q.status === "done" ? "✓" : q.status === "error" ? "✗" : q.status === "processing" ? "⟳" : "○"}
                      </span>
                      <span style={{...S.queueItemName,...(q.status==="error"?{color:t.textError}:{})}}>{q.path.split("/").pop()}</span>
                      <span style={S.queueItemStatus}>
                        {q.status === "done" && q.result ? `${q.result.added}件` : q.status === "error" ? "エラー" : q.status === "processing" ? "処理中..." : "待機"}
                      </span>
                      {q.result?.conflicts > 0 && <span style={S.queueItemWarn}>{q.result.conflicts}競合</span>}
                    </div>
                  ))}
                  {/* progress bar */}
                  <div style={S.queueBarTrack}>
                    <div style={{...S.queueBarFill, width:`${(importQueue.filter(q=>q.status==="done"||q.status==="error").length / Math.max(importQueue.length,1)) * 100}%`}} />
                  </div>
                </div>
              </>
            )}
          </div>
          <button style={S.iconBtn} onClick={pushRecords} title="保存・エクスポート"><PushIcon /></button>
          <button style={S.iconBtn} onClick={() => { setTempFolder(saveFolderPath); setShowSettings(true); }} title="設定" data-tour="settingsBtn"><GearIcon /></button>
        </div>
      </div>

      {/* Top-level layout: analytics left + calendar right */}
      <div style={S.topLayout} data-dbg="topLayout">
        {/* Left: Analytics */}
        <div data-tour="analytics">
        <AnalyticsPanel
          analytics={analytics}
          month={month}
          fiscalYear={fiscalYear}
          records={records}
          onNavigateMonth={(m) => { setMonth(m); setYear(m >= 2 ? fiscalYear : fiscalYear + 1); setSelectedDay(1); }}
          data-dbg="analytics"
        />
        </div>

        {/* Right: Calendar + Time + Comment */}
        <div style={S.contentWrap} data-dbg="contentWrap">
          <div ref={mainGridRef} style={S.mainGrid} data-dbg="mainGrid">
            <div style={S.calendarCard} ref={calRef} onWheel={handleCalWheel} data-dbg="calendarCard" data-tour="calendar">
              <div style={S.calHeader}>
                <button style={S.navBtn} onClick={() => prevMonth(false)}>‹</button>
                <span style={S.monthLabel}>{MONTHS[month]} {year}</span>
                <button style={S.navBtn} onClick={() => nextMonth(false)}>›</button>
              </div>
              <div style={S.dayNamesRow}>
                {DAYS.map(d => <span key={d} style={S.dayNameCell}>{d}</span>)}
              </div>
              <MetaballGrid
                calDays={calDays}
                selectedDay={selectedDay}
                month={month}
                year={year}
                records={records}
                isToday={isToday}
                onDayClick={handleDayClick}
              />
            </div>
            <TimePanel label="出勤" value={clockIn} onChange={handleClockIn} height={calHeight} data-dbg="timeIn" data-tour="timeIn" />
            <TimePanel label="退勤" value={clockOut} onChange={handleClockOut} height={calHeight} data-dbg="timeOut" data-tour="timeOut" />
          </div>

          {/* Bottom */}
          <div style={S.bottomArea} data-dbg="bottomArea" data-tour="workNote">
          <div style={S.summaryRow}>
            <span style={S.summaryText}>
              <span>{dateLabel}</span>
              {clockIn
                ? <TimeBadge label="出勤" time={clockIn} onClear={() => handleClockIn(null)} warn={clockIn && clockOut && clockIn >= clockOut} />
                : null}
              {clockOut
                ? <TimeBadge label="退勤" time={clockOut} onClear={() => handleClockOut(null)} warn={clockIn && clockOut && clockIn >= clockOut} />
                : null}
              {!clockIn && !clockOut && <span style={{marginLeft:8,color:t.textWeak}}>未入力</span>}
            </span>
            {dirty && <span style={S.unsaved}>未保存</span>}
          </div>
          <div style={S.memoRow}>
            <div style={S.memoInputWrap}>
              <input style={S.memoInput} value={workNote.split("\n")[0]} onChange={e => {
                const rest = workNote.includes("\n") ? "\n" + workNote.split("\n").slice(1).join("\n") : "";
                handleNoteChange(e.target.value + rest);
              }} placeholder="作業タイトルを入力..." />
              <button style={S.expandBtnInline} onClick={() => setShowPopup(true)} title="Markdownエディタを開く"><ExpandIcon /></button>
            </div>
          </div>
          {saveFolderPath && (
            <div style={S.pathHint} title={`${saveFolderPath}/${fileName}`}>
              <FolderIcon />
              <span style={S.pathHintText}>{saveFolderPath}/{fileName}</span>
            </div>
          )}
        </div>
        </div>
      </div>
      </div>
      )}

      {/* ═══ Markdown Popup ═══ */}
      {showPopup && (
        <div style={S.overlay} onClick={() => setShowPopup(false)}>
          <div style={S.mdPopup} onClick={e => e.stopPropagation()}>
            {/* popup header */}
            <div style={S.popupHeader}>
              <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0,flex:1}}>
                <span style={{...S.popupTitle,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {workNote.split("\n")[0]
                    ? workNote.split("\n")[0]
                    : "作業内容"}
                </span>
                <span style={{fontSize:11,color:t.textWeak,letterSpacing:.3}}>{month+1}/{selectedDay} ({DAYS_JP[dow]}){clockIn ? `　${clockIn}` : ""}{clockOut ? ` – ${clockOut}` : ""}</span>
              </div>
              <div style={S.popupHeaderRight}>
                {/* view mode toggle */}
                <div style={S.viewToggle}>
                  {[{k:"edit",l:"編集"},{k:"split",l:"分割"},{k:"preview",l:"プレビュー"}].map(v => (
                    <button key={v.k} onClick={() => setPreviewMode(v.k)}
                      style={{...S.viewToggleBtn, ...(previewMode===v.k ? S.viewToggleSel : {})}}>{v.l}</button>
                  ))}
                </div>
                <button style={S.closeBtn} onClick={() => setShowPopup(false)}><CloseIcon /></button>
              </div>
            </div>

            {/* toolbar */}
            {previewMode !== "preview" && (
              <div style={S.mdToolbar}>
                {mdToolbar.map((item, i) => (
                  <button key={i} style={{...S.mdToolBtn, ...(item.style||{})}} onClick={() => insertMd(item)} title={item.tip}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* editor area */}
            <div style={S.editorArea}>
              {previewMode !== "preview" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <textarea
                    ref={textareaRef}
                    style={S.mdTextarea}
                    value={workNote}
                    onChange={e => handleNoteChange(e.target.value)}
                    placeholder="Markdown構文で入力できます..."
                    spellCheck={false}
                  />
                </div>
              )}
              {previewMode !== "edit" && (
                <>
                  {previewMode === "split" && <div style={S.editorDivider} />}
                  <div style={S.previewPane}>
                    {workNote ? <MdPreview text={workNote} /> : <span style={{color:t.textVeryWeak,fontSize:13}}>プレビューがここに表示されます</span>}
                  </div>
                </>
              )}
            </div>

            {/* footer */}
            <div style={S.popupFooter}>
              <span style={S.charCount}>{workNote.length} 文字 · {workNote.split("\n").length} 行</span>
              <div style={{display:"flex",gap:8}}>
                <span style={S.mdHint}>Markdown対応</span>
                <button style={S.popupSaveBtn} onClick={() => { manualSave(); setShowPopup(false); }}>保存して閉じる</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Settings ═══ */}
      {showSettings && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div style={{...S.settingsPopup}} onClick={e => e.stopPropagation()}>
            <div style={S.popupHeader}>
              <span style={S.popupTitle}>設定</span>
              <button style={S.closeBtn} onClick={() => setShowSettings(false)}><CloseIcon /></button>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:12,borderBottom:`1px solid ${t.borderBottom}`,marginBottom:12}}>
              <div>
                <div style={{fontSize:12,color:t.textBody,fontWeight:500,marginBottom:2}}>外観</div>
                <div style={{fontSize:11,color:t.textVeryWeak,lineHeight:1.4}}>ダークモード・ライトモードを切り替えます</div>
              </div>
              <button
                onClick={() => {
                  const next = theme === "dark" ? "light" : "dark";
                  setTheme(next);
                  window.storage.set("theme", next).catch(() => {});
                }}
                style={{
                  position:"relative", width:48, height:28, borderRadius:14,
                  background: theme === "dark" ? t.bgButton : t.accent,
                  border:`1px solid ${t.border}`, cursor:"pointer", padding:0, transition:"all .3s",
                }}
              >
                <span style={{
                  position:"absolute", top:3,
                  left: theme === "dark" ? 3 : 24,
                  width:20, height:20, borderRadius:"50%",
                  background: theme === "dark" ? t.textDim : "#fff",
                  transition:"all .3s", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12,
                }}>
                  {theme === "dark"
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  }
                </span>
              </button>
            </div>

            <label style={S.label}>保存先フォルダ</label>
            <div style={S.folderRow}>
              <div style={S.folderInputRow}>
                <FolderIcon />
                <input style={S.settingsInput} value={tempFolder} onChange={e => setTempFolder(e.target.value)}
                  placeholder="フォルダを選択してください" readOnly />
              </div>
              <button style={S.folderPickBtn} onClick={pickFolder} title="フォルダを選択">
                <FolderOpenIcon />
                <span style={{marginLeft:6,fontSize:12}}>参照</span>
              </button>
            </div>
            <p style={S.hint}>
              「参照」ボタンでエクスプローラーが開き、保存先フォルダを直接選択できます。
              選択したフォルダにCSVが直接書き込まれるため、毎回ダウンロードする手間が省けます。
              OneDrive・Google Driveのフォルダを選べばクラウド同期も自動です。
            </p>
            <p style={{...S.hint, color: t.textLink, marginTop: 4}}>
              ※ Chrome / Edge で利用可能（File System Access API）
            </p>

            <label style={{...S.label, marginTop:18}}>現在のファイル名</label>
            <div style={S.fileNameDisplay}>{fileName}</div>
            <p style={S.hint}>年度（4月〜翌3月）で自動生成。1年分 = 1ファイル。</p>

            <button style={{...S.popupSaveBtn, marginTop:16}} onClick={() => {
              setSaveFolderPath(tempFolder);
              window.storage.set("save_folder", tempFolder).catch(() => {});
              setShowSettings(false);
              flash("設定を保存しました");
            }}>保存</button>

            {/* ═══ Re-run wizard/tour ═══ */}
            <div style={{
              marginTop:20, paddingTop:16,
              borderTop: `1px solid ${t.borderBottom}`,
            }}>
              <div style={{fontSize:12, color:t.textBody, fontWeight:500, marginBottom:4}}>初期設定</div>
              <div style={{fontSize:11, color:t.textVeryWeak, lineHeight:1.4, marginBottom:12}}>
                ウィザードやツアーを再実行できます。
              </div>
              <div style={{display:"flex", gap:8}}>
                <button
                  style={{...S.popupSaveBtn, fontSize:12, padding:"6px 14px"}}
                  onClick={() => {
                    setShowSettings(false);
                    setWizardTheme(theme);
                    setWizardFY(null);
                    setWizardFolderPath(saveFolderPath);
                    setWizardStep(0);
                    setShowWizard(true);
                  }}
                >ウィザードを再実行</button>
                <button
                  style={{...S.popupSaveBtn, fontSize:12, padding:"6px 14px"}}
                  onClick={() => {
                    setShowSettings(false);
                    setTourStep(0);
                    setShowTour(true);
                  }}
                >ツアーを再表示</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Import ═══ */}
      {importData && (
        <div style={S.overlay} onClick={() => setImportData(null)}>
          <div style={S.importPopup} onClick={e => e.stopPropagation()}>
            <div style={S.popupHeader}>
              <span style={S.popupTitle}>インポート</span>
              <button style={S.closeBtn} onClick={() => setImportData(null)}><CloseIcon /></button>
            </div>
            <div style={S.importBody}>
              <div style={S.importFileInfo}>
                <span style={{color:t.textSubtle,fontSize:12}}>{importData.fileName}</span>
                <span style={{color:t.textWeak,fontSize:11,marginLeft:10}}>{importData.year}年{importData.month}月</span>
              </div>
              <div style={S.importPreviewList}>
                {Object.keys(importData.records).sort().map(date => {
                  const rec = importData.records[date];
                  const existing = records[date];
                  const conflict = existing && (existing.clockIn || existing.clockOut || existing.note);
                  const d = new Date(date);
                  const dow = DAYS_JP[d.getDay()];
                  return (
                    <div key={date} style={{ ...S.importRow, ...(conflict ? S.importRowConflict : {}) }}>
                      <span style={S.importDate}>{parseInt(date.split("-")[2])}日({dow})</span>
                      <span style={S.importTime}>{rec.clockIn && rec.clockOut ? `${rec.clockIn} – ${rec.clockOut}` : "—"}</span>
                      <span style={S.importNote}>{rec.note ? (rec.note.length > 24 ? rec.note.slice(0,24) + "…" : rec.note) : ""}</span>
                      {conflict && <span style={S.importBadge}>競合</span>}
                    </div>
                  );
                })}
              </div>
              {(() => {
                const conflicts = Object.keys(importData.records).filter(d => {
                  const ex = records[d]; return ex && (ex.clockIn || ex.clockOut || ex.note);
                }).length;
                return conflicts > 0 ? (
                  <div style={S.importWarn}>{conflicts}件の競合があります（既存データあり）</div>
                ) : null;
              })()}
            </div>
            <div style={S.popupFooter}>
              <div style={{display:"flex",gap:8}}>
                {(() => {
                  const conflicts = Object.keys(importData.records).filter(d => {
                    const ex = records[d]; return ex && (ex.clockIn || ex.clockOut || ex.note);
                  }).length;
                  return conflicts > 0
                    ? <>
                        <button style={S.popupSaveBtn} onClick={() => applyImport(false)}>新規のみ</button>
                        <button style={{...S.popupSaveBtn, background:t.bgError, borderColor:t.borderError}} onClick={() => applyImport(true)}>全て上書き</button>
                      </>
                    : <button style={S.popupSaveBtn} onClick={() => applyImport(true)}>インポート</button>;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}

      {/* ═══ Status Bar ═══ */}
      {!showWizard && (
        <div style={S.statusBar}>
          <div style={S.statusBarLeft}>
            <span>v{appVersion || "—"}</span>
            <button style={S.statusBarReloadBtn} onClick={checkForUpdate} title="更新を確認">
              {updateChecking ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              ) : upToDate && !updateInfo ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <RefreshIcon />
              )}
            </button>
            {updateStatusText && <span style={S.updateStatusText}>{updateStatusText}</span>}
            <style>{`
              .time-scroll::-webkit-scrollbar { display: none; }
            `}</style>
          </div>
          <div style={S.statusBarRight}>
            <span>最終同期: {lastSync || "—"}</span>
            <button style={S.statusBarReloadBtn} onClick={reloadRecords} title="再読み込み">
              <RefreshIcon />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Update Notification ═══ */}
      {updateDownloaded && platform === "win32" ? (
        <div style={S.updateCard}>
          <div style={S.updateCardTitle}>更新の準備ができました</div>
          <div style={S.updateCardDesc}>再起動して更新を適用します。</div>
          <button style={S.updateCardBtn} onClick={() => window.updateAPI?.install()}>再起動</button>
          <button style={S.updateCardDismiss} onClick={() => setUpdateDownloaded(false)}>後で</button>
        </div>
      ) : updateDownloading && platform === "win32" ? (
        <div style={S.updateCard}>
          <div style={S.updateCardTitle}>ダウンロード中...</div>
          <div style={S.updateProgressTrack}>
            <div style={{ ...S.updateProgressFill, width: `${updateProgress}%` }} />
          </div>
          <div style={S.updateCardDesc}>{updateProgress}%</div>
        </div>
      ) : updateInfo ? (
        <div style={S.updateCard}>
          <div style={S.updateCardTitle}>v{updateInfo.version} が利用可能</div>
          <button style={S.updateCardBtn} onClick={() => {
            if (platform === "win32") {
              setUpdateDownloading(true);
              setUpdateInfo(null);
              window.updateAPI?.download();
            } else {
              window.open(`https://github.com/Egssy620/schedule-app/releases/tag/v${updateInfo.version}`, "_blank");
              setUpdateInfo(null);
            }
          }}>{platform === "win32" ? "更新" : "ダウンロード"}</button>
          <button style={S.updateCardDismiss} onClick={() => setUpdateInfo(null)}>後で</button>
        </div>
      ) : null}
    </div>
    </StyleContext.Provider>
  );
}

/* ═══════════════ Styles ═══════════════ */
function createStyles(t) {
  return {
  root: { fontFamily:"'SF Pro Display','Hiragino Sans','Noto Sans JP',sans-serif", background:t.bgRoot, color:t.textSecondary, minHeight:"100vh", padding:20, paddingBottom:44, boxSizing:"border-box" },
  outerWrap: { display:"flex", flexDirection:"column", width:LAYOUT.outerWrap, margin:"0 auto" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  headerLeft: { display:"flex", alignItems:"center", gap:10 },
  headerTitle: { fontSize:20, fontWeight:600, letterSpacing:1, color:t.textPrimary },
  fyBadge: { fontSize:10, fontWeight:500, color:t.textDim, letterSpacing:.5, background:t.bgButton, border:`1px solid ${t.border}`, borderRadius:6, padding:"3px 8px" },
  fyBadgeBtn: { fontSize:10, fontWeight:500, color:t.textDim, letterSpacing:.5, background:t.bgButton, border:`1px solid ${t.border}`, borderRadius:6, padding:"3px 8px", cursor:"pointer", display:"flex", alignItems:"center", fontFamily:"inherit", transition:"all .15s" },
  fyOverlay: { position:"fixed", inset:0, zIndex:998 },
  fyDropdown: { position:"absolute", top:"100%", left:0, marginTop:6, background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:8, padding:4, minWidth:140, zIndex:999, boxShadow:t.shadowDropdown, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  fyItem: { display:"block", width:"100%", background:"transparent", border:"none", color:t.textSubtle, fontSize:12, padding:"6px 12px", borderRadius:6, cursor:"pointer", textAlign:"left", fontFamily:"inherit", transition:"all .15s" },
  fyItemActive: { color:t.textPrimary, background:t.bgHover, fontWeight:600 },
  fyAddBtn: { display:"flex", alignItems:"center", width:"100%", background:"transparent", border:"none", color:t.textVeryWeak, fontSize:11, padding:"6px 12px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", marginTop:2, transition:"all .15s" },
  fyAddRow: { display:"flex", alignItems:"center", gap:4, padding:"6px 10px", borderTop:`1px solid ${t.borderLight}`, marginTop:4 },
  fyAddInput: { width:56, background:t.bgFYAdd, border:`1px solid ${t.borderMedium}`, borderRadius:5, color:t.textInput, padding:"3px 6px", fontSize:12, outline:"none", fontFamily:"inherit", fontVariantNumeric:"tabular-nums" },
  fyAddSubmitBtn: { background:"none", border:"none", color:t.textDim, cursor:"pointer", padding:4, display:"flex", alignItems:"center", justifyContent:"center" },
  iconBtnActive: { background:t.bgAccent, borderColor:t.borderAccent, color:t.textAccent },
  queueBadge: { position:"absolute", top:-4, right:-4, fontSize:8, background:t.accent, color:t.textInverted, borderRadius:6, padding:"1px 4px", fontWeight:700, lineHeight:1.3 },
  queuePanel: { position:"absolute", top:"100%", right:0, marginTop:6, background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:10, padding:0, minWidth:280, maxWidth:340, zIndex:999, boxShadow:t.shadowDropdown, overflow:"hidden", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  queuePanelHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px 6px" },
  queueItem: { display:"flex", alignItems:"center", gap:8, padding:"5px 14px", fontSize:12 },
  queueItemIcon: { width:16, textAlign:"center", color:t.textAccent, flexShrink:0 },
  queueItemName: { flex:1, color:t.textSubtle, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  queueItemStatus: { color:t.textWeak, fontSize:11, flexShrink:0 },
  queueItemWarn: { fontSize:9, color:t.textWarn, background:t.bgWarn, borderRadius:4, padding:"1px 5px", flexShrink:0 },
  queueBarTrack: { height:3, background:t.bgQueueTrack, margin:"6px 14px 10px", borderRadius:2, overflow:"hidden" },
  queueBarFill: { height:"100%", background:t.accent, borderRadius:2, transition:"width 0.3s ease" },
  headerActions: { display:"flex", gap:8 },
  iconBtn: { background:t.bgButton, border:`1px solid ${t.borderMedium}`, borderRadius:10, color:t.textSubtle, padding:"8px 10px", cursor:"pointer", display:"flex", alignItems:"center", transition:"all .2s" },
  contentWrap: { display:"flex", flexDirection:"column", width:LAYOUT.mainGrid },
  topLayout: { display:"flex", gap:14, alignItems:"flex-start" },
  analyticsInline: { background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:0, width:300, minWidth:300, maxWidth:300, flexShrink:0, overflow:"hidden", maxHeight:"calc(100vh - 80px)", overflowY:"auto", scrollbarWidth:"thin", scrollbarColor:`${t.scrollbarThumb} transparent`, boxSizing:"border-box", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  analyticsInlineHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px 8px" },
  analyticsInlineTitle: { fontSize:12, fontWeight:600, color:t.textMuted, letterSpacing:.3 },
  mainGrid: { display:"flex", gap:LAYOUT.gridGap, alignItems:"flex-start", width:LAYOUT.mainGrid },
  calendarCard: { background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:"20px 18px", flex:"0 0 290px", maxWidth:290, boxSizing:"border-box", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  calHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 },
  navBtn: { background:"none", border:"none", color:t.textDim, fontSize:22, cursor:"pointer", padding:"4px 10px", borderRadius:6, lineHeight:1 },
  monthLabel: { fontSize:16, fontWeight:500, color:t.textPrimary, letterSpacing:.5 },
  dayNamesRow: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 },
  dayNameCell: { textAlign:"center", fontSize:11, color:t.textWeak, fontWeight:500, textTransform:"uppercase", letterSpacing:.5, padding:"4px 0" },
  weekRow: { display:"grid", gridTemplateColumns:"repeat(7,1fr)" },
  dayCell: { textAlign:"center", padding:"8px 0", fontSize:14, color:t.textInput, position:"relative", background:"none", border:"none", borderRadius:"50%", minWidth:36, minHeight:36, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", boxSizing:"border-box" },
  dayCellBtn: { cursor:"pointer", transition:"all .15s" },
  dayCellSel: { color:t.textInverted, fontWeight:700 },
  dayCellToday: { boxShadow:t.boxShadowToday },
  dot: { position:"absolute", bottom:3, left:"50%", transform:"translateX(-50%)", width:4, height:4, borderRadius:"50%", background:t.textDim },
  timePanel: { background:t.bgTimePanel || t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:0, flex:"0 0 120px", display:"flex", flexDirection:"column", overflow:"hidden", boxSizing:"border-box", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  timePanelLabel: { position:"absolute", top:0, left:0, right:0, zIndex:3, display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:11, fontWeight:600, color:t.textSubtle, letterSpacing:1.5, textTransform:"uppercase", padding:"9px 4px 16px", background:t.gradientHeader, backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)" },
  tpLabelText: { fontSize:11, letterSpacing:1.5 },
  tpIconBtn: { background:"none", border:"none", color:t.textWeak, cursor:"pointer", padding:3, display:"flex", alignItems:"center", borderRadius:4, transition:"color .2s" },
  manualInputWrap: { position:"absolute", top:36, left:6, right:6, zIndex:4 },
  manualTimeInput: { width:"100%", background:t.bgManualInput, border:`1px solid ${t.borderManual}`, borderRadius:8, color:t.textPrimary, padding:"7px 0", fontSize:13, textAlign:"center", outline:"none", fontFamily:"inherit", fontVariantNumeric:"tabular-nums", letterSpacing:1, boxSizing:"border-box", boxShadow:t.shadowManual },
  timeListWrap: { flex:1, overflow:"hidden", minHeight:0 },
  timeList: { overflowY:"auto", height:"100%", padding:"42px 6px 6px", scrollbarWidth:"none", msOverflowStyle:"none" },
  timeSlot: { display:"block", width:"100%", padding:"5px 0", margin:"3px 0", textAlign:"center", fontSize:13, fontWeight:400, fontVariantNumeric:"tabular-nums", color:t.textInput, background:t.bgTimeSlot, border:`1px solid ${t.borderTimeSlot}`, borderRadius:8, cursor:"pointer", transition:"all .15s", letterSpacing:1 },
  timeSlotSel: { background:t.bgTimeSlotSel, color:t.textInverted, fontWeight:600, border:`1px solid ${t.borderTimeSlotSel}` },
  bottomArea: { marginTop:14, background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:10, padding:"10px 14px", boxSizing:"border-box", overflow:"hidden", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" },
  summaryRow: { display:"flex", alignItems:"center", gap:10, marginBottom:8 },
  summaryText: { fontSize:13, color:t.textMuted, letterSpacing:.3, flex:1, display:"flex", alignItems:"center", gap:4 },
  timeBadge: { display:"inline-flex", alignItems:"center", gap:4, marginLeft:8, padding:"2px 8px", background:t.bgTimeBadge, border:`1px solid ${t.borderTimeBadge}`, borderRadius:6, cursor:"default", position:"relative", transition:"all .15s" },
  timeBadgeWarn: { background:t.bgTimeBadgeWarn, border:`1px solid ${t.borderTimeBadgeWarn}` },
  timeBadgeLabel: { fontSize:10, color:t.textWeak, letterSpacing:.5 },
  timeBadgeTime: { fontSize:13, color:t.textInput, fontVariantNumeric:"tabular-nums", letterSpacing:.5 },
  timeBadgeClear: { position:"absolute", top:-6, right:-6, width:16, height:16, borderRadius:"50%", background:t.textGhost, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", transition:"background .15s" },
  unsaved: { fontSize:10, color:t.textWarn, background:t.bgWarn, borderRadius:4, padding:"2px 6px" },
  manualSaveBtn: { display:"flex", alignItems:"center", background:t.bgButton, border:`1px solid ${t.borderStrong}`, borderRadius:8, color:t.textInput, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  memoRow: { display:"flex", alignItems:"center" },
  memoInputWrap: { flex:1, position:"relative", display:"flex", alignItems:"center" },
  memoInput: { width:"100%", background:t.bgInput, border:`1px solid ${t.border}`, borderRadius:8, color:t.textBody, padding:"7px 36px 7px 12px", fontSize:13, outline:"none", fontFamily:"inherit", letterSpacing:.3, boxSizing:"border-box" },
  expandBtnInline: { position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:t.textVeryWeak, padding:4, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:4, transition:"color .15s" },
  pathHint: { display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:11, color:t.textVeryWeak, letterSpacing:.3, maxWidth:"80%", overflow:"hidden" },
  pathHintText: { overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0, flex:1 },

  /* popup / overlay */
  overlay: { position:"fixed", inset:0, background:t.overlay, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" },

  /* MD popup */
  mdPopup: { background:t.bgMdPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, padding:0, width:"94%", maxWidth:820, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:t.shadowHeavy, overflow:"hidden", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" },
  popupHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:`1px solid ${t.borderLight}` },
  popupTitle: { fontSize:14, fontWeight:600, color:t.textBody, letterSpacing:.3 },
  popupHeaderRight: { display:"flex", alignItems:"center", gap:10 },
  closeBtn: { background:"none", border:"none", color:t.textDim, cursor:"pointer", padding:4, display:"flex", borderRadius:6 },

  /* view toggle */
  viewToggle: { display:"flex", background:t.bgCard, borderRadius:8, padding:2, gap:2 },
  viewToggleBtn: { background:"transparent", border:"none", color:t.textDim, fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" },
  viewToggleSel: { background:t.bgViewToggleSel, color:t.textBody },

  /* toolbar */
  mdToolbar: { display:"flex", flexWrap:"wrap", gap:2, padding:"8px 16px", borderBottom:`1px solid ${t.borderLight}`, background:t.bgToolbar },
  mdToolBtn: { background:t.bgCard, border:`1px solid ${t.borderLight}`, borderRadius:6, color:t.textSubtle, fontSize:11, padding:"4px 8px", cursor:"pointer", fontFamily:"'JetBrains Mono','Fira Code','Source Code Pro',monospace", transition:"all .15s", minWidth:28, textAlign:"center" },

  /* editor */
  editorArea: { display:"flex", flex:1, minHeight:0, overflow:"hidden" },
  mdTextarea: { width:"100%", height:"100%", minHeight:320, background:"transparent", border:"none", color:t.textMd, padding:"16px 18px", fontSize:13, lineHeight:1.7, resize:"none", outline:"none", fontFamily:"'Hiragino Sans','Noto Sans JP','SF Pro Display',sans-serif", boxSizing:"border-box", flex:1 },
  editorDivider: { width:1, background:t.borderLight, flexShrink:0 },
  previewPane: { flex:1, padding:"16px 18px", overflowY:"auto", minHeight:320 },

  /* footer */
  popupFooter: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderTop:`1px solid ${t.borderLight}` },
  charCount: { fontSize:11, color:t.textVeryWeak },
  mdHint: { fontSize:10, color:t.textGhost, background:t.bgMdHint, border:`1px solid ${t.borderHint}`, borderRadius:4, padding:"3px 8px", alignSelf:"center" },
  popupSaveBtn: { background:t.bgHover, border:`1px solid ${t.borderStrong}`, borderRadius:10, color:t.textPrimary, padding:"8px 20px", fontSize:13, fontWeight:500, cursor:"pointer", letterSpacing:.5, fontFamily:"inherit" },

  /* settings popup */
  settingsPopup: { background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, padding:24, width:"92%", maxWidth:460, boxShadow:t.shadowPopup, backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" },
  label: { display:"block", fontSize:12, color:t.textDim, marginBottom:6, fontWeight:500 },
  folderRow: { display:"flex", gap:8, alignItems:"stretch" },
  folderInputRow: { flex:1, display:"flex", alignItems:"center", gap:8, background:t.bgInput, border:`1px solid ${t.borderMedium}`, borderRadius:10, padding:"0 12px", color:t.textWeak },
  settingsInput: { flex:1, background:"transparent", border:"none", color:t.textBody, padding:"10px 0", fontSize:13, outline:"none", fontFamily:"inherit" },
  folderPickBtn: { display:"flex", alignItems:"center", background:t.bgButton, border:`1px solid ${t.borderStrong}`, borderRadius:10, color:t.textSubtle, padding:"0 14px", cursor:"pointer", transition:"all .2s", whiteSpace:"nowrap", fontFamily:"inherit" },
  fileNameDisplay: { background:t.bgInput, border:`1px solid ${t.border}`, borderRadius:10, padding:"10px 14px", fontSize:13, color:t.textSubtle, letterSpacing:.3 },
  hint: { fontSize:11, color:t.textVeryWeak, marginTop:6, marginBottom:0, lineHeight:1.6 },

  /* analytics */
  statRow: { display:"flex", gap:6, padding:"4px 12px 8px" },
  statCard: { flex:"1 0 auto", background:t.bgCard, border:`1px solid ${t.borderLight}`, borderRadius:8, padding:"10px 6px", textAlign:"center", whiteSpace:"nowrap" },
  statLabel: { fontSize:9, color:t.textWeak, letterSpacing:.5, marginBottom:4, textTransform:"uppercase" },
  statValue: { fontSize:17, fontWeight:600, color:t.textPrimary, fontVariantNumeric:"tabular-nums", letterSpacing:.3 },
  statSub: { fontSize:10, color:t.textVeryWeak, marginTop:2 },
  chartSection: { padding:"8px 12px 14px" },
  chartTitle: { fontSize:12, color:t.textDim, fontWeight:500, marginBottom:12, letterSpacing:.3 },
  chartGrid: { display:"flex", flexDirection:"column", gap:6 },
  chartRow: { display:"grid", gridTemplateColumns:"36px 1fr 52px 28px 24px", alignItems:"center", gap:8 },
  chartLabel: { fontSize:11, color:t.textWeak, textAlign:"right", fontVariantNumeric:"tabular-nums" },
  chartBarTrack: { height:18, background:t.bgChartTrack, borderRadius:4, overflow:"hidden" },
  chartHours: { fontSize:11, color:t.textDim, textAlign:"right", fontVariantNumeric:"tabular-nums" },
  chartDays: { fontSize:9, color:t.textVeryWeak, textAlign:"right" },
  drillBtn: { background:"none", border:"none", color:t.textVeryWeak, cursor:"pointer", padding:2, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:4, transition:"color .15s" },
  headerBackBtn: { background:t.bgCard, border:`1px solid ${t.border}`, borderRadius:6, color:t.textSubtle, padding:4, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" },
  dailyAxisRow: { display:"grid", gridTemplateColumns:"22px 18px 1fr 42px", alignItems:"end", gap:6, marginBottom:4, paddingBottom:4, borderBottom:`1px solid ${t.borderHint}` },
  dailyAxisTrack: { position:"relative", height:14 },
  dailyAxisLabel: { position:"absolute", transform:"translateX(-50%)", fontSize:9, color:t.textVeryWeak, fontVariantNumeric:"tabular-nums" },
  dailyDayCol: { fontSize:11, color:t.textWeak, textAlign:"right", fontVariantNumeric:"tabular-nums", width:22 },
  dailyDowCol: { fontSize:9, color:t.textVeryWeak, textAlign:"center", width:18 },
  dailyHoursCol: { fontSize:10, color:t.textDim, textAlign:"right", fontVariantNumeric:"tabular-nums", width:42 },
  dailyGrid: { display:"flex", flexDirection:"column", gap:2 },
  dailyRow: { display:"grid", gridTemplateColumns:"22px 18px 1fr 42px", alignItems:"center", gap:6 },
  dailyBarTrack: { position:"relative", height:14, background:t.bgDailyBarTrack, borderRadius:3, overflow:"hidden", flex:1 },
  toast: { position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:t.bgToast, border:`1px solid ${t.borderStrong}`, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderRadius:12, padding:"10px 24px", color:t.textBody, fontSize:13, zIndex:2000, letterSpacing:.3 },

  /* import */
  importPopup: { background:t.bgMdPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, width:"92%", maxWidth:480, maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:t.shadowHeavy, overflow:"hidden", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" },
  importBody: { padding:"0 20px 12px", flex:1, overflowY:"auto", minHeight:0 },
  importFileInfo: { marginBottom:12 },
  importPreviewList: { display:"flex", flexDirection:"column", gap:2 },
  importRow: { display:"grid", gridTemplateColumns:"72px 100px 1fr 42px", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:6, fontSize:12 },
  importRowConflict: { background:t.bgImportConflict, border:`1px solid ${t.borderImportConflict}` },
  importDate: { color:t.textSubtle, fontVariantNumeric:"tabular-nums" },
  importTime: { color:t.textInput, fontVariantNumeric:"tabular-nums", letterSpacing:.5 },
  importNote: { color:t.textDim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  importBadge: { fontSize:9, color:t.textWarn, background:t.bgWarn, borderRadius:4, padding:"2px 6px", textAlign:"center" },
  importWarn: { marginTop:10, fontSize:11, color:t.textWarn, textAlign:"center" },

  /* wizard */
  wizardOverlay: { position:"fixed", inset:0, background:t.overlay, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1100, backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)" },
  wizardCard: { background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:16, width:"92%", maxWidth:520, boxShadow:t.shadowHeavy, overflow:"hidden", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" },
  wizardHeader: { padding:"28px 32px 16px", textAlign:"center" },
  wizardTitle: { fontSize:20, fontWeight:600, color:t.textPrimary, letterSpacing:0.5 },
  wizardSubtitle: { fontSize:13, color:t.textMuted, marginTop:8, lineHeight:1.6 },
  wizardBody: { padding:"16px 32px 24px" },
  wizardStepIndicator: { display:"flex", justifyContent:"center", gap:8, padding:"20px 32px 0" },
  wizardDot: { width:8, height:8, borderRadius:"50%", background:t.bgButton, border:`1px solid ${t.border}`, transition:"all .3s" },
  wizardDotActive: { background:t.accent, border:`1px solid ${t.accent}`, transform:"scale(1.3)" },
  wizardThemeCard: { flex:1, padding:20, borderRadius:12, border:`2px solid ${t.borderMedium}`, cursor:"pointer", transition:"all .2s", textAlign:"center" },
  wizardThemeCardSel: { borderColor:t.accent, boxShadow:`0 0 0 1px ${t.accent}` },
  wizardFYInput: { width:80, background:t.bgInput, border:`1px solid ${t.borderMedium}`, borderRadius:8, color:t.textPrimary, padding:"8px 12px", fontSize:16, textAlign:"center", outline:"none", fontFamily:"inherit", fontVariantNumeric:"tabular-nums" },
  wizardBtnRow: { display:"flex", justifyContent:"space-between", padding:"16px 32px 24px", borderTop:`1px solid ${t.borderLight}` },
  wizardBtnPrimary: { background:t.accent, border:"none", borderRadius:10, color:"#fff", padding:"10px 24px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit", letterSpacing:0.3, transition:"all .15s" },
  wizardBtnSecondary: { background:t.bgButton, border:`1px solid ${t.borderMedium}`, borderRadius:10, color:t.textSubtle, padding:"10px 24px", fontSize:14, cursor:"pointer", fontFamily:"inherit", transition:"all .15s" },

  /* csv popup */
  csvPopup: { background:t.bgMdPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, width:"92%", maxWidth:460, boxShadow:t.shadowHeavy, overflow:"hidden", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" },
  csvInfoRow: { display:"flex", alignItems:"flex-start", gap:8, padding:"6px 0", fontSize:13 },
  csvInfoLabel: { color:t.textMuted, fontWeight:500, minWidth:72, flexShrink:0 },
  csvInfoValue: { color:t.textBody, fontVariantNumeric:"tabular-nums" },

  /* tour */
  tourOverlay: { position:"fixed", inset:0, zIndex:2000, pointerEvents:"none" },
  tourSpotlight: { position:"absolute", borderRadius:10, border:`2px solid ${t.accent}`, boxShadow:`0 0 0 9999px ${t.overlay}`, transition:"all 0.4s cubic-bezier(0.22,1,0.36,1)", pointerEvents:"auto" },
  tourTooltip: { position:"fixed", width:280, background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, padding:20, boxShadow:t.shadowHeavy, backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", pointerEvents:"auto", transition:"all 0.3s ease", zIndex:1, boxSizing:"border-box" },
  tourTooltipNum: { fontSize:10, color:t.accent, fontWeight:600, letterSpacing:1, marginBottom:4 },
  tourTooltipTitle: { fontSize:15, fontWeight:600, color:t.textPrimary, marginBottom:6 },
  tourTooltipDesc: { fontSize:12, color:t.textMuted, lineHeight:1.6, marginBottom:14 },
  tourTooltipNav: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  tourSkipBtn: { background:"none", border:"none", color:t.textWeak, fontSize:11, cursor:"pointer", fontFamily:"inherit" },
  tourStepText: { fontSize:10, color:t.textVeryWeak },
  tourNavBtns: { display:"flex", gap:6 },
  tourPrevBtn: { background:t.bgButton, border:`1px solid ${t.borderMedium}`, borderRadius:8, color:t.textSubtle, padding:"6px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  tourNextBtn: { background:t.accent, border:"none", borderRadius:8, color:"#fff", padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },

  /* status bar */
  statusBar: { position:"fixed", bottom:0, left:0, right:0, display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 20px", background:t.bgCard, borderTop:`1px solid ${t.borderLight}`, backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)", zIndex:100, fontSize:11, color:t.textVeryWeak, letterSpacing:0.3, fontFamily:"inherit" },
  statusBarLeft: { fontVariantNumeric:"tabular-nums", display:"flex", alignItems:"center", gap:6 },
  statusBarReloadBtn: { background:"none", border:"none", color:t.textVeryWeak, cursor:"pointer", padding:2, display:"flex", alignItems:"center", borderRadius:4, transition:"color .15s" },
  updateStatusText: { fontSize:10, color:t.textDim, letterSpacing:0.3, opacity:1, transition:"opacity 0.8s ease" },
  statusBarRight: { fontVariantNumeric:"tabular-nums", display:"flex", alignItems:"center", gap:6 },

  /* update card */
  updateCard: { position:"fixed", left:20, bottom:36, background:t.bgPopup, border:`1px solid ${t.borderMedium}`, borderRadius:12, padding:"10px 14px", width:170, boxShadow:t.shadowPopup, backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)", zIndex:1500 },
  updateCardTitle: { fontSize:13, fontWeight:600, color:t.textBody, marginBottom:6 },
  updateCardDesc: { fontSize:11, color:t.textWeak, marginTop:4 },
  updateCardBtn: { marginTop:10, background:t.accent, border:"none", borderRadius:8, color:"#fff", padding:"6px 16px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", marginRight:6 },
  updateCardDismiss: { marginTop:10, background:"none", border:`1px solid ${t.borderMedium}`, borderRadius:8, color:t.textDim, padding:"6px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit" },
  updateProgressTrack: { height:4, background:t.bgChartTrack, borderRadius:2, overflow:"hidden", marginTop:8 },
  updateProgressFill: { height:"100%", background:t.accent, borderRadius:2, transition:"width 0.3s ease" },
  };
}