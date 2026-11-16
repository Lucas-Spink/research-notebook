# ADR-0070: Canvas figures fit their pictures

- Status: Proposed
- Date: 2026-11-12
- Deciders: maintainer
- Spec sections affected: 7.12 (canvas, result cards)
- Amends: ADR-0064 (card size)

## Context

A result card was pinned at a fixed 360 by 280 and the picture was centred in it with `object-fit: contain`, so most figures sat in empty space and had to be resized by hand, one by one.

## Decision

1. **A card fits its picture the first time the picture loads, if it still has the size it was pinned with.** The shape is read from the loaded `<img>` (`naturalWidth` over `naturalHeight`); no dimension is stored in the canvas file and the format does not change. The longer side of the picture area is 360 px and what the card adds around it (name and version lines, padding, border) is measured from the page, with a fixed fallback where nothing is laid out. The size is written as the ordinary `resize` edit.
2. **A card that has been arranged is never changed unasked.** Only the pinned size (exactly the default) is fitted on load, so reopening a canvas moves nothing. The edge case is a card someone left at exactly the default: it is fitted once, which is the wanted result anyway.
3. **On request:** each card with a known picture has a *Fit the box to the picture* button, and the canvas has *Fit all figures*, for canvases pinned before this change. Both are hidden where the canvas cannot be changed.
4. **Resizing keeps the picture's shape.** The resize handles keep the card's proportions while dragging, and when the drag ends the height is corrected so the picture fills the box exactly (the fixed lines above the picture would otherwise leave a strip).
5. **Results with no picture** (tables, scripts, text) report no size and keep the default.
6. **Tested with a fake image load** (`naturalWidth` and `naturalHeight` set on the element); real image decoding and layout were not exercised. The measured chrome is only checked through its fallback.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Store the picture's size in the canvas file | A format change for something that can be read from the picture; the shape would also go stale if the result changed version. |
| Fit every card on every load | Would undo the arrangement of existing canvases. |
| Only a button | The wanted result is that nothing needs doing; the buttons remain for older canvases. |

## Consequences

- A card may be resized once, shortly after its picture first appears, which is one more save of the canvas file.
- A very wide or tall picture is limited by the card's minimum size, so a thin strip of empty space can remain.
- The first fit uses the picture the card first loads; a thumbnail and the full picture have the same shape apart from rounding.
