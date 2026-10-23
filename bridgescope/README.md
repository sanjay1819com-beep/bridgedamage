# BridgeScope · Structural intelligence

A software-only, explainable bridge-vibration monitoring demonstrator: React + TypeScript, Three.js, FastAPI, NumPy, and SciPy.

**All default bridge measurements are synthetic. No pretrained model is active. No real benchmark has been evaluated. Do not use this demonstrator for bridge safety decisions.**

## Start locally

Requires Node 20+ and Python 3.11+ with compatible NumPy/SciPy builds.

```bash
npm install
python -m pip install -r requirements.txt
```

Terminal 1:

```bash
OPENBLAS_NUM_THREADS=1 python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Terminal 2:

```bash
npm run dev
```

Open the frontend at port 5173. All browser API requests use relative `/api` paths, proxied by Vite to the backend. The dev server accepts the Arena preview hostname. The browser never calls localhost directly.

```bash
npm run build
OPENBLAS_NUM_THREADS=1 python -m pytest backend -q
npm run qa:browser
npm run qa:tour
```

A presentation capture can be regenerated with `npm run record:tour`; the result is written to `qa/video/bridgescope-evidence-tour.webm`.

## What works

- Independently adjustable temperature, traffic flow, mean vehicle mass, speed, injected damage zone, stiffness reduction, and excitation seed.
- A 24-element Euler–Bernoulli, consistent-mass beam surrogate and four-mode stochastic synthetic acceleration, 12 channels × 12000 samples at 100 Hz.
- Welch cross-spectral FDD shapes, with AR(2) frequency estimates after FDD spatial projection. This demonstration assumes separated modes and low sensor noise. Damping is deliberately withheld.
- Healthy analytical environmental/load conditioning. This is not GP learning or pretrained AI.
- Fixed ±0.045 Hz demonstration tolerance in at least two modes with three modes matched. Not a calibrated false-alarm threshold or damage probability.
- Single-zone inverse surrogate search over zones and 5–65% stiffness reduction; frequency/MAC mismatch; ambiguous compatible zones are exposed. Relative fit indices are not probabilities.
- Clickable, orbitable procedural 3D bridge, sensor markers, relative-fit highlighting, camera reset, grid toggle, enlarged view, exaggerated normalized mode animation, and 2D fallback.
- Cinematic six-stage Evidence Tour with scrolling/autoplay camera choreography, animated traffic and water, synchronized sensor pulses, exaggerated modal deformation, environment/residual callouts, suspected-zone beacon, ambiguity markers, keyboard controls, and engineering-report export while preserving “suspected, not confirmed” wording.
- Signal and spectral exploration, modal tables and mode-shape comparison.
- CSV/NPY upload for exploratory FDD only; rejects missing values, bad time spacing, constant channels, unsupported shapes, and excessive files. Damage attribution is withheld without a healthy reference and geometry.
- Download full-resolution synthetic CSV, example recordings, Markdown analysis report, JSON results, FE handoff specification, and research notes.
- Recent synthetic run history (30 JSON records max); browser-local review acknowledgement; computed 12-case synthetic smoke test.

## Scientific limits

This is not a calibrated Z24 bridge, the team's FE model, a digital twin, a weight-in-motion estimator, an independent sim-to-real evaluation, or a field safety service. Geometry and structural parameters are illustrative. Temperature is uniform, added traffic mass is distributed, supports are known, and the inverse assumes one stiffness-loss zone. Model-fit rankings can be non-identifiable.

The modal replay is generated at modal level, not by independently processing 37 acceleration recordings. Only the current 120 s acceleration record is analyzed. Waveform display is decimated; analysis uses full-rate samples. A single finding does not establish a persistent alert.

No “damage confidence percentage” is invented. MAC describes shape correspondence; relative fit describes model compatibility; neither is a probability of damage. A stiffness-loss estimate refers only to the current same-model simulation family, not crack size or failure risk.

## Next integrations

See `docs/FE_HANDOFF.md` for the team export contract and `docs/RESEARCH.md` for public benchmark and pretrained-model findings, licenses/access cautions, and the evaluation roadmap.

Priority: official dataset access → sensor/FE registration → healthy-only environmental baseline → independent group/chronological splits → real benchmark validation → calibrated uncertainty and persistence. MiniRocket/MOMENT and other AI comparisons follow the data audit, rather than replacing it.

## Deployment boundary

This is a development demonstrator with no authentication, multi-tenant isolation, rate limiting, worker queue, or production access policy. Do not expose it with private or license-restricted recordings. Current uploads are analyzed in memory and not persisted; synthetic run reports are retained locally. Request permission before moving non-transferable benchmark data to remote hosting.
