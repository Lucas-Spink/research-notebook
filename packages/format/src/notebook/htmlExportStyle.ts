/**
 * The one stylesheet, written into every page so the export is a set of
 * self-contained files: no remote fonts, no scripts, nothing fetched.
 */
export const HTML_EXPORT_STYLE = `
body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#1b1b1b;background:#fff}
header,main,footer{max-width:60rem;margin:0 auto;padding:.75rem 1rem}
header{border-bottom:1px solid #ccc}
footer{border-top:1px solid #ccc;color:#555;font-size:.875rem}
a{color:#0b5cad}
img{max-width:100%;height:auto}
figure.artefact{margin:1rem 0;padding:.5rem;border:1px solid #ddd}
figcaption{font-weight:600}
table{border-collapse:collapse;font-size:.875rem}
th,td{border:1px solid #ccc;padding:.25rem .5rem;text-align:left}
pre{overflow:auto;background:#f5f5f5;padding:.5rem}
.note,.more,.status{color:#555;font-size:.875rem}
@media (prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}a{color:#7db7ff}pre{background:#222}th,td,figure.artefact,header,footer{border-color:#444}.note,.more,.status,footer{color:#aaa}}
`;
