# StadiumPal

An AI stadium companion that thinks a step ahead while you watch the match.

## Setup

_To be completed on Day 7._

## Architecture

_To be completed on Day 7._

## Simulation layer

Venue state (wait times at concessions, restrooms, and gates) is driven by a
pre-baked timeline in `venues/timeline.json` rather than live sensor data.

**Timing assumptions** — the 210-minute window and the shape of each wait-time
curve (entry rush at match start, innings-break spike at ~T=100, exit surge at
~T=200) are reasonable approximations for an IPL T20 night match. Real match
durations vary: a 20-over innings can run anywhere from 75 to 110+ minutes
depending on bowling pace, DRS reviews, strategic timeouts, and rain delays.
These timings are used for development and testing purposes only.

In production this simulation layer would be replaced by live data from POS
systems, gate scanners, and CV-based queue-detection cameras.

## Running tests

```bash
npm test
```

## Type checking

```bash
npm run type-check
```
