import type { WeaponId } from './catalog';
export class AudioEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  volume = .45;
  unlock(): void {
    this.ctx ??= new AudioContext();
    if (!this.master) {
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * .6, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    this.master.gain.value = this.volume; void this.ctx.resume();
  }
  private tone(freq: number, end: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), volume = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    volume.gain.setValueAtTime(gain, t); volume.gain.exponentialRampToValueAtTime(.001, t + duration);
    osc.connect(volume); volume.connect(this.master); osc.start(t); osc.stop(t + duration);
  }
  private burst(duration: number, gain: number, frequency: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay, src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), volume = this.ctx.createGain();
    src.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, t); volume.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(filter); filter.connect(volume); volume.connect(this.master); src.start(t); src.stop(t + duration);
  }
  shot(weapon: WeaponId, distant = false): void {
    const v = distant ? .12 : .5;
    this.burst(weapon === 'marshal' ? .32 : .14, v, weapon === 'ghost' ? 2200 : 6000);
    this.tone(weapon === 'marshal' ? 130 : 170, 35, .15, v * .7, 'triangle');
    if (!distant) this.burst(.05, v * .2, 1200, .1);
  }
  hit(head = false): void { this.tone(head ? 1700 : 1000, head ? 2400 : 600, .07, .15, 'triangle'); }
  kill(): void { [440, 660, 880].forEach((f, i) => this.tone(f, f * .9, .15, .09, 'sine', i * .07)); }
  reload(): void { this.burst(.08, .25, 2500); this.burst(.09, .23, 3200, .55); this.burst(.1, .28, 4500, 1.2); }
  equip(): void { this.burst(.12, .18, 1800); this.tone(200, 400, .08, .05, 'triangle'); }
  footstep(): void { this.burst(.08, .11, 550); this.tone(75, 30, .08, .05, 'sine'); }
  damage(): void { this.burst(.18, .25, 500); this.tone(100, 40, .2, .2); }
  click(): void { this.tone(600, 1000, .05, .06, 'triangle'); }
  updateVolume(volume: number): void { this.volume = volume; if (this.master) this.master.gain.value = volume; }
}
