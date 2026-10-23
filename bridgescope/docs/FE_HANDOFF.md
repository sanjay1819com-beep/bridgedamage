# BridgeScope — finite-element and data handoff contract

Version 0.1 · 23 October 2026

## Current integration boundary

The current demonstrator uses procedural bridge geometry and an illustrative 24-element Euler–Bernoulli model. It is **not** a calibrated Z24 model, your team's FE model, a pretrained damage detector, or an operational safety system.

The implemented upload adapter accepts CSV/NPY acceleration for exploratory FDD spectra only. Custom GLB import, MAT/HDF5 adapters, sensor registration, model updating against your solver, and real-data damage attribution are future integration work.

## Suggested handoff bundle

```text
bridge_bundle/
  manifest.json
  geometry/bridge.glb
  structure/nodes.csv
  structure/elements.csv
  structure/mesh_zone_map.csv
  sensors/sensors.csv
  scenarios/scenarios.csv
  runs/<run_id>/acceleration.npy
  runs/<run_id>/modal_frequencies.csv
  runs/<run_id>/mode_shapes.npy
  runs/<run_id>/environment.csv
```

### manifest.json

```json
{
  "schema_version": "0.1",
  "bridge_id": "YOUR_BRIDGE_ID",
  "source": "simulation",
  "solver": "NAME_AND_VERSION",
  "coordinate_system": {"handedness": "right", "vertical_axis": "z"},
  "units": {"length": "m", "time": "s", "mass": "kg", "acceleration": "m/s^2", "temperature": "degC"},
  "sampling_frequency_hz": 100,
  "channel_axis": 0,
  "data_license": "SPECIFY_TERMS"
}
```

This is an example contract, not an implemented import schema. Do not use placeholder IDs in actual files.

### Geometry

- Prefer a compact GLB/glTF, with a documented conversion if the solver uses a different up axis.
- Give mesh groups stable names and zone IDs; do not merge the entire bridge into one unaddressable mesh.
- Supply a deterministic map from visible mesh/group IDs to structural zones and numerical element IDs.
- Preserve units, origin, and transforms. Include supports, deck, piers, and sensor anchor positions.
- A render mesh alone cannot support FE updating.

### Nodes and elements

`nodes.csv`: `node_id,x_m,y_m,z_m`

`elements.csv`: `element_id,zone_id,node_ids,element_type,material_id,section_id`

Also provide section/material properties, mass/stiffness matrices or a solver callable, boundary conditions, and the versioned healthy reference. Identify which parameters may be updated and their physically permissible bounds.

### Sensors

`sensors.csv`: `sensor_id,channel_index,x_m,y_m,z_m,direction_x,direction_y,direction_z,node_or_element_id,dof,unit`

- Channel order must be stable across recordings or explicitly remapped.
- Distinguish sensor location from sensing orientation.
- Document clocks, synchronization, missing-data conventions, calibration, and anti-aliasing.
- If measurement setups move sensors, retain setup IDs and common references. Do not treat moving channels as fixed nodes.

### Acceleration

- Canonical internal layout: `[channels, time_samples]`, real numeric values.
- Include sampling rate, start time, units, run ID, setup ID, scenario ID, and source (measured/simulated).
- Keep original record provenance; derive windows only after splitting independent recordings.
- A `12 × 3000` window is optional, not a universal modal-analysis requirement. Its physical duration is `3000 / fs` seconds. Longer records may be needed for reliable low-frequency modal and damping estimates.
- The current demo analyzes 12 × 12000 at 100 Hz; visual waveform decimation does not change the analysis sampling rate.

### Modal results

- Frequencies in Hz, damping convention if present, mode IDs, structural DOF ordering, mode-shape normalization, uncertainty, and identification method.
- State whether shapes are mass-normalized or arbitrarily scaled.
- Provide reference DOFs and mode correspondence between cases. Frequency order alone can be unreliable at mode crossings.

### Scenario metadata

`scenario_id,run_id,setup_id,temperature_air_degC,temperature_deck_degC,traffic_vehicles_per_min,vehicle_mass_kg,axle_loads_N,speed_mps,load_position_m,damage_zone_ids,damage_type,stiffness_reduction_fraction,seed`

- Missing or unmeasured quantities must be null, not zero or an invented estimate.
- Mark values as measured, controlled, inferred, or unavailable.
- Define severity physically. Stiffness reduction is not crack width, remaining capacity, or failure probability.
- Preserve multi-zone truth even if the first inference method assumes a single zone.

## Simulation design

1. Build healthy cases spanning temperature and loading independently.
2. Cross damage location/severity with environment/load instead of using one temperature per damage class.
3. Include multiple excitation/noise seeds, unmodeled boundary changes, sensor faults, and mass variability.
4. Retain independent held-out scenarios, seeds, parameter ranges, and bridge configurations.
5. A same-model forward/inverse test is a smoke test, not sim-to-real validation.

## Benchmark access and deployment

Request Z24 through KU Leuven and obey its non-commercial and non-transfer terms. Do not upload or redistribute restricted benchmark recordings through a publicly hosted dashboard without authorization. Agree on local/private execution before integrating licensed data.

## Acceptance checks for the next integration

- Coordinate/units round-trip and sensor overlay checked by the civil/FE team.
- Known healthy case reproduces expected modal frequencies/shapes within an agreed tolerance.
- Damage truth is not passed to the detector/localizer.
- Environmental normalizer sees healthy training data only.
- Original recordings do not leak across train/calibration/test windows.
- Localization is evaluated spatially, with uncertainty and ambiguous zones exposed.
- Independent real measurements are reserved for final testing.
