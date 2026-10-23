---
name: Gantry
description: The operator console of the Shuttle gateway and the Hub access service.
colors:
  surface: "#ffffff"
  surface-sunken: "#f4f5f7"
  text: "#14171b"
  text-muted: "#59616e"
  border: "#d6dae1"
  accent: "#2449b8"
  status-ok: "#146c43"
  status-warn: "#7a4d00"
  status-error: "#a5221b"
typography:
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.5
  small:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    lineHeight: 1.5
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
rounded:
  sm: "4px"
  md: "6px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  xxl: "2rem"
components:
  button:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  button-hover:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
  table-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "0.5rem 0.75rem"
---

# Gantry — the design system

The design system of Gantry is the one of an operations console: it is
quiet, it is dense, and a colour means a state.

**This document records the system as it is in the milestone 2.** The screens
of the status are the first screens of the console; the administration (the
milestone 3) has no screen yet, and the document is rewritten with
`/impeccable document` when it has one. What is written here is the shell,
the screens of the status and the tokens they use.

## Overview

The reader is an operator, under pressure, during an outage. The system
therefore optimises for reading, not for expression:

- the page is a **table**, not a card grid: the data is a list of routes,
  of tenants and of decisions, and a table is the shape a list takes;
- the density is high: a row is a line, not a box;
- the palette is the palette of the platform, not a brand palette: the
  console is a part of the platform, and it looks like one;
- **colour is reserved for the state of the system.** There is no accent
  colour on a page that is not a state.

## Colors

| Token | Light | Dark | Where |
| --- | --- | --- | --- |
| `--color-surface` | `#ffffff` | `#14171b` | the page |
| `--color-surface-sunken` | `#f4f5f7` | `#1b1f25` | a control, a header of a table |
| `--color-text` | `#14171b` | `#e8eaee` | the text |
| `--color-text-muted` | `#59616e` | `#a2abb8` | the secondary text, the captions |
| `--color-border` | `#d6dae1` | `#2c323a` | the lines of the tables, the border of the controls |
| `--color-accent` | `#2449b8` | `#8fb0ff` | the focus, the link, nothing else |
| `--color-status-ok` | `#146c43` | `#56d394` | a state that is good |
| `--color-status-warn` | `#7a4d00` | `#e0b050` | a state that asks for an eye |
| `--color-status-error` | `#a5221b` | `#ff8a80` | a state that is broken |

The dark palette is the same palette: the console follows the system of the
reader, because the reader is often in a dark room at three in the morning.

A state is **a word and a colour**. A tile that is only red is a tile that a
reader with a colour vision deficiency cannot read, and a tile that is only
a word is a tile that a reader who scans a column of states cannot read
quickly. Both, always.

## Typography

- The **body** is the system sans at `0.9375rem` with a leading of `1.5`:
  the console is read at a distance, on a phone, in a hurry.
- The **identifiers** — the subject of the caller, the tenant, the keys of
  the permissions — are the system monospace at `0.8125rem`, in the muted
  colour. They are values and not prose, and a monospace tells the reader
  that at a glance.
- The **title** of the page is `1.5rem` at a weight of `600`. There is one
  title on a page, and it is the name of the thing the page is about.

The system fonts are the fonts of the machine of the reader: a console that
downloads a font is a console that is slow when the network is bad, and the
network is bad when the console is needed.

## Layout

- The page is a **single column** with the reading order of the question:
  who the caller is, what it may do, what its tenant holds. The width of
  the column follows the width of a table of routes: wide enough for the
  path of a route, narrow enough for a laptop of a laptop.
- The padding of the page is `--space-6` vertically and `--space-4`
  horizontally on a wide screen, and `--space-4` on every side on a narrow
  one. The page is read at 390 px wide, and it is read on a laptop.
- A table is `width: 100%` with a collapsed border, and its lines are
  `--space-2` by `--space-3`. The row of a table is a line: the density is
  the point.

## Elevation & Depth

There is **no elevation**. A console has no layers: every panel is a
section of the page, and a shadow would be a lie about a stack that does
not exist. The separation is made with the space and with a line of
`--color-border`.

## Shapes

The radius is `--radius-sm` (`4px`) for the controls and `--radius-md`
(`6px`) for the containers of the screens that come in the milestone 2.
Nothing is round, nothing is a pill: a console is not a consumer app.

## Components

### The table

The table is the component of the console. Its rules:

- the header is the caption: the table says what it holds, in the muted
  colour, in the small size;
- the columns are left aligned, except a column of a number, which is
  right aligned;
- a row is separated by a line of `--color-border`, and there is no zebra:
  the lines are enough;
- the state of a row is a word in the status colour of the state.

### The button

The button is the system font at the size of the body, with a sunken
surface, a border of `--color-border` and a radius of `--radius-sm`. Its
hover is a border of `--color-accent`, and its focus is an outline of
`--color-accent` of two pixels. The focus is always visible: the reader
may be on the keyboard.

### The tile

A tile is a number, the name of the number, and the state of the number:

- the number is in the monospace, at the size of a title, with the figures
  aligned (`tabular-nums`): a column of numbers is read down,
- the name is the small muted text under the number: it says what the
  number is, and it is the second thing the reader looks at,
- the state is a **word** — "healthy", "degraded", "broken" — in the colour
  of the state. A state is a word and a colour, and never a colour alone.

The tile has one border, of `--color-border`, and no other. A thick
coloured border on one side of a card is a tic of the interfaces of the
generators, and it says nothing about the state.

### The panel that is not there yet

A panel that waits for a change of a service is a dashed box with the name
of the panel, the service and the version that carry it, and what it will
show. It is the honest answer: the console says that it does not have the
panel, and why.

### The table of a status

The table of a status is bounded (`max-width: 64rem`): a table of two
columns that is stretched over a wide screen is two columns at the two
ends of the screen. The last column, the one of the numbers, is right
aligned.

### The island

An island is a part of the page that the browser owns. It looks like the
rest of the page: the same font, the same colours, the same radius. An
island that looks like a widget from another product is a widget from
another product.

## Do's and Don'ts

- **Do** keep the density: a table of a hundred rows is a hundred lines,
  and the reader came for the hundredth row.
- **Do** use the tokens of this document. A colour that is not a token is a
  colour that is a decision nobody made.
- **Do** follow the system of the reader for the palette, the font and the
  motion.
- **Don't** use a colour for anything but a state. The console is grey, and
  it is grey on purpose: a page that is full of colour is a page where the
  colour means nothing.
- **Don't** animate anything that an operator did not ask to move. The
  motion of a console is the refresh of a number, and nothing else.
- **Don't** put a card where a row belongs.
