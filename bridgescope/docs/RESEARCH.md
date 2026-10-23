# BridgeScope research notes and model shortlist

Checked 23 October 2026. Public cards/repositories were inspected; pretrained checkpoints were not downloaded, executed, or validated in this demonstrator.

## Hugging Face candidates

### MOMENT

- https://huggingface.co/AutonLab/MOMENT-1-small
- https://huggingface.co/AutonLab/MOMENT-1-base
- https://huggingface.co/papers/2402.03885

General-purpose pretrained time-series representations, reconstruction, and adaptation to forecasting/classification. Best first pretrained-model comparison for this project, not an end-to-end bridge damage locator. The small model's standard configuration uses 512 time steps. Do not blindly reshape or downsample 3000-point acceleration windows; preserve relevant frequency content, choose an adaptation strategy, and compare against task-specific baselines. MIT model-card license; verify the exact revision and dependencies at integration time. Weights are not currently loaded.

### Chronos-2

- https://huggingface.co/amazon/chronos-2

Pretrained multivariate/covariate-aware probabilistic forecasting. Consider it for modal-feature trends, not as a ready-made physical damage localizer or calibrated damage-probability estimator. Apache-2.0 card metadata at inspection. Optional experiment, not currently loaded.

### Generic vibration autoencoder

- https://huggingface.co/jayclifford345/vibration-autoencoder

A vibration/anomaly model artifact exists, but the inspected card says more information is needed for its training/evaluation data and intended use. Not recommended as the primary model without provenance, licensing, and independent target evaluation. A model name containing 'vibration' is not evidence of applicability to ambient civil-structure vibration.

## Bridge-specific reproduction candidate outside Hugging Face

- https://github.com/Elios-Lab/WaveNet_MiniRocket_Z24_Bridge_Structural_Health_Monitoring
- https://github.com/Elios-Lab/WaveNet_MiniRocket_Z24_Bridge_Structural_Health_Monitoring/tree/main/models

The repository contains `WaveNet_5classes.h5`, `WaveNet_15classes.h5`, `MiniRocket_5classes.h5`, and `MiniRocket_15classes.h5`, with code for Z24 progressive-damage ambient-vibration tests. Artifact existence was verified; compatibility and inference were not. Audit reuse permissions, preprocessing, label meaning, dependencies, and the exact training split. A public Z24 checkpoint may have already seen prospective test recordings; do not claim an independent held-out score without resolving overlap.

Scenario classification does not automatically yield physical localization, stiffness-loss severity, or environmental attribution. MiniRocket is a convolutional feature transform plus classifier, not conventional deep learning.

## Datasets

### Official Z24 bridge benchmark

https://bwk.kuleuven.be/bwm/z24

Use the long-term environmental campaign to study environmental variability and healthy normalization, and the progressive-damage campaign to study known interventions. Respect changes in sensor setups and common reference channels. Vehicle-presence monitoring is not a validated vehicle-weight label.

The official source describes a 30 m main span and 14 m side spans. Long-term and short-term campaigns differ in sensor arrangements and measurement procedures. Do not hard-code a 12-channel processed layout as a universal Z24 property.

Official terms at inspection: registration; non-commercial research; source acknowledgement and relevant citations; no transfer to third parties. Do not bundle recordings into the public app. A community dataset's license tag does not resolve conflicting original-source restrictions.

### Community-processed Z24 on Hugging Face

https://huggingface.co/datasets/thanglexuan/Z24-dataset-processed

Card describes `(1530, 27, 6000)` arrays derived from scenario/setup/segment dimensions. This is data, not a trained model. Its bridge geometry description conflicts with the official source, its labels are not sufficiently specific in the card, and environmental/load availability is not proven by generic application claims. Verify metadata, channel/coordinate mapping, provenance, and permissions before using it. No copy has been downloaded or redistributed by this project.

## Implemented demonstrator vs proposed research

Implemented: a small illustrative Euler–Bernoulli solver; stochastic four-mode acceleration synthesis; FDD shapes; projected AR(2) frequency estimates; known-condition analytical healthy reference; a fixed residual tolerance; single-zone inverse surrogate search; basic CSV/NPY exploration; evidence-oriented 3D dashboard; downloadable report; a 12-case same-model synthetic smoke test.

Not implemented: pretrained AI inference, real Z24 parsing/validation, GP/autoencoder environmental learning, sensor-free attribution, curvature/flexibility/strain-energy localization, GNN, domain adaptation, calibrated confidence, persistent field alerts, custom FE/GLB import, or field deployment hardening.

## Planned experimental sequence

1. Access and audit benchmark files and team FE output.
2. Build leakage-safe chronological/group splits before windowing; keep calibration separate from testing.
3. Establish modal residual and MiniRocket baselines.
4. Compare MOMENT embeddings/reconstruction and one raw-signal neural architecture.
5. Compare measured-condition GP with sensor-free alternatives only under explicit assumptions.
6. Evaluate curvature/flexibility/strain-energy localization with valid geometry and normalization.
7. Evaluate constrained FE updating and uncertainty; expose non-identifiability and alternative zones.
8. Test sim-to-real only with matched structures/DOFs and independent target tests.
9. Add GNN only if independent data volume and baseline evidence justify it.

Report false alerts per day, damage recall/delay, spatial error or top-k localization, severity error where physical truth exists, calibration/coverage, and abstention under unsupported conditions. Do not substitute random window accuracy for independent real-world monitoring performance.
