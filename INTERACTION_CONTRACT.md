# Geometra interaction contract (v1)

This document defines expected keyboard/focus behavior across renderers.

## Focus model

- Focus targets are `box()` elements with any of:
  - `onClick`
  - `onKeyDown` / `onKeyUp`
  - `onCompositionStart` / `onCompositionUpdate` / `onCompositionEnd`
- Focus traversal order is document order (pre-order tree walk).
- Click-to-focus is enabled for focusable boxes via hit dispatch.

## Tab and Shift+Tab

- `Tab` on `onKeyDown` always moves focus to next focusable target.
- `Shift+Tab` on `onKeyDown` always moves focus to previous focusable target.
- Tab traversal wraps:
  - last -> first on `Tab`
  - first -> last on `Shift+Tab`
- Tab traversal takes priority over focused `onKeyDown` handlers.

## Key dispatch

- Non-Tab keyboard events dispatch to the currently focused target only.
- If no focus target exists, non-Tab keyboard events are ignored.
- `onKeyUp` is dispatched to currently focused target when present.

## Text input semantics

- Printable key insertion requires:
  - focused editable target
  - no blocking modifier (`meta`, `ctrl`, `alt`)
- Canonical editing expectations:
  - `Backspace`: delete backward or merge with previous node at start boundary
  - `Delete`: delete forward or merge with next node at end boundary
  - `ArrowLeft` / `ArrowRight`: caret move; optional range extension with shift
  - `Enter`: insert newline
  - `Escape`: renderer/app-defined cancel or blur behavior

## Composition / IME

- `onCompositionStart`: snapshot active selection for composition anchor.
- `onCompositionUpdate`: maintain transient draft (do not commit permanent text).
- `onCompositionEnd`: commit composed string at anchor snapshot.
- Composition events dispatch to currently focused target only.

## Renderer alignment requirements

- Canvas and terminal demos should route keyboard input through `app.dispatchKey`.
- Composition-capable renderers should route IME events through `app.dispatchComposition`.
- Renderer-specific key parsing (raw stdin, browser events) must normalize into:
  - `key`, `code`, `shiftKey`, `ctrlKey`, `metaKey`, `altKey`.
