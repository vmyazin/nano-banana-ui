# Brand capture — Scene Assembly

Captured 2026-09-05 by the `explore-design` brand init. Regenerate with "rebrand the explorations".

## Detected sources

| Source | Path | Role |
| --- | --- | --- |
| Design-system doc | `DESIGN.md` | Authoritative: mood, palette names, typography scale, radii, component specs |
| Theme tokens | `app/globals.css` | Wins on conflict — `--tint-hue: 190`, neon accents, `--radius: 11px` |
| Fonts | `app/layout.tsx` (next/font) | Geist + Geist Mono |

Creative north star from `DESIGN.md`: **"The Illuminated Workbench"** — a dark, teal-tinted
workbench where the media stays central and controls read as precise instruments. Rejects
cyberpunk excess, generic purple-gradient AI styling, and sterile enterprise dashboards.

## Adaptation choices (dark product → light chrome)

The chrome is a quiet frame, so the dark brand is translated onto light paper rather than copied.
Dark chrome is opt-in and was not requested.

| Brand token | Value | Chrome role |
| --- | --- | --- |
| Workbench Canvas `#081012` | canvas | **Ink** (`--ink`), and the decision block's ground |
| Signal Cyan `#00fff9` | primary action | `--brand-500: #076c70` — eyebrow, letter badges, "what works" (contrast-fixed for paper) |
| Motion Violet `#bd00ff` | video identity | `--accent-500: #7b16aa` — "pick this if" |
| Output Magenta `#ff006e` | output emphasis | `--magenta: #bd0059` — "what risks" only |
| Marker Yellow `#ffed4e` | editorial emphasis | Kept flat on ink: variant letter glyphs, decision labels, decision hairline |
| `--tint-hue: 190` | teal tint | Paper `#f1f7f7` tinted faintly teal, hairlines `#d6e6e6` |

- **Fonts:** Geist (body + display, `-0.035em` display tracking per `typography.display`),
  Geist Mono at `0.2em` on eyebrow, meta, preview bars, and analysis labels per `typography.micro`.
  System fallbacks on both stacks.
- **Radius:** 11px / 14px, following `rounded.sm: 8px` / `rounded.md: 11px` rather than the
  neutral template's softer 16–20px.
- **Signature detail:** the decision block carries the marker-yellow top hairline from
  `components/account/AccountSurface.tsx`.

## Files

- `_template.html` — the branded chrome; copy it per exploration
- `_brand.md` — this file
