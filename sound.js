// Small, locally generated notes: no audio files, network requests or autoplay.
export class TurtleSounds {
  constructor({ enabled = true, volume = 20 } = {}) {
    this.enabled = enabled;
    this.volume = volume;
    this.context = null;
    this.master = null;
    this.voices = new Set();
    this.playing = false;
    this.continuous = true;
    this.noteIndex = 0;
    this.nextBeat = 0;
    this.inStroke = false;
  }

  configure({ enabled, volume }) {
    this.enabled = enabled;
    this.volume = volume;
    if (this.master) this.master.gain.setTargetAtTime(volume / 100 * .25, this.context.currentTime, .02);
    if (!enabled || volume === 0) this.quiet();
  }

  start({ continuous = true } = {}) {
    this.playing = true;
    this.continuous = continuous;
    this.noteIndex = 0;
    this.nextBeat = 0;
    this.inStroke = true;
    if (!this.enabled || this.volume === 0 || document.hidden) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!this.context) {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume / 100 * .25;
        this.master.connect(this.context.destination);
      }
      // Call resume in the original click/touch gesture, including on iPad.
      this.context.resume().then(() => {
        if (this.playing && this.continuous && this.inStroke) this.move();
      }).catch(() => {});
    } catch {
      // Audio support or permission must never block the learning activity.
      this.context = null;
      this.master = null;
    }
  }

  available() {
    return this.enabled && this.volume > 0 && !document.hidden && this.context?.state === 'running';
  }

  tone(frequency, when = this.context?.currentTime, duration = .22) {
    if (!this.available()) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(.25, when + .018);
    envelope.gain.exponentialRampToValueAtTime(.001, when + duration);
    envelope.gain.linearRampToValueAtTime(0, when + duration + .025);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    const voice = { oscillator, envelope };
    this.voices.add(voice);
    oscillator.onended = () => {
      oscillator.disconnect(); envelope.disconnect(); this.voices.delete(voice);
    };
    oscillator.start(when);
    oscillator.stop(when + duration + .03);
  }

  step() {
    if (!this.playing || !this.available()) return;
    const notes = [523.25, 659.25, 783.99, 659.25];
    this.tone(notes[this.noteIndex++ % notes.length]);
  }

  move() {
    this.inStroke = true;
    if (!this.playing || !this.continuous || !this.available()) return;
    // Audio time prevents rapid-fire notes after a delayed animation frame.
    if (this.context.currentTime < this.nextBeat) return;
    this.step();
    this.nextBeat = this.context.currentTime + .5;
  }

  quiet() {
    this.inStroke = false;
    if (this.context) {
      const now = this.context.currentTime;
      for (const { oscillator, envelope } of this.voices) {
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setTargetAtTime(0, now, .008);
        oscillator.stop(now + .04);
      }
    }
    this.nextBeat = 0;
  }

  stop() {
    this.playing = false;
    this.quiet();
  }

  finish() {
    this.stop();
    if (!this.available()) return;
    const now = this.context.currentTime + .05;
    [523.25, 659.25, 783.99].forEach((note, i) => this.tone(note, now + i * .15));
  }
}
