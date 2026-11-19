(() => {
  const notes = [60,62,64,65,67,69,71,72];

  function detectFrequency(samples, rate, time) {
    const stride = 4;
    const size = Math.floor(.05 * rate / stride);
    const center = Math.floor(time * rate);
    const start = center - Math.floor(size / 2) * stride;
    if (start < 0 || start + size * stride > samples.length) return null;

    const signal = new Float32Array(size);
    for (let i = 0; i < size; i++) signal[i] = samples[start + i * stride];
    const mean = signal.reduce((sum,value) => sum + value,0) / size;
    let energy = 0;
    for (let i = 0; i < size; i++) {
      signal[i] -= mean;
      energy += signal[i] ** 2;
    }
    if (Math.sqrt(energy / size) < .008) return null;

    const reducedRate = rate / stride;
    const low = Math.max(2,Math.floor(reducedRate / 1000));
    const high = Math.min(Math.floor(size / 2),Math.ceil(reducedRate / 75));
    const correlations = new Float32Array(high + 1);
    for (let lag = low; lag <= high; lag++) {
      let xy = 0, xx = 0, yy = 0;
      for (let i = 0; i < size - lag; i++) {
        const x = signal[i], y = signal[i + lag];
        xy += x * y;
        xx += x * x;
        yy += y * y;
      }
      correlations[lag] = xy / Math.sqrt(xx * yy);
    }
    let best = 0;
    for (let lag = low + 1; lag < high; lag++) {
      if (correlations[lag] >= correlations[lag - 1] && correlations[lag] >= correlations[lag + 1]) {
        best = Math.max(best,correlations[lag]);
      }
    }
    if (best < .77) return null;
    for (let lag = low + 1; lag < high; lag++) {
      const [left,peak,right] = correlations.subarray(lag - 1,lag + 2);
      if (peak < best * .91 || peak < left || peak < right) continue;
      const curvature = left - 2 * peak + right;
      const shift = curvature ? .5 * (left - right) / curvature : 0;
      return reducedRate / (lag + shift);
    }
    return null;
  }

  function detectPitch(samples, rate, time) {
    const frequency = detectFrequency(samples,rate,time);
    if (!frequency) return null;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const wrapped = 60 + ((midi - 60) % 12 + 12) % 12;
    let closest = 0;
    for (let i = 1; i < notes.length; i++) {
      if (Math.abs(wrapped - notes[i]) < Math.abs(wrapped - notes[closest])) closest = i;
    }
    return closest;
  }

  function quantizeTake(samples, rate, bpm, beatCount, detector = detectPitch) {
    const result = [];
    const beatSeconds = 60 / bpm;
    for (let beat = 0; beat < beatCount; beat++) {
      const votes = new Map();
      for (const fraction of [.18,.34,.5,.66,.82]) {
        const pitch = detector(samples,rate,(beat + fraction) * beatSeconds);
        if (pitch !== null) votes.set(pitch,(votes.get(pitch) || 0) + 1);
      }
      const top = [...votes].sort((a,b) => b[1] - a[1])[0];
      if (!top || top[1] < 2) continue;
      const [pitch] = top;
      const last = result.at(-1);
      if (last?.pitch === pitch && last.start + last.length === beat && beat % 4 !== 0) last.length++;
      else result.push({pitch,start:beat,length:1});
    }
    return result;
  }

  function encodeWav(samples, rate) {
    const data = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(data);
    const text = (offset,value) => [...value].forEach((char,i) => view.setUint8(offset + i,char.charCodeAt(0)));
    text(0,'RIFF');
    view.setUint32(4,data.byteLength - 8,true);
    text(8,'WAVE');
    text(12,'fmt ');
    view.setUint32(16,16,true);
    view.setUint16(20,1,true);
    view.setUint16(22,1,true);
    view.setUint32(24,rate,true);
    view.setUint32(28,rate * 2,true);
    view.setUint16(32,2,true);
    view.setUint16(34,16,true);
    text(36,'data');
    view.setUint32(40,samples.length * 2,true);
    samples.forEach((sample,i) => {
      const clipped = Math.max(-1,Math.min(1,sample));
      view.setInt16(44 + i * 2,Math.round(clipped * (clipped < 0 ? 32768 : 32767)),true);
    });
    return data;
  }

  function tuneVoice(samples, rate, mode) {
    const hop = Math.round(rate * .04);
    const frames = Array.from({length:Math.ceil(samples.length / hop)}, (_,index) =>
      detectFrequency(samples,rate,(index + .5) * hop / rate));
    const result = samples.slice();
    const corrected = new Float32Array(samples.length);
    const weights = new Float32Array(samples.length);
    const frequencyAt = sample => frames[Math.min(frames.length - 1,Math.floor(sample / hop))];
    const targetFrequency = frequency => {
      const semitone = 69 + 12 * Math.log2(frequency / 440);
      let target = Math.round(semitone);
      if (mode === 'major') {
        const allowed = [0,2,4,5,7,9,11];
        target = [target,target - 1,target + 1,target - 2,target + 2]
          .filter(note => allowed.includes((note % 12 + 12) % 12))
          .sort((a,b) => Math.abs(a-semitone) - Math.abs(b-semitone))[0];
      }
      return 440 * 2 ** ((target - 69) / 12);
    };
    for (let index = 0; index < frames.length;) {
      if (!frames[index]) { index++; continue; }
      const first = index;
      while (index < frames.length && frames[index]) index++;
      const start = first * hop;
      const end = Math.min(samples.length,index * hop);
      if (end - start < hop * 2) continue;
      const pulses = [];
      for (let pos = start; pos < end;) {
        const period = rate / frequencyAt(pos);
        const expected = Math.min(end - 1,Math.round(pos));
        let peak = expected;
        const radius = Math.round(period * .18);
        for (let probe = Math.max(start,expected-radius); probe <= Math.min(end-1,expected+radius); probe++) {
          if (samples[probe] > samples[peak]) peak = probe;
        }
        pulses.push(peak);
        pos = peak + period;
      }
      let sourceIndex = 0;
      for (let pos = pulses[0]; pos < end;) {
        while (sourceIndex+1 < pulses.length &&
               Math.abs(pulses[sourceIndex+1]-pos) < Math.abs(pulses[sourceIndex]-pos)) sourceIndex++;
        const center = pulses[sourceIndex];
        const period = rate / frequencyAt(center);
        const outputPeriod = rate / targetFrequency(frequencyAt(pos));
        const radius = Math.round(Math.max(period,outputPeriod));
        const destination = Math.round(pos);
        for (let offset = -radius; offset <= radius; offset++) {
          const from = center + offset, to = destination + offset;
          if (from < start || from >= end || to < start || to >= end) continue;
          const window = .5 + .5 * Math.cos(Math.PI * offset / radius);
          corrected[to] += samples[from] * window;
          weights[to] += window;
        }
        pos += outputPeriod;
      }
      for (let i = start; i < end; i++) {
        if (weights[i] < .02) continue;
        const mix = Math.min(1,(i-start)/(rate*.015),(end-1-i)/(rate*.015));
        result[i] += (corrected[i]/weights[i] - result[i]) * mix;
      }
    }
    return result;
  }

  function detectHits(samples,rate,bpm,beats,step) {
    const notes = [];
    const window = Math.round(rate * .01);
    const beatSeconds = 60 / bpm;
    let baseline = .01;
    let lastHit = -1;
    for (let start = 0; start + window <= samples.length; start += window) {
      let energy = 0;
      for (let i = start; i < start + window; i++) energy += samples[i] ** 2;
      const rms = Math.sqrt(energy / window);
      const time = start / rate;
      if (rms > Math.max(.024,baseline * 2.5) && time - lastHit > .075) {
        const beat = Math.round(time / beatSeconds / step) * step;
        if (beat < beats && notes.at(-1)?.start !== beat) notes.push({pitch:0,start:beat,length:step});
        lastHit = time;
      }
      baseline = .78 * baseline + .22 * rms;
    }
    return notes;
  }

  const percussion = {
    Kick: [36,60,.22,.03],
    Snare: [39,174,.15,.76],
    'Closed hi-hat': [43,0,.075,1],
    'Open hi-hat': [47,0,.29,1],
    'Low tom': [42,112,.26,.16],
    Clap: [40,0,.14,1],
    'Crash cymbal': [50,0,.62,1],
    Cowbell: [57,540,.18,.025]
  };

  function percussionBuffer(context,name,pitch,duration) {
    const [,base,tail,noiseMix] = percussion[name];
    const rate = context.sampleRate;
    const length = Math.max(2,Math.floor(Math.min(tail,duration) * rate));
    const buffer = context.createBuffer(1,length,rate);
    const data = buffer.getChannelData(0);
    const frequency = base * (1 + pitch * .04);
    let phase = 0, previous = 0, seed = 1237;
    for (let i = 0; i < length; i++) {
      const time = i / rate;
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const bright = name.includes('hat') || name === 'Crash cymbal';
      const texture = bright ? (noise - previous) * .55 : noise;
      previous = noise;
      phase += 2 * Math.PI * frequency * (1 + (name === 'Cowbell' ? 0 : .9) * Math.exp(-time * 45)) / rate;
      const tone = name === 'Cowbell' ? .6 * Math.sin(phase) + .4 * Math.sin(phase * 1.48) : Math.sin(phase);
      const claps = name === 'Clap' ? .55 + .45 * Math.cos(time * 2 * Math.PI * 95) : 1;
      const edge = Math.min(1,i / 12,(length - 1 - i) / Math.max(12,rate*.006));
      data[i] = edge * Math.exp(-time * 4 / tail) * ((1-noiseMix)*tone + noiseMix*texture*claps);
    }
    return buffer;
  }

  window.CGAudio = { detectPitch, quantizeTake, encodeWav, tuneVoice, detectHits, percussion, percussionBuffer };
})();
