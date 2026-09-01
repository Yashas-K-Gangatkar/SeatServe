#!/usr/bin/env python3
"""Slice candidate SFX moments from reference audio + build one contact sheet
(waveform + log-spectrogram per slice) for visual verification."""
import wave
import numpy as np

SR = 44100
SRC = '/home/z/my-project/scripts/soundref/audio-full.wav'
OUT = '/home/z/my-project/scripts/soundref/slices'

CUTS = [
    ('ping-1',      19.95, 0.9),
    ('ping-stack',  20.10, 3.4),
    ('glass',        8.30, 0.9),
    ('paper',        9.70, 0.6),
    ('boom-receipt',27.60, 1.2),
    ('whoosh-a',    30.20, 1.0),
    ('bright-tick', 31.25, 0.8),
    ('shimmer',     31.55, 0.7),
    ('whoosh-b',    33.70, 0.9),
    ('knock',       35.95, 1.0),
    ('swipe',       59.35, 1.1),
    ('sync-ticks',  64.20, 2.6),
    ('outro-logo',  69.70, 1.3),
]

def load(path):
    w = wave.open(path, 'rb')
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    w.close()
    return x

def save(path, x):
    y = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    w = wave.open(path, 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(y.tobytes()); w.close()

def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    x = load(SRC)
    for name, t0, d in CUTS:
        a = int(t0 * SR); b = min(int((t0 + d) * SR), len(x))
        save(f'{OUT}/{name}.wav', x[a:b])
    # contact sheet
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.font_manager as fm
    try: fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    except Exception: pass
    n = len(CUTS)
    fig, axes = plt.subplots(n, 2, figsize=(11, 2.0 * n), constrained_layout=True)
    for row, (name, t0, d) in enumerate(CUTS):
        a = int(t0 * SR); b = int((t0 + d) * SR)
        seg = x[a:min(b, len(x))]
        tt = np.arange(len(seg)) / SR
        ax = axes[row][0]
        ax.plot(tt, seg, lw=0.4, color='#334155')
        ax.set_title(name, fontsize=8, loc='left')
        ax.set_ylim(-1, 1); ax.tick_params(labelsize=6)
        ax2 = axes[row][1]
        # spectrogram
        from numpy.lib.stride_tricks import sliding_window_view
        W = 1024; H = 256
        if len(seg) < W: seg = np.pad(seg, (0, W - len(seg)))
        fr = 1 + (len(seg) - W) // H
        win = np.hanning(W)
        S = np.array([np.abs(np.fft.rfft(seg[i*H:i*H+W] * win)) for i in range(fr)])
        db = 20 * np.log10(S.T + 1e-6)
        im = ax2.imshow(db, origin='lower', aspect='auto', cmap='magma',
                        extent=[0, len(seg)/SR, 0, SR/2/1000])
        ax2.set_ylim(0, 12)  # 0-12 kHz view
        ax2.tick_params(labelsize=6)
        ax2.set_ylabel('kHz', fontsize=6)
    fig.suptitle('SFX candidate slices — reference video', fontsize=10)
    fig.savefig('/home/z/my-project/scripts/soundref/contact-sheet.png', dpi=100)
    print('sliced', n, 'clips + contact-sheet.png')

if __name__ == '__main__':
    main()
