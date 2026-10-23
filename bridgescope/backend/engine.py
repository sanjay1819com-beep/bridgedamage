"""Transparent simulation and output-only vibration analysis for a research demo.

This is NOT a calibrated Z24 model, pretrained AI, or a field safety system.
The solver is a 24-element Euler–Bernoulli surrogate with illustrative parameters.
Detection uses a fixed engineering tolerance, not a calibrated damage probability.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
from scipy import linalg, signal, optimize

FS = 100.0
N_SAMPLES = 12000
LENGTH = 60.0
N_ELEMENTS = 24
N_ZONES = 12
SENSOR_NODES = np.arange(1, 24, 2)
SENSOR_X = SENSOR_NODES * LENGTH / N_ELEMENTS
# Coordinates along a 60 m, three-span demonstrator; not an as-built bridge.
SUPPORT_NODES = [0, 6, 18, 24]
N_MODES = 4
EI_REFERENCE = 32e9 * 1.7
MASS_PER_METRE = 18000.0
# A deliberately explicit demo tolerance, not an inferred standard deviation.
FREQUENCY_TOLERANCE_HZ = 0.045


def scenario_defaults() -> dict:
    return dict(temperature=24.0, traffic=16.0, vehicle_mass=12.0,
                speed=55.0, damage_enabled=True, damage_zone=8,
                stiffness_loss=0.30, seed=42)


def environment(temperature: float, traffic: float, vehicle_mass: float,
                speed: float) -> tuple[float, float]:
    # Illustrative effective stiffness, including an intentionally nonlinear
    # cold-weather term. Does not constitute a constitutive law for concrete.
    thermal_factor = 1.0 - 0.0016 * (temperature - 20.0) + 0.002 * max(0.0, -temperature)
    crossing_seconds = LENGTH / (speed / 3.6)
    occupied_vehicles = traffic * crossing_seconds / 60.0
    added_mass_per_metre = occupied_vehicles * vehicle_mass * 1000.0 / LENGTH
    return thermal_factor, added_mass_per_metre


@lru_cache(maxsize=4096)
def beam_modes(temperature: float = 20.0, traffic: float = 0.0,
               vehicle_mass: float = 8.0, speed: float = 55.0,
               zone: int = 0, loss: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Consistent-mass, pinned-support beam eigenproblem; 2 DOFs per node."""
    h = LENGTH / N_ELEMENTS
    tf, added_mass = environment(temperature, traffic, vehicle_mass, speed)
    ndof = 2 * (N_ELEMENTS + 1)
    K, M = np.zeros((ndof, ndof)), np.zeros((ndof, ndof))
    k0 = np.array([[12, 6*h, -12, 6*h], [6*h, 4*h*h, -6*h, 2*h*h],
                   [-12, -6*h, 12, -6*h], [6*h, 2*h*h, -6*h, 4*h*h]]) / h**3
    m0 = np.array([[156, 22*h, 54, -13*h], [22*h, 4*h*h, 13*h, -3*h*h],
                   [54, 13*h, 156, -22*h], [-13*h, -3*h*h, -22*h, 4*h*h]]) * h / 420
    for e in range(N_ELEMENTS):
        element_zone = e // 2 + 1
        stiffness = EI_REFERENCE * tf * (1 - loss if zone == element_zone else 1)
        ix = np.arange(2*e, 2*e + 4)
        K[np.ix_(ix, ix)] += stiffness * k0
        M[np.ix_(ix, ix)] += (MASS_PER_METRE + added_mass) * m0
    constrained = {2*n for n in SUPPORT_NODES}
    free = np.array([d for d in range(ndof) if d not in constrained])
    vals, vecs = linalg.eigh(K[np.ix_(free, free)], M[np.ix_(free, free)], subset_by_index=[0, 7])
    freqs = np.sqrt(np.maximum(vals, 0)) / (2*np.pi)
    full = np.zeros((ndof, len(freqs)))
    full[free] = vecs
    shapes = full[2*SENSOR_NODES]
    shapes /= np.maximum(np.linalg.norm(shapes, axis=0), 1e-12)
    # Stable signs for visual comparison; MAC itself is sign-invariant.
    for j in range(shapes.shape[1]):
        p = np.argmax(np.abs(shapes[:, j]))
        if shapes[p, j] < 0:
            shapes[:, j] *= -1
    return freqs, shapes


def generate_signals(scenario: dict, n_samples: int = N_SAMPLES) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    zone = int(scenario['damage_zone']) if scenario['damage_enabled'] else 0
    loss = float(scenario['stiffness_loss']) if scenario['damage_enabled'] else 0.0
    freqs, shapes = beam_modes(float(scenario['temperature']), float(scenario['traffic']),
                              float(scenario['vehicle_mass']), float(scenario['speed']), zone, loss)
    rng = np.random.default_rng(int(scenario['seed']))
    burn = 2000
    modal_signals = []
    for j, f in enumerate(freqs[:N_MODES]):
        damping = 0.012 + 0.002*j
        r = np.exp(-damping * 2*np.pi*f/FS)
        theta = 2*np.pi*f/FS * np.sqrt(1-damping*damping)
        q = signal.lfilter([1-r], [1, -2*r*np.cos(theta), r*r], rng.standard_normal(n_samples+burn))[burn:]
        q /= max(np.std(q), 1e-9)
        amplitude = 0.022 * (1 + 0.008*scenario['traffic']) / (1+j)**0.75
        modal_signals.append(q * amplitude)
    acceleration = shapes[:, :N_MODES] @ np.asarray(modal_signals)
    acceleration += rng.normal(0, 0.00045, acceleration.shape)
    return acceleration, freqs, shapes


def fdd(acceleration: np.ndarray, fs: float = FS, max_frequency: float = 30.0) -> dict:
    """Welch cross-spectral matrix eigendecomposition, equivalent to FDD SVD.

    Input is synchronized acceleration [sensor, sample]. Peak candidates are
    not automatically proven structural modes. Damping is deliberately not
    estimated by a naive half-power shortcut.
    """
    acceleration = signal.detrend(np.asarray(acceleration, dtype=float), axis=1)
    nperseg = min(2048, acceleration.shape[1])
    frequency, _, z = signal.spectrogram(acceleration, fs=fs, window='hann',
                                       nperseg=nperseg, noverlap=nperseg//2,
                                       detrend=False, scaling='density', mode='complex', axis=-1)
    cross = np.einsum('ift,jft->fij', z, z.conj(), optimize=True) / z.shape[-1]
    vals, vecs = np.linalg.eigh(cross)
    first = np.maximum(vals[:, -1].real, 1e-18)
    keep = (frequency >= 0.4) & (frequency <= min(max_frequency, fs*0.45))
    indices = np.flatnonzero(keep)
    local_peaks, _ = signal.find_peaks(first[keep], prominence=max(first[keep].max()*0.001, 1e-16), distance=3)
    peaks = indices[local_peaks]
    peaks = peaks[np.argsort(first[peaks])[-32:]]
    candidates = []
    for k in peaks:
        # Interpolate log spectral power to reduce FFT-bin quantization.
        offset = 0.0
        if 0 < k < len(first)-1:
            a, b, c = np.log(first[k-1:k+2])
            denominator = a - 2*b + c
            if abs(denominator) > 1e-12:
                offset = float(np.clip(0.5*(a-c)/denominator, -0.5, 0.5))
        frequency_estimate = frequency[k] + offset * fs/nperseg
        v = vecs[k, :, -1]
        v = v * np.exp(-1j*np.angle(v[np.argmax(np.abs(v))]))
        shape = v.real
        shape /= max(np.linalg.norm(shape), 1e-12)
        candidates.append(dict(frequency=float(frequency_estimate), shape=shape, power=float(first[k])))
    decimation = max(1, len(indices)//750)
    ix = indices[::decimation]
    return dict(candidates=candidates, psd_frequency=frequency[ix],
                psd_db=10*np.log10(first[ix]), resolution_hz=fs/nperseg,
                n_segments=z.shape[-1])


def mac(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.abs(np.vdot(a, b))**2 / max(float(np.vdot(a, a).real*np.vdot(b, b).real), 1e-15))


def match_modes(identified: dict, expected_frequencies: np.ndarray, expected_shapes: np.ndarray) -> list[dict]:
    candidates = identified['candidates']
    if not candidates:
        raise ValueError('No stable spectral peak candidates could be identified.')
    costs = np.zeros((N_MODES, len(candidates)))
    for i in range(N_MODES):
        for j, c in enumerate(candidates):
            distance = abs(c['frequency']/expected_frequencies[i] - 1)
            local_power = max((p['power'] for p in candidates if abs(p['frequency']/expected_frequencies[i]-1) < 0.35), default=c['power'])
            power_penalty = -0.12*np.log(max(c['power']/local_power, 1e-8))
            costs[i, j] = 2*(1-mac(expected_shapes[:, i], c['shape'])) + 0.5*distance + power_penalty
            if distance > 0.35:
                costs[i, j] += 20
    rows, columns = optimize.linear_sum_assignment(costs)
    matched = []
    for i, j in zip(rows, columns):
        c = candidates[j]
        shape = c['shape'].copy()
        if np.dot(shape, expected_shapes[:, i]) < 0:
            shape *= -1
        quality = mac(shape, expected_shapes[:, i])
        if costs[i, j] >= 20 or quality < 0.65:
            continue
        matched.append(dict(mode=int(i+1), frequency=c['frequency'], shape=shape,
                            mac=quality, expected=float(expected_frequencies[i])))
    return matched


def refine_projected_frequencies(matched: list[dict], acceleration: np.ndarray, fs: float) -> None:
    """AR(2) pole fit after FDD spatial projection, for this four-mode surrogate.

    Not a replacement for general automated SSI. This assumes well-separated
    modes and low measurement noise; the assumption is exposed in the UI/docs.
    No injected damage zone or severity is supplied to this estimator.
    """
    if len(matched) < 3:
        return
    shapes = np.column_stack([m['shape'] for m in matched])
    modal_coordinates = np.linalg.pinv(shapes) @ signal.detrend(acceleration, axis=1)
    for m, q in zip(matched, modal_coordinates):
        design = np.column_stack([q[1:-1], q[:-2]])
        coeffs, *_ = np.linalg.lstsq(design, q[2:], rcond=None)
        roots = np.roots([1, -coeffs[0], -coeffs[1]])
        positive = [r for r in roots if r.imag > 0 and 0.7 < abs(r) < 1.02]
        if positive:
            frequency = float(np.angle(positive[0])*fs/(2*np.pi))
            if abs(frequency/m['frequency']-1) < 0.12:
                m['frequency'] = frequency


@lru_cache(maxsize=256)
def inverse_library(temperature: float, traffic: float, vehicle_mass: float, speed: float):
    library = []
    for zone in range(1, N_ZONES+1):
        for loss in np.arange(0.05, 0.651, 0.05):
            f, s = beam_modes(temperature, traffic, vehicle_mass, speed, zone, round(float(loss), 2))
            library.append((zone, float(loss), f[:N_MODES], s[:, :N_MODES]))
    return library


def localize(matched: list[dict], scenario: dict, anomaly: bool) -> dict:
    if not anomaly or len(matched) < 3:
        return dict(zone=None, loss=None, plausible_loss_range=None,
                    ranking=[dict(zone=z, score=0.0) for z in range(1, 13)],
                    ambiguity='No localization reported without a frequency anomaly and at least three matched modes.',
                    method='Single-zone inverse surrogate search')
    measured = np.array([m['frequency'] for m in matched])
    indices = np.array([m['mode']-1 for m in matched])
    library = inverse_library(float(scenario['temperature']), float(scenario['traffic']),
                              float(scenario['vehicle_mass']), float(scenario['speed']))
    candidates = []
    for zone, loss, f, s in library:
        frequency_cost = float(np.mean(((measured-f[indices])/FREQUENCY_TOLERANCE_HZ)**2))
        shape_cost = float(np.mean([1-mac(m['shape'], s[:, m['mode']-1]) for m in matched]))
        cost = frequency_cost + 30*shape_cost
        candidates.append((cost, zone, loss))
    candidates.sort()
    best_cost, best_zone, best_loss = candidates[0]
    per_zone = []
    for zone in range(1, 13):
        cost = min(c[0] for c in candidates if c[1] == zone)
        # A relative compatibility index only. Do not interpret as probability.
        score = float(np.exp(-min((cost-best_cost)/2.0, 40)))
        per_zone.append(dict(zone=zone, score=round(score, 4), cost=round(cost, 4)))
    plausible = [loss for cost, zone, loss in candidates if zone == best_zone and cost <= best_cost+1.0]
    near_zones = [str(z['zone']).zfill(2) for z in per_zone if z['score'] > 0.6]
    return dict(zone=best_zone, loss=round(best_loss*100),
                plausible_loss_range=[round(min(plausible)*100), round(max(plausible)*100)],
                ranking=per_zone, best_cost=round(best_cost, 4),
                ambiguity=f"Compatible zones: {', '.join(near_zones)}. Relative fit scores are not calibrated probabilities.",
                method='Single-zone inverse surrogate search')


def build_timeline(scenario: dict) -> list[dict]:
    """Illustrative modal-level replay, NOT 36 independently analyzed recordings."""
    rng = np.random.default_rng(int(scenario['seed'])+991)
    output = []
    reference = beam_modes()[0][0]
    for k in range(37):
        t = scenario['temperature'] - 8 + 8*np.sin(k/36*np.pi/2)
        tr = scenario['traffic'] * (0.5 + 0.5*k/36)
        healthy_f = beam_modes(round(float(t), 3), round(float(tr), 3), float(scenario['vehicle_mass']), float(scenario['speed']))[0][0]
        # Scenario truth switches on at index 25 only in the illustrative replay.
        zone = int(scenario['damage_zone']) if scenario['damage_enabled'] and k >= 25 else 0
        loss = float(scenario['stiffness_loss']) if zone else 0.0
        measured = beam_modes(round(float(t), 3), round(float(tr), 3), float(scenario['vehicle_mass']), float(scenario['speed']), zone, loss)[0][0]
        measured += rng.normal(0, 0.006)
        output.append(dict(x=k, time=f'{6+k//3:02d}:{(k%3)*20:02d}',
                           observed=round(float(measured), 4), expected=round(float(healthy_f), 4),
                           compensated=round(float(reference+measured-healthy_f), 4),
                           reference=round(float(reference), 4), temperature=round(float(t), 1)))
    return output


def quality_metrics(acceleration: np.ndarray) -> dict:
    finite = np.isfinite(acceleration)
    stds = np.std(np.where(finite, acceleration, 0), axis=1)
    valid_channels = int(np.sum((stds > 1e-10) & np.all(finite, axis=1)))
    return dict(channels=int(acceleration.shape[0]), valid_channels=valid_channels,
                samples=int(acceleration.shape[1]), finite_fraction=round(float(finite.mean()), 6),
                rms=float(np.sqrt(np.mean(np.where(finite, acceleration, 0)**2))),
                flat_channels=int(np.sum(stds <= 1e-10)))


def analyze_simulation(scenario: dict, include_series: bool = True) -> dict:
    acceleration, _, _ = generate_signals(scenario)
    expected_f, expected_s = beam_modes(float(scenario['temperature']), float(scenario['traffic']),
                                      float(scenario['vehicle_mass']), float(scenario['speed']))
    reference_f, _ = beam_modes()
    identified = fdd(acceleration)
    matched = match_modes(identified, expected_f, expected_s)
    refine_projected_frequencies(matched, acceleration, FS)
    if not matched:
        raise ValueError('Insufficient mode correspondence; no damage assessment is available.')
    modal = []
    for m in matched:
        i = m['mode']-1
        modal.append(dict(mode=m['mode'], frequency=round(m['frequency'], 4),
                          expected=round(m['expected'], 4), reference=round(float(reference_f[i]), 4),
                          residual_hz=round(m['frequency']-m['expected'], 4),
                          raw_shift_pct=round((m['frequency']/reference_f[i]-1)*100, 3),
                          compensated_shift_pct=round((m['frequency']/m['expected']-1)*100, 3),
                          mac=round(m['mac'], 4), damping=None,
                          observed_shape=np.round(m['shape'], 5).tolist(),
                          expected_shape=np.round(expected_s[:, i], 5).tolist()))
    residuals = np.array([m['frequency']-m['expected'] for m in matched])
    # Require multiple modes, to reduce sensitivity to a single noisy peak.
    exceeded = int(np.sum(np.abs(residuals) > FREQUENCY_TOLERANCE_HZ))
    anomaly = exceeded >= 2 and len(matched) >= 3
    local = localize(matched, scenario, anomaly)
    env_shift = float((expected_f[0]/reference_f[0]-1)*100)
    first = modal[0]
    timestamp = datetime.now(timezone.utc).isoformat()
    content_id = hashlib.sha256((json.dumps(scenario, sort_keys=True)+timestamp).encode()).hexdigest()[:10]
    mean_mac = float(np.mean([m['mac'] for m in matched]))
    evidence = 'Elevated' if anomaly and mean_mac >= 0.90 else 'Moderate' if anomaly else 'Within tolerance'
    result = dict(id=content_id, timestamp=timestamp, source='simulation', scenario=scenario,
                  engine='Euler–Bernoulli surrogate + FDD shapes / projected AR(2) frequencies + conditioned inverse search',
                  source_note='Synthetic acceleration signals. Not Z24 measurements or a calibrated real-bridge model.',
                  assessment='review' if anomaly else 'baseline', evidence=evidence,
                  probability=None, confidence_note='Evidence strength, not a calibrated probability of structural damage.',
                  modes=modal, matched_modes=len(matched), quality=quality_metrics(acceleration),
                  fs=FS, duration_s=N_SAMPLES/FS, tolerance_hz=FREQUENCY_TOLERANCE_HZ,
                  mean_mac=round(mean_mac, 4), modes_exceeding_tolerance=exceeded,
                  environmental_shift_pct=round(env_shift, 3),
                  localization=local,
                  environment_supported=-10 <= scenario['temperature'] <= 45,
                  explanations=[
                      f"{exceeded} of {len(matched)} matched modes exceed the ±{FREQUENCY_TOLERANCE_HZ:.3f} Hz demonstration tolerance after compensation.",
                      f"The healthy surrogate predicts a {env_shift:+.2f}% first-mode change from temperature and added traffic mass.",
                      (f"Zone Z{local['zone']:02d} is the best single-zone surrogate fit; sparse modal information can admit alternative zones." if local['zone'] else 'No damage zone is highlighted because the residual evidence does not support localization.'),
                  ],
                  limitations=[
                      'No field dataset or pretrained model is active.',
                      'The demonstration tolerance is not empirically calibrated.',
                      'Temperature and traffic are known simulation inputs; vehicle mass is not inferred.',
                      'One record is analyzed. No persistent field alert or bridge safety decision is claimed.',
                      'The model assumes one stiffness-loss zone, uniform temperature, distributed traffic mass, and known supports.',
                      'Damping is not reported without a more suitable identification and uncertainty workflow.',
                      'The replay plot uses simulated modal observations, not separately processed acceleration records.',
                  ])
    if include_series:
        stride = 12
        result['signals'] = dict(time=np.round(np.arange(0, N_SAMPLES, stride)/FS, 3).tolist(),
                                 channels=np.round(acceleration[:, ::stride], 6).tolist())
        result['spectrum'] = dict(frequency=np.round(identified['psd_frequency'], 4).tolist(),
                                  db=np.round(identified['psd_db'], 3).tolist())
        result['timeline'] = build_timeline(scenario)
        result['sensors'] = [dict(id=f'S{i+1:02d}', x=float(x), y=0.0, z=0.0,
                                  zone=i+1, orientation='vertical', rms=round(float(np.sqrt(np.mean(acceleration[i]**2))), 5))
                             for i, x in enumerate(SENSOR_X)]
    return result


def analyze_upload(acceleration: np.ndarray, fs: float, filename: str) -> dict:
    quality = quality_metrics(acceleration)
    if quality['finite_fraction'] < 1:
        raise ValueError('The file contains missing or non-finite values. Clean or explicitly impute them before analysis.')
    if quality['flat_channels']:
        raise ValueError('One or more channels are constant. Remove faulty channels or provide valid measurements.')
    identified = fdd(acceleration, fs)
    candidates = sorted(identified['candidates'], key=lambda c: c['power'], reverse=True)[:8]
    candidates.sort(key=lambda c: c['frequency'])
    stride = max(1, acceleration.shape[1]//1200)
    return dict(filename=filename, source='uploaded', assessment='not_assessed', quality=quality,
                fs=fs, duration_s=acceleration.shape[1]/fs,
                candidates=[dict(frequency=round(c['frequency'], 4), power=round(c['power'], 9)) for c in candidates],
                resolution_hz=round(identified['resolution_hz'], 5),
                signals=dict(time=np.round(np.arange(0, acceleration.shape[1], stride)/fs, 4).tolist(),
                             channels=np.round(acceleration[:, ::stride], 7).tolist()),
                spectrum=dict(frequency=np.round(identified['psd_frequency'], 4).tolist(),
                              db=np.round(identified['psd_db'], 3).tolist()),
                note='Exploratory FDD peak candidates only. No matched healthy reference, sensor geometry, or calibrated environmental model was supplied. Damage, localization, severity, and damage confidence are not assessed.')
