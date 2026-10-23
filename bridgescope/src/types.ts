export type Scenario = {
  temperature: number; traffic: number; vehicle_mass: number; speed: number;
  damage_enabled: boolean; damage_zone: number; stiffness_loss: number; seed: number;
};
export type ModalResult = {
  mode: number; frequency: number; expected: number; reference: number;
  residual_hz: number; raw_shift_pct: number; compensated_shift_pct: number;
  mac: number; damping: number | null; observed_shape: number[]; expected_shape: number[];
};
export type Quality = { channels: number; valid_channels: number; samples: number; finite_fraction: number; rms: number; flat_channels: number };
export type Spectrum = { frequency: number[]; db: number[] };
export type Signals = { time: number[]; channels: number[][] };
export type Analysis = {
  id: string; timestamp: string; source: 'simulation'; scenario: Scenario; engine: string;
  source_note: string; assessment: 'review' | 'baseline'; evidence: string; probability: null;
  confidence_note: string; modes: ModalResult[]; matched_modes: number; quality: Quality;
  fs: number; duration_s: number; tolerance_hz: number; mean_mac: number;
  modes_exceeding_tolerance: number; environmental_shift_pct: number; environment_supported: boolean;
  localization: {zone: number | null; loss: number | null; plausible_loss_range: number[] | null;
    ranking: {zone: number; score: number; cost?: number}[]; ambiguity: string; method: string; best_cost?: number};
  explanations: string[]; limitations: string[]; signals: Signals; spectrum: Spectrum;
  sensors: {id: string; x: number; y: number; z: number; zone: number; orientation: string; rms: number}[];
  timeline: {x: number; time: string; observed: number; expected: number; compensated: number; reference: number; temperature: number}[];
};
export type UploadAnalysis = {filename: string; source: string; assessment: string; quality: Quality;
  fs: number; duration_s: number; candidates: {frequency: number; power: number}[];
  resolution_hz: number; signals: Signals; spectrum: Spectrum; note: string};
export type Run = {id: string; timestamp: string; assessment: string; source: string; scenario: Scenario; evidence: string};
export type Validation = {source: string; n: number; healthy_n: number; damaged_n: number;
  raw_false_flags: number; compensated_false_flags: number; detected_damage: number; top1_localized: number;
  note: string; cases: {name: string; seed: number; injected_damage: boolean; injected_zone: number | null;
    predicted_zone: number | null; raw_flag: boolean; compensated_flag: boolean; mean_residual_hz: number; mean_mac: number}[]};
