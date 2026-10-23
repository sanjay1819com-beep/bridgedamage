from __future__ import annotations

import io
import json
import re
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from .engine import (analyze_simulation, analyze_upload, generate_signals,
                     scenario_defaults, FREQUENCY_TOLERANCE_HZ)

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / 'data' / 'runs'
RUNS.mkdir(parents=True, exist_ok=True)
app = FastAPI(title='BridgeScope analytics', version='0.1.0',
              description='Software-only structural monitoring research demonstrator. No field safety decisions.')


class Scenario(BaseModel):
    temperature: float = Field(24, ge=-10, le=45)
    traffic: float = Field(16, ge=0, le=30, description='vehicles per minute')
    vehicle_mass: float = Field(12, ge=1, le=40, description='tonnes; known synthetic input')
    speed: float = Field(55, ge=20, le=100, description='km/h')
    damage_enabled: bool = True
    damage_zone: int = Field(8, ge=1, le=12)
    stiffness_loss: float = Field(0.30, ge=0, le=0.65)
    seed: int = Field(42, ge=0, le=1000000)


def persist(result: dict):
    (RUNS / f"{result['id']}.json").write_text(json.dumps(result), encoding='utf-8')
    for old in sorted(RUNS.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[30:]:
        old.unlink(missing_ok=True)


@app.get('/api/health')
def health():
    return dict(status='ok', engine='simulation', version='0.1.0',
                trained_model_active=False, benchmark_validation=False)


@app.post('/api/simulate')
def simulate(scenario: Scenario):
    try:
        result = analyze_simulation(scenario.model_dump())
        persist(result)
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get('/api/runs')
def runs():
    history = []
    for p in sorted(RUNS.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[:20]:
        try:
            r = json.loads(p.read_text())
            history.append({k: r[k] for k in ['id', 'timestamp', 'assessment', 'source', 'scenario', 'evidence']})
        except (OSError, json.JSONDecodeError, KeyError):
            continue
    return history


@app.get('/api/runs/{run_id}')
def get_run(run_id: str):
    if not re.fullmatch(r'[a-f0-9]{10}', run_id):
        raise HTTPException(404, 'Run not found.')
    path = RUNS / f'{run_id}.json'
    if not path.exists():
        raise HTTPException(404, 'Run not found.')
    return json.loads(path.read_text())


@app.get('/api/samples/{state}.csv')
def sample_csv(state: str):
    if state not in ['healthy', 'damaged']:
        raise HTTPException(404, 'Choose healthy or damaged.')
    s = scenario_defaults()
    s['damage_enabled'] = state == 'damaged'
    data, _, _ = generate_signals(s)
    out = io.StringIO()
    matrix = np.column_stack([np.arange(data.shape[1])/100, data.T])
    np.savetxt(out, matrix, delimiter=',', fmt='%.7f',
               header='time_s,' + ','.join(f'S{i:02d}' for i in range(1, 13)), comments='')
    return Response(out.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename="bridgescope-synthetic-{state}.csv"'})


@app.post('/api/signals.csv')
def export_signals(scenario: Scenario):
    data, _, _ = generate_signals(scenario.model_dump())
    out = io.StringIO()
    np.savetxt(out, np.column_stack([np.arange(data.shape[1])/100, data.T]), delimiter=',', fmt='%.7f',
               header='time_s,' + ','.join(f'S{i:02d}' for i in range(1, 13)), comments='')
    return Response(out.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': 'attachment; filename="bridgescope-synthetic-100Hz.csv"'})


@app.post('/api/analyze')
async def upload(file: UploadFile = File(...), fs: float = Form(100.0)):
    if not 10 <= fs <= 2000:
        raise HTTPException(422, 'Sampling frequency must be between 10 and 2000 Hz.')
    content = await file.read(10*1024*1024+1)
    if len(content) > 10*1024*1024:
        raise HTTPException(413, 'The demo supports files up to 10 MB.')
    name = file.filename or 'recording'
    ext = Path(name).suffix.lower()
    try:
        if ext == '.npy':
            data = np.load(io.BytesIO(content), allow_pickle=False)
            if data.ndim != 2:
                raise ValueError('NPY data must be a 2-D [channels, samples] array.')
            if data.shape[1] <= 16 and data.shape[0] >= 1024:
                data = data.T
        elif ext == '.csv':
            text = content.decode('utf-8-sig')
            first_line = text.splitlines()[0]
            fields = [s.strip() for s in first_line.split(',')]
            try:
                [float(f) for f in fields]
                header = False
            except ValueError:
                header = True
            raw = np.loadtxt(io.StringIO(text), delimiter=',', skiprows=1 if header else 0, ndmin=2)
            if header and fields[0].lower() in ['time', 'time_s', 'timestamp', 't']:
                time = raw[:, 0]
                if len(time) < 2 or not np.all(np.isfinite(time)) or not np.all(np.diff(time) > 0):
                    raise ValueError('Time values must be finite and strictly increasing.')
                dt = np.diff(time)
                if np.max(np.abs(dt-1/fs)) > 0.02/fs:
                    raise ValueError('Time spacing does not match the supplied sampling rate within 2%. Resample explicitly first.')
                raw = raw[:, 1:]
            data = raw.T
        else:
            raise ValueError('Supported formats are CSV and NPY. MAT/HDF5 adapters are planned, not yet implemented.')
        if not np.issubdtype(data.dtype, np.number) or np.iscomplexobj(data):
            raise ValueError('Acceleration data must contain real numbers.')
        data = np.asarray(data, dtype=float)
        if data.ndim != 2 or not 1 <= data.shape[0] <= 16:
            raise ValueError('Provide 1–16 synchronized acceleration channels in this demo.')
        if not 2048 <= data.shape[1] <= 100000:
            raise ValueError('Provide 2,048–100,000 samples per channel.')
        return analyze_upload(data, fs, name)
    except (ValueError, UnicodeDecodeError, IndexError, OSError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post('/api/validate')
def validate():
    cases = []
    variants = [
        ('Reference', dict(temperature=20, traffic=0, vehicle_mass=8, damage_enabled=False)),
        ('Warm deck', dict(temperature=44, traffic=10, vehicle_mass=8, damage_enabled=False)),
        ('Heavy traffic', dict(temperature=24, traffic=30, vehicle_mass=35, speed=30, damage_enabled=False)),
        ('Cold + loaded', dict(temperature=-8, traffic=24, vehicle_mass=30, speed=40, damage_enabled=False)),
        ('Stiffness loss · Z04', dict(temperature=35, traffic=20, vehicle_mass=20, damage_enabled=True, damage_zone=4, stiffness_loss=0.30)),
        ('Stiffness loss · Z08', dict(temperature=35, traffic=20, vehicle_mass=20, damage_enabled=True, damage_zone=8, stiffness_loss=0.30)),
    ]
    for label, change in variants:
        for seed in [7, 42]:
            s = scenario_defaults()
            s.update(change, seed=seed)
            r = analyze_simulation(s, include_series=False)
            raw_exceeded = sum(abs(m['frequency']-m['reference']) > FREQUENCY_TOLERANCE_HZ for m in r['modes'])
            cases.append(dict(name=label, seed=seed, injected_damage=s['damage_enabled'],
                              injected_zone=s['damage_zone'] if s['damage_enabled'] else None,
                              predicted_zone=r['localization']['zone'],
                              raw_flag=raw_exceeded >= 2, compensated_flag=r['assessment'] == 'review',
                              mean_residual_hz=round(float(np.mean([abs(m['residual_hz']) for m in r['modes']])), 4),
                              mean_mac=r['mean_mac']))
    healthy = [c for c in cases if not c['injected_damage']]
    damaged = [c for c in cases if c['injected_damage']]
    return dict(source='simulation', n=len(cases), healthy_n=len(healthy), damaged_n=len(damaged),
                raw_false_flags=sum(c['raw_flag'] for c in healthy),
                compensated_false_flags=sum(c['compensated_flag'] for c in healthy),
                detected_damage=sum(c['compensated_flag'] for c in damaged),
                top1_localized=sum(c['predicted_zone'] == c['injected_zone'] for c in damaged),
                cases=cases,
                note='Synthetic smoke test only: six configured scenarios × two seeds, with the same forward/inverse surrogate. Not an independent benchmark, field false-alarm rate, or calibrated confidence evaluation.')


@app.get('/api/fe-spec')
def fe_spec():
    return FileResponse(ROOT/'docs'/'FE_HANDOFF.md', media_type='text/markdown', filename='BridgeScope-FE-handoff.md')


@app.get('/api/research')
def research():
    return FileResponse(ROOT/'docs'/'RESEARCH.md', media_type='text/markdown', filename='BridgeScope-research-notes.md')
