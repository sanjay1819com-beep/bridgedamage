import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from .engine import (analyze_simulation, analyze_upload, beam_modes,
                     generate_signals, scenario_defaults, localize, match_modes,
                     fdd, refine_projected_frequencies)
from .main import app

client = TestClient(app)


def test_modal_physics_stiffness_mass_temperature():
    healthy = beam_modes()[0]
    assert np.all(np.diff(healthy) > 0)
    assert np.all(beam_modes(20, 0, 8, 55, 8, .30)[0] <= healthy + 1e-6)
    assert np.all(beam_modes(40, 0, 8, 55)[0] < healthy)
    assert np.all(beam_modes(20, 30, 35, 30)[0] < healthy)


def test_reproducible_full_rate_signals():
    s = scenario_defaults()
    a, _, _ = generate_signals(s)
    b, _, _ = generate_signals(s)
    assert a.shape == (12, 12000)
    np.testing.assert_equal(a, b)
    assert np.all(np.isfinite(a))


@pytest.mark.parametrize('change', [
    dict(temperature=44),
    dict(temperature=-8, traffic=24, vehicle_mass=30, speed=40),
    dict(traffic=30, vehicle_mass=35, speed=30),
])
def test_known_healthy_environment_is_not_reported_as_damage(change):
    s = scenario_defaults()
    s.update(change, damage_enabled=False)
    r = analyze_simulation(s, False)
    assert r['assessment'] == 'baseline'
    assert r['localization']['zone'] is None
    assert r['probability'] is None
    assert all(m['damping'] is None for m in r['modes'])


@pytest.mark.parametrize('zone', [4, 8])
def test_damage_detected_and_localized_in_same_model_demo(zone):
    s = scenario_defaults()
    s['damage_zone'] = zone
    r = analyze_simulation(s, False)
    assert r['assessment'] == 'review'
    assert r['localization']['zone'] == zone
    assert abs(r['localization']['loss']-30) <= 5
    assert 'not calibrated probabilities' in r['localization']['ambiguity']


def test_inverse_does_not_use_injected_truth():
    s = scenario_defaults()
    accel, _, _ = generate_signals(s)
    f, sh = beam_modes(s['temperature'], s['traffic'], s['vehicle_mass'], s['speed'])
    matched = match_modes(fdd(accel), f, sh)
    refine_projected_frequencies(matched, accel, 100)
    true = localize(matched, s, True)
    changed = {**s, 'damage_zone': 1, 'stiffness_loss': .65, 'damage_enabled': False}
    assert localize(matched, changed, True) == true


def test_upload_does_not_invent_damage_or_geometry():
    accel, _, _ = generate_signals(scenario_defaults())
    r = analyze_upload(accel, 100, 'example.csv')
    assert r['assessment'] == 'not_assessed'
    assert 'localization' not in r
    assert 'probability' not in r
    assert len(r['candidates']) > 0


def test_bad_numerical_input_is_rejected():
    x = np.ones((3, 4096))
    with pytest.raises(ValueError, match='constant'):
        analyze_upload(x, 100, 'flat.csv')
    x[0, 0] = np.nan
    with pytest.raises(ValueError, match='non-finite'):
        analyze_upload(x, 100, 'nan.csv')


def test_api_health_and_scenario_bounds():
    r = client.get('/api/health')
    assert r.status_code == 200
    assert r.json()['trained_model_active'] is False
    assert client.post('/api/simulate', json={'damage_zone': 99}).status_code == 422
    assert client.get('/api/runs/not-a-run').status_code == 404
    assert client.get('/api/samples/unknown.csv').status_code == 404


def test_npy_upload_and_rejection_of_object_arrays():
    x, _, _ = generate_signals(scenario_defaults())
    out = io.BytesIO()
    np.save(out, x[:, :4096])
    r = client.post('/api/analyze', files={'file': ('data.npy', out.getvalue())}, data={'fs': 100})
    assert r.status_code == 200
    assert r.json()['assessment'] == 'not_assessed'
    out = io.BytesIO()
    np.save(out, np.array([['unsafe']], dtype=object))
    r = client.post('/api/analyze', files={'file': ('objects.npy', out.getvalue())}, data={'fs': 100})
    assert r.status_code == 422


def test_csv_time_spacing_check_and_file_types():
    bad = 'time_s,S01\n' + '\n'.join(f'{i*.02},{np.sin(i/20)}' for i in range(3000))
    r = client.post('/api/analyze', files={'file': ('bad.csv', bad.encode())}, data={'fs': 100})
    assert r.status_code == 422
    assert 'spacing' in r.json()['detail']
    r = client.post('/api/analyze', files={'file': ('x.mat', b'not supported')}, data={'fs': 100})
    assert r.status_code == 422


def test_synthetic_smoke_test_reports_denominators_and_limitations():
    r = client.post('/api/validate')
    assert r.status_code == 200
    d = r.json()
    assert d['n'] == 12 and d['healthy_n'] == 8 and d['damaged_n'] == 4
    assert d['compensated_false_flags'] <= d['raw_false_flags']
    assert 'same forward/inverse surrogate' in d['note']
