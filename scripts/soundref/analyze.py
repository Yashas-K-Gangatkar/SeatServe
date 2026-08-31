#!/usr/bin/env python3
"""Analyze reference video audio: onsets, spectral fingerprints, timeline map.
Zero-dependency beyond numpy: reads WAV via wave module, STFT via numpy FFT.
Outputs: event table (t, strength, centroid, top-freqs, decay) + timeline.png
"""
import wave, sys, json
import numpy as np

SR = 44100
W = 2048          # stft window
H = 512           # hop

def load(path):
    w = wave.open(path, 'rb')
    n = w.getnframes()
    raw = w.readframes(n)
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    w.close()
    return x

def stft_mag(x):
    frames = 1 + (len(x) - W) // H
    win = np.hanning(W).astype(np.float32)
    out = np.empty((frames, W // 2), dtype=np.float32)
    for i in range(frames):
        seg = x[i * H:i * H + W] * win
        out[i] = np.abs(np.fft.rfft(seg)[:W // 2])
    return out

def main():
    x = load('/home/z/my-project/scripts/soundref/audio-full.wav')
    dur = len(x) / SR
    M = stft_mag(x)
    # spectral flux onset envelope
    diff = np.diff(M, axis=0)
    flux = np.maximum(diff, 0).sum(axis=1)
    # normalize
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    # peak pick
    order = int(0.06 * SR / H)  # ~60ms min gap
    thr = 1.2
    onsets = []
    for i in range(2, len(flux) - 2):
        if flux[i] > thr and flux[i] == flux[i - order:i + order].max():
            onsets.append(i)
    # merge close onsets keeping strongest
    merged = []
    for i in onsets:
        if merged and (i - merged[-1]) < order:
            if flux[i] > flux[merged[-1]]:
                merged[-1] = i
        else:
            merged.append(i)
    freqs = np.fft.rfftfreq(W, 1 / SR)[:W // 2]
    events = []
    for i in merged:
        t = i * H / SR
        seg = x[int(t * SR):int(t * SR) + SR]  # 1s tail
        if len(seg) < SR // 2:
            continue
        # pre-onset 150ms vs post 80ms energy ratio (transientness)
        pre = x[max(0, int(t * SR) - int(0.15 * SR)):int(t * SR)]
        post = x[int(t * SR):int(t * SR) + int(0.08 * SR)]
        e_pre = np.sqrt((pre ** 2).mean() + 1e-12)
        e_post = np.sqrt((post ** 2).mean() + 1e-12)
        mag = M[i]
        top = np.argsort(mag)[-5:][::-1]
        tf = [round(float(freqs[j]), 0) for j in top if freqs[j] > 40][:4]
        cent = float((mag * freqs).sum() / (mag.sum() + 1e-9))
        # decay: time for envelope to fall to 25% of post energy (ms)
        env = np.sqrt(np.convolve(seg ** 2, np.ones(441) / 441, 'same') + 1e-12)
        peak = env[:int(0.1 * SR)].max()
        fall = np.where(env < peak * 0.25)[0]
        decay_ms = int(fall[0] / SR * 1000) if len(fall) else 999
        events.append(dict(t=round(t, 2), flux=round(float(flux[i]), 1),
                           tr=round(float(e_post / (e_pre + 1e-9)), 1),
                           cent=round(cent), top=tf, decay=decay_ms))
    # rank by transient ratio * flux
    events.sort(key=lambda e: -(e['flux'] * min(e['tr'], 20)))
    print(f"dur={dur:.1f}s onsets={len(events)}")
    print("t     flux  trans  cent  top-freqs              decay")
    for e in events[:45]:
        print(f"{e['t']:6.2f} {e['flux']:5.1f} {e['tr']:5.1f} {e['cent']:6.0f}  {str(e['top']):22} {e['decay']}ms")
    json.dump(events, open('/home/z/my-project/scripts/soundref/events.json', 'w'), indent=1)

    # ---- timeline png ----
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.font_manager as fm
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        try: fm.fontManager.addfont(f)
        except Exception: pass
    fig, ax = plt.subplots(figsize=(16, 5), constrained_layout=True)
    t_axis = np.arange(len(x)) / SR
    ds = 440  # downsample for plot
    ax.plot(t_axis[::ds], x[::ds], lw=0.3, color='#555')
    et = [e['t'] for e in events]
    ev = [min(e['flux'], 6) for e in events]
    ax.scatter(et, [-0.9 - 0.05 * min(v, 4) for v in ev], s=12, c='#c2410c', zorder=3)
    for t0, label in [(0, 'intro/foley'), (26, 'chaos list'), (52, 'resolve'), (70, 'outro')]:
        ax.axvline(t0, color='#2563eb', ls='--', lw=0.8, alpha=0.6)
        ax.text(t0 + 0.3, 1.02, label, fontsize=8, color='#2563eb')
    ax.set_xlim(0, dur); ax.set_ylim(-1.25, 1.15)
    ax.set_xlabel('time (s)'); ax.set_title('Reference audio: waveform + onsets (orange)')
    fig.savefig('/home/z/my-project/scripts/soundref/timeline.png', dpi=110)
    print('timeline.png written')

if __name__ == '__main__':
    main()
