/**
 * Alarm sound utility using Web Audio API.
 * Generates and plays a loud, attention-grabbing alarm tone.
 * Works on all modern browsers without requiring external files.
 */

let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('Web Audio API not supported in this browser');
            return null;
        }
        audioContext = new AudioContext();
    }
    return audioContext;
};

/**
 * Play a loud alarm beep pattern (good for grabbing attention).
 * Pattern: 3 short beeps with silence between.
 */
export const playAlarmSound = () => {
    try {
        const ctx = getAudioContext();
        if (!ctx) {
            console.warn('Cannot play alarm: Web Audio API unavailable');
            // Fallback to browser alert if audio fails
            try {
                const beep = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA=');
                beep.volume = 1.0;
                beep.play().catch(() => {});
            } catch (e) {}
            return;
        }

        const now = ctx.currentTime;
        const beepDuration = 0.15;
        const silenceDuration = 0.1;
        const frequency = 880;
        const gainValue = 0.6;

        // Beep pattern: 3 short, loud beeps
        const beepTimes = [
            now,
            now + beepDuration + silenceDuration,
            now + (beepDuration + silenceDuration) * 2,
        ];

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = frequency;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0, now);

        beepTimes.forEach((time, idx) => {
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(gainValue, time + 0.01);
            gain.gain.setValueAtTime(gainValue, time + beepDuration - 0.01);
            gain.gain.linearRampToValueAtTime(0, time + beepDuration);
        });

        osc.start(now);
        osc.stop(now + beepDuration * 3 + silenceDuration * 2);
    } catch (err) {
        console.error('Error playing alarm sound:', err);
    }
};

/**
 * Play a continuous alarm tone (louder, persistent for critical alerts).
 * @param {number} durationMs Duration in milliseconds (default 2000ms)
 */
export const playCriticalAlarmSound = (durationMs = 2000) => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const duration = durationMs / 1000;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.linearRampToValueAtTime(800, now + duration * 0.5);
        osc.frequency.linearRampToValueAtTime(1000, now + duration);
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.7, now);
        gain.gain.setValueAtTime(0.7, now + duration - 0.05);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.start(now);
        osc.stop(now + duration);
    } catch (err) {
        console.error('Error playing critical alarm:', err);
    }
};
