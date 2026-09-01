---
name: Scene Assembly
description: A precise, moderately energetic studio for multi-provider image and video generation.
colors:
  canvas: "#081012"
  canvas-elevated: "#0e191b"
  prompt-surface: "#0d1d20"
  ink: "#ecf5f5"
  ink-muted: "#8fa5a7"
  ink-subtle: "#7a8d8f"
  signal-cyan: "#00fff9"
  motion-violet: "#bd00ff"
  output-magenta: "#ff006e"
  marker-yellow: "#ffed4e"
  hairline: "#c2e8f013"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.011em"
  label:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.35
  micro:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.7rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.2em"
rounded:
  sm: "8px"
  md: "11px"
  pill: "999px"
spacing:
  compact: "8px"
  control-x: "12px"
  panel: "14px"
  standard: "16px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.95rem"
    height: "2.25rem"
  button-secondary:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.85rem"
    height: "2.25rem"
  input:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.4rem 0.75rem"
  card:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px"
  prompt-panel:
    backgroundColor: "{colors.prompt-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px"
---

# Design System: Scene Assembly

## Overview

**Creative North Star: "The Illuminated Workbench"**

Scene Assembly is a dark creative workbench where the media stays central and the controls read as precise instruments. Near-black teal canvases keep long sessions calm; small, deliberate signals of cyan, violet, magenta, and yellow provide the moderate energy expected from a creative tool.

The system favors compact density, familiar controls, and one consistent vocabulary across providers. It rejects cyberpunk or gaming excess, generic purple-gradient AI styling, and sterile enterprise dashboards that erase creative energy.

**Key Characteristics:**

- Dark, teal-tinted surfaces with crisp pale ink.
- Compact Geist typography and restrained 8–11px corner radii.
- Bright accent colors reserved for actions, selection, provider identity, and state.
- Ambient depth from quiet tonal layering and low, diffuse shadows.
- Consistent workspace composition across image, video, and timeline tools.

## Colors

The palette resembles indicator lights over a dark physical workbench: bright enough to guide, rare enough to retain meaning.

### Primary

- **Signal Cyan** (`{colors.signal-cyan}`): primary actions, focus, links, and active timeline state.

### Secondary

- **Motion Violet** (`{colors.motion-violet}`): video identity, selected provider controls, and secondary model emphasis.

### Tertiary

- **Marker Yellow** (`{colors.marker-yellow}`): image-workspace identity and rare editorial emphasis.
- **Output Magenta** (`{colors.output-magenta}`): limited provider or generated-output emphasis, never a default action color.

### Neutral

- **Workbench Canvas** (`{colors.canvas}`): page background.
- **Raised Work Surface** (`{colors.canvas-elevated}`): fields, dialogs, navigation groups, and stronger panels.
- **Workbench Ink** (`{colors.ink}`): primary text and icons.
- **Muted Instrument Label** (`{colors.ink-muted}`): supporting text with substantial reading load.
- **Subtle Instrument Label** (`{colors.ink-subtle}`): tertiary metadata and placeholders.
- **Quiet Hairline** (`{colors.hairline}`): grouping borders and dividers.

**The Indicator-Light Rule.** Bright accents communicate action, selection, identity, or state. They are forbidden as undirected decoration.

**The One Active Signal Rule.** Within one control group, only the current action or selection receives a saturated accent.

## Typography

**Display Font:** Geist Sans (with system-ui fallback)  
**Body Font:** Geist Sans (with system-ui fallback)  
**Label/Mono Font:** Geist Mono (with monospace fallback)

**Character:** One compact sans family keeps the product precise and familiar. Mono appears only for short machine-like labels, never for body copy.

### Hierarchy

- **Display** (600, 1.25rem, 1.02): workspace and panel titles with tight tracking.
- **Headline** (600, 1.125rem, 1.15): page-level and major section headings.
- **Title** (600, 1rem, 1.2): cards and dense panel headings.
- **Body** (400, 0.875rem, 1.45): controls, descriptions, and instructional copy.
- **Label** (600, 0.8125rem, 1.35): field labels and compact component labels.
- **Micro** (500, 0.7rem, 0.2em tracking, uppercase): rare provider and section identifiers of four words or fewer.

**The Working-Type Rule.** Hierarchy comes from weight and modest size changes. Display scale and ornamental type are prohibited inside task surfaces.

## Elevation

The system uses a hybrid of tonal layering and low ambient shadow. Higher dark surfaces become slightly lighter; shadows separate major cards and dialogs without becoming decorative glows.

### Shadow Vocabulary

- **Control edge** (`0 1px 2px rgba(0, 8, 9, 0.4)`): compact local separation.
- **Ambient panel** (`0 8px 30px -12px rgba(0, 8, 9, 0.7)`): major cards only.
- **Dialog lift** (`0 30px 70px -25px rgba(0, 8, 9, 0.85)`): modal separation above the canvas.

**The Quiet Depth Rule.** Tonal difference establishes elevation first. Shadows reinforce hierarchy; they never make every panel float.

## Components

### Prompt Panel

The Prompt section is the illuminated work surface: a slightly richer teal wrapper
around the normal raised textarea. A short Signal Cyan perimeter segment makes one
two-second clockwise lap, fading during its first and last 250ms, then disappears
for five seconds. Textarea focus lets the current lap finish, suppresses repeats,
and starts a fresh five-second wait on blur.

**The Editing-Is-Quiet Rule.** Ambient prompt motion never restarts while the
textarea is focused. The current lap may finish because interrupting it reads as a
broken state rather than a calm handoff.

### Buttons

- **Shape:** gently curved controls (`{rounded.sm}`) at a shared 2.25rem height.
- **Primary:** Signal Cyan surface, dark canvas text, medium weight, and compact horizontal padding.
- **Hover / Focus:** a small brightness lift and cyan focus signal; active state may move by one pixel.
- **Secondary:** dark translucent surface, pale ink, and a quiet hairline that strengthens on hover.

### Chips

- **Style:** full pills with compact type, a full-perimeter hairline, and low-chroma tinted fill.
- **State:** the selected chip uses its semantic accent; unselected chips remain neutral.

### Cards / Containers

- **Corner Style:** gently curved (`{rounded.md}`).
- **Background:** a quiet teal-tinted surface over the workbench canvas.
- **Shadow Strategy:** ambient panel shadow on major cards; tonal layering for nested content.
- **Border:** one full-perimeter Quiet Hairline.
- **Internal Padding:** 14px compact panels or 16px standard panels.

### Inputs / Fields

- **Style:** raised work-surface background, visible input hairline, compact body type, and 8px radius.
- **Focus:** cyan border plus a restrained three-pixel focus ring.
- **Error / Disabled:** semantic color is paired with message text; disabled controls retain legible labels and reduce intensity.

### Navigation

Sticky navigation uses a dark translucent canvas with a hairline divider. Workspace choices sit in one compact segmented group: Image uses Marker Yellow, Video uses Motion Violet, and Timeline uses Signal Cyan only while active.

### Generation Workspace

Setup controls occupy the left column. Prompt and Result or Jobs stay together in the right column through the shared workspace layout; providers do not recompose these areas independently.

## Do's and Don'ts

### Do:

- **Do** keep generated media visually dominant over control chrome.
- **Do** use Signal Cyan for primary action and focus, Motion Violet for video identity, and Marker Yellow for image identity.
- **Do** use one full-perimeter hairline and tonal layering to separate controls.
- **Do** keep interactive states fast, familiar, and consistent across providers.
- **Do** preserve compact control density, 8–11px radii, and Geist typography.

### Don't:

- **Don't** create cyberpunk or gaming interfaces whose glow, ornament, or motion competes with the work.
- **Don't** use generic AI-product styling built around purple gradients and decorative color.
- **Don't** turn Scene Assembly into a sterile enterprise dashboard that erases the product's creative energy.
- **Don't** use bright accents without a clear action, selection, identity, or state meaning.
- **Don't** add side-stripe accents, gradient text, oversized card radii, or decorative glass effects.
- **Don't** allow provider-specific pages to drift from the shared prompt, result, and control vocabulary.
