import {
  buildMobileGridRows,
  extractNotePreviewLines,
  mixHexColor,
  withHexAlpha
} from "../app/components/nooklab-grid/grid-helpers";
import {
  NOOKLAB_BASE_URL,
  NOOKLAB_DEFAULT_SERVER_URLS,
  NOOKLAB_REACHABILITY_URL
} from "../app/common/nooklab-config";
import {
  NOOKLAB_ACCENT,
  NookLabDarkTheme,
  NookLabLightTheme
} from "../app/common/nooklab-theme";

describe("NookLab mobile grid helpers", () => {
  it("groups note indices per section without crossing section boundaries", () => {
    expect(buildMobileGridRows(0, [])).toEqual([]);

    const rows = buildMobileGridRows(5, [
      {
        index: 0,
        group: { id: "pinned", title: "", type: "header" }
      },
      {
        index: 3,
        group: { id: "nov", title: "November 2026", type: "header" }
      }
    ]);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      kind: "section-header",
      itemIndex: 0,
      showControls: true
    });
    expect(rows[1]).toMatchObject({ kind: "pair", indices: [0, 1] });
    expect(rows[2]).toMatchObject({ kind: "pair", indices: [2] });
    expect(rows[3]).toMatchObject({
      kind: "section-header",
      itemIndex: 3,
      showControls: false
    });
    expect(rows[4]).toMatchObject({ kind: "pair", indices: [3, 4] });
  });

  it("falls back to paired rows when group metadata is unavailable", () => {
    const rows = buildMobileGridRows(3, null);
    expect(rows.map((r) => (r.kind === "pair" ? r.indices : null))).toEqual([
      [0, 1],
      [2]
    ]);
  });

  it("blends hex colors cleanly for light and dark ColorNote cards", () => {
    expect(mixHexColor("#ff0000", "#ffffff", 0.5)).toBe("#ff8080");
    expect(mixHexColor("#0f0", "#000000", 1)).toBe("#00ff00");
    expect(withHexAlpha("#dc2626", 0.5)).toBe("rgba(220, 38, 38, 0.50)");
  });

  it("extracts multi-line HTML preview, checklists, and strips duplicate title", () => {
    const html = [
      "<p>Cliente Teste</p>",
      "<p>Rua das Flores &amp; Co</p>",
      '<ul data-type="taskList"><li data-checked="true">Feito</li><li data-checked="false">Falta peça</li></ul>',
      "<hr />",
      "<p>Montijo</p>"
    ].join("");

    const preview = extractNotePreviewLines(html, "Cliente Teste", "fallback");
    expect(preview).toBe(
      "Rua das Flores & Co\n☑ Feito\n☐ Falta peça\n───\nMontijo"
    );
  });
});

describe("NookLab mobile config and theme", () => {
  it("points default hosts to nooklab.duckdns.org", () => {
    expect(NOOKLAB_DEFAULT_SERVER_URLS).toEqual({
      API_HOST: `${NOOKLAB_BASE_URL}/api`,
      AUTH_HOST: `${NOOKLAB_BASE_URL}/auth`,
      SSE_HOST: `${NOOKLAB_BASE_URL}/sse`,
      MONOGRAPH_HOST: `${NOOKLAB_BASE_URL}/mono`
    });
    expect(NOOKLAB_REACHABILITY_URL).toBe("https://nooklab.duckdns.org/api/health");
  });

  it("rebrands both light and dark mobile themes with NookLab red", () => {
    expect(NookLabLightTheme.id).toBe("nooklab-light");
    expect(NookLabDarkTheme.id).toBe("nooklab-dark");
    expect(NookLabLightTheme.scopes.base.primary.accent).toBe(NOOKLAB_ACCENT);
    expect(NookLabDarkTheme.scopes.base.primary.accent).toBe(NOOKLAB_ACCENT);
    expect(JSON.stringify(NookLabLightTheme)).not.toContain("#008837");
    expect(JSON.stringify(NookLabDarkTheme)).not.toContain("#008837");
  });
});
