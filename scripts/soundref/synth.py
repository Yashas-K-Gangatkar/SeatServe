#!/usr/bin/env python3
"""Synthesize the NotiFetch UI cue set — clean, license-free recreations of the
reference video's sound palette (Ramp ad breakdown fingerprints).
Each cue = numpy DSP recipe -> 44.1k mono WAV, -3dBFS. Prints spectral check.
"""
import wave, os
import numpy as np

SR = 44100
OUT = '/home/z/my-project/download/sound-previews'
rng = np.random.default_rng(7)

def t_axis(dur): return np.arange(int(dur * SR)) / SR

def env_ad(n, a_s, d_s, curve=4.0):
    """attack-decay envelope, exponential-ish decay"""
    t = np.arange(n) / SR
    a = np.clip(t / max(a_s, 1e-4), 0, 1)
    d = np.exp(-curve * np.clip(t - a_s, 0, None) / max(d_s, 1e-4))
    return (a * d).astype(np.float32)

def lp(x, fc):
    a = np.exp(-2 * np.pi * np.array(fc) / SR) if np.ndim(fc) else np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); z = 0.0
    for i in range(len(x)):
        z = (1 - a) * x[i] + a * z if np.ndim(a) else (1 - a) * x[i] + a * z
        y[i] = z
    return y

def bp_fft(x, lo, hi, order=2.0):
    X = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1.0)
    g = 1 / (1 + (f / max(lo, 1)) ** (2 * order)) * 1 / (1 + (max(hi, 2) / f) ** (2 * order))
    return np.fft.irfft(X * g, len(x)).astype(np.float32)

def hp_fft(x, lo, order=2.0): return bp_fft(x, lo, SR / 2)
def lp_fft(x, hi, order=2.0): return bp_fft(x, 0, hi, order)

def norm(x, db=-3.0):
    p = np.abs(x).max() + 1e-9
    return (x / p) * 10 ** (db / 20)

def save(name, x):
    y = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    w = wave.open(f'{OUT}/{name}.wav', 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(y.tobytes()); w.close()

def spec_check(name, x):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / SR)
    top = [round(float(f[j])) for j in np.argsort(X)[-6:][::-1] if f[j] > 30][:4]
    dur = len(x) / SR
    print(f"  {name:14s} {dur*1000:5.0f}ms  top={top}")

# ---------------- cue recipes ----------------

def ping():
    """notification ding — 775Hz body + 4.9kHz sparkle, 220ms"""
    t = t_axis(0.30)
    body = np.sin(2 * np.pi * (775 - 55 * t / 0.3) * t)          # slight downward bend
    spark = 0.55 * np.sin(2 * np.pi * 4910 * t) * np.exp(-t / 0.045)
    harm = 0.3 * np.sin(2 * np.pi * 1550 * t) * np.exp(-t / 0.09)
    e = env_ad(len(t), 0.002, 0.22, 5.0)
    return norm((body + spark + harm) * e)

def ping_stack(n=6):
    """chaos: 6 pings, pitch rising, tightening gaps"""
    dur = 1.15; out = np.zeros(int(dur * SR), dtype=np.float32)
    gaps = np.linspace(0.24, 0.11, n)
    t0 = 0.0
    for k in range(n):
        p = ping()
        shift = 2 ** (k * 2 / 12)  # +2 semitones per ping
        X = np.fft.rfft(p); f = np.fft.rfftfreq(len(p), 1 / SR)
        f[0] = 1
        p = np.fft.irfft(X * (1 + (shift - 1) * np.clip(f / 800, 0, 1.2)), len(p))
        i = int(t0 * SR); out[i:i + len(p)] += p[:max(0, len(out) - i)][:len(p)]
        t0 += gaps[k]
    return norm(out)

def swoosh():
    """short low whoosh — noise, band sweep 2.8k -> 350Hz, 380ms"""
    dur = 0.38; n = int(dur * SR)
    noise = rng.standard_normal(n).astype(np.float32)
    x = bp_fft(noise, 180, 3400)
    # downward spectral tilt over time via crossfaded lps
    y = np.empty(n, dtype=np.float32); z = 0.0
    for i in range(n):
        fc = 3000 * np.exp(-4.5 * i / n) + 220
        aa = np.exp(-2 * np.pi * fc / SR)
        z = (1 - aa) * x[i] + aa * z
        y[i] = z
    e = np.sin(np.pi * np.arange(n) / n) ** 1.5   # bell
    return norm(y * e)

def swipe():
    """card swipe — 130ms air burst + soft body"""
    dur = 0.22; n = int(dur * SR)
    air = hp_fft(rng.standard_normal(n).astype(np.float32), 1400)
    e_air = env_ad(n, 0.004, 0.09, 7)
    t = t_axis(dur)
    body = 0.4 * np.sin(2 * np.pi * (210 - 60 * t / dur) * t) * env_ad(n, 0.003, 0.13, 6)
    return norm(air * e_air + body)

def success_ticks():
    """captured -> coded -> synced: 3 ascending ticks"""
    out = np.zeros(int(0.62 * SR), dtype=np.float32)
    for k, f0 in enumerate((880, 1320, 1760)):
        dur = 0.12; t = t_axis(dur)
        tick = (np.sin(2 * np.pi * f0 * t) + 0.4 * np.sin(2 * np.pi * f0 * 2.7 * t) * np.exp(-t / 0.02)) \
               * env_ad(len(t), 0.002, 0.07, 6)
        i = int(k * 0.15 * SR)
        out[i:i + len(tick)] += tick
    # tiny glitter at the end
    t = t_axis(0.12)
    glint = 0.25 * np.sin(2 * np.pi * 5200 * t) * np.exp(-t / 0.03)
    out[int(0.46 * SR):int(0.46 * SR) + len(glint)] += glint
    return norm(out)

def glass_tap():
    """UI tap — glass: 2.1k + 4.7k inharmonic, 170ms ring"""
    t = t_axis(0.20)
    x = np.sin(2 * np.pi * 2100 * t) + 0.5 * np.sin(2 * np.pi * 4704 * t) \
        + 0.25 * np.sin(2 * np.pi * 6900 * t) * np.exp(-t / 0.03)
    return norm(x * env_ad(len(t), 0.001, 0.11, 5.5))

def knock():
    """Slack-style double knock — damped 170Hz wood"""
    out = np.zeros(int(0.42 * SR), dtype=np.float32)
    for k, t0 in enumerate((0.0, 0.16)):
        dur = 0.18; t = t_axis(dur)
        f0 = 172 if k == 0 else 158
        hit = (np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * f0 * 2.4 * t)) \
              * env_ad(len(t), 0.001, 0.06, 7)
        hit += 0.2 * bp_fft(rng.standard_normal(len(t)).astype(np.float32), 500, 2500) \
               * env_ad(len(t), 0.001, 0.02, 8)
        i = int(t0 * SR); out[i:i + len(hit)] += hit
    return norm(out)

def shutter():
    """photo of the receipt — dual click + air"""
    out = np.zeros(int(0.20 * SR), dtype=np.float32)
    for k, (t0, f0) in enumerate(((0.0, 5000), (0.030, 3200))):
        dur = 0.03; t = t_axis(dur)
        click = np.sin(2 * np.pi * f0 * t) * env_ad(len(t), 0.0005, 0.012, 9)
        i = int(t0 * SR); out[i:i + len(click)] += click
    n = len(out)
    air = hp_fft(rng.standard_normal(n).astype(np.float32), 2500) * env_ad(n, 0.001, 0.05, 8) * 0.5
    return norm(out + air)

def paper():
    """heavy paper — fluttered broadband burst, 300ms"""
    dur = 0.30; n = int(dur * SR)
    x = bp_fft(rng.standard_normal(n).astype(np.float32), 260, 3400)
    flutter = 0.55 + 0.45 * np.sin(2 * np.pi * 52 * t_axis(dur)) * np.sin(2 * np.pi * 13 * t_axis(dur))
    e = env_ad(n, 0.006, 0.24, 4)
    return norm(x * flutter * e)

def boom():
    """receipt slam / problem accent — 120->42Hz drop + transient"""
    dur = 0.5; t = t_axis(dur)
    f = 120 * np.exp(-t * 5.5) + 40
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_ad(len(t), 0.002, 0.32, 4)
    thump = 0.6 * bp_fft(rng.standard_normal(len(t)).astype(np.float32), 60, 900) \
            * env_ad(len(t), 0.001, 0.05, 8)
    return norm(body + thump)

def riser_resolve():
    """outro sting — 550ms riser into boom = 'the resolve'"""
    dur = 0.95; n = int(dur * SR)
    noise = rng.standard_normal(n).astype(np.float32)
    y = np.empty(n, dtype=np.float32); z = 0.0
    for i in range(n):
        fc = 300 + 3300 * (i / n) ** 2.2
        aa = np.exp(-2 * np.pi * fc / SR)
        z = (1 - aa) * noise[i] + aa * z
        y[i] = z
    e = (np.arange(n) / n) ** 1.6
    rise = y * e
    b = boom()
    total = int(1.2 * SR)
    out = np.zeros(total, dtype=np.float32)
    out[:n] += rise
    i = int(0.55 * SR)
    out[i:i + len(b)] += b * 0.9
    return norm(out)

def toggle():
    """sound on/off — soft glass tap + micro sweep"""
    g = glass_tap() * 0.8
    s = swoosh()[:len(g)]
    return norm(g + 0.35 * s)

# ---------------- main ----------------

CUES = [
    ('ping', ping), ('ping-stack', ping_stack), ('swoosh', swoosh),
    ('swipe', swipe), ('success-ticks', success_ticks), ('tap-glass', glass_tap),
    ('knock', knock), ('shutter', shutter), ('paper', paper),
    ('boom', boom), ('resolve-riser', riser_resolve), ('toggle', toggle),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    rendered = []
    print('synthesized cues:')
    for name, fn in CUES:
        x = fn()
        save(name, x)
        spec_check(name, x)
        rendered.append((name, x))
    # combined preview: each cue x2, 0.7s gaps
    gap = np.zeros(int(0.7 * SR), dtype=np.float32)
    parts = []
    for name, x in rendered:
        parts += [gap[:int(0.25 * SR)], x, gap]
    demo = np.concatenate(parts)
    save('preview-all', demo)
    print(f"preview-all.wav {len(demo)/SR:.1f}s")
    # mp3 if encoder available
    os.system(f"ffmpeg -nostdin -y -v error -i {OUT}/preview-all.wav -b:a 96k {OUT}/preview-all.mp3")
    os.system(f"ffmpeg -nostdin -y -v error -i {OUT}/ping.wav -i {OUT}/swoosh.wav -i {OUT}/success-ticks.wav -filter_complex '[0][1][2]concat=n=3:v=0:a=1' -b:a 96k {OUT}/preview-core.mp3")
    print('done ->', OUT)

if __name__ == '__main__':
    main()
