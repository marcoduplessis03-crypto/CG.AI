(() => {
  function candidates(source, start, end, style, kind, seed) {
    const root = source.filter(note => note.start >= start && note.start < end);
    return ['A','B','C'].map((label,variant) => {
      const shift = (variant + seed) % 3;
      const notes = [];
      if (kind === 'harmony' && root.length) {
        for (const note of root) notes.push({start:note.start,length:Math.min(note.length,end-note.start),pitch:(note.pitch + [2,4,5][shift]) % 7});
      } else {
        const step = style === 'ambient' ? 2 : style === 'dance' ? .5 : 1;
        const pattern = [[0,2,4,2],[0,4,3,2],[0,3,5,4]][shift];
        for (let beat = start; beat < end; beat += step) {
          const last = root.findLast(note => note.start <= beat);
          const pitch = kind === 'drums' ? 0 : ((last?.pitch || 0) + pattern[Math.floor((beat-start)/step)%4]) % 7;
          notes.push({start:beat,length:Math.min(end-beat,kind==='drums'?.25:step),pitch});
        }
      }
      const instrument = kind === 'drums' ? ['Kick','Snare','Closed hi-hat'][shift] :
        kind === 'harmony' ? ['Strings','Flute','Electric piano'][shift] :
          style === 'rock' ? 'Electric guitar' : style === 'ambient' ? 'Soft pad' : 'Electric piano';
      return {label,notes,sound:{instrument,style:'natural',synth:'auto'}};
    });
  }

  function midiFile(tracks, bpm) {
    const u16 = n => [n >>> 8 & 255,n & 255];
    const u32 = n => [n >>> 24 & 255,n >>> 16 & 255,n >>> 8 & 255,n & 255];
    const ascii = s => Array.from(s,char=>char.charCodeAt(0));
    const vlq = n => {
      const out = [n & 127];
      while (n >>= 7) out.unshift((n & 127) | 128);
      return out;
    };
    const chunk = bytes => [...ascii('MTrk'),...u32(bytes.length),...bytes];
    const tempo = Math.round(60000000 / bpm);
    const timing = chunk([0,255,81,3,tempo>>>16 & 255,tempo>>>8 & 255,tempo&255,0,255,47,0]);
    const parts = tracks.map(({notes,name,pitches,drum},index) => {
      const channel = drum ? 9 : index;
      const events = notes.flatMap(note => {
        const number = drum ? pitches[0] : pitches[note.pitch];
        return [
          {time:Math.round(note.start*480),status:144+channel,number,value:95},
          {time:Math.round((note.start+note.length)*480),status:128+channel,number,value:0}
        ];
      }).sort((a,b)=>a.time-b.time || a.status-b.status);
      const label = Array.from(new TextEncoder().encode(name));
      const bytes = [0,255,3,...vlq(label.length),...label];
      let last = 0;
      for (const event of events) {
        bytes.push(...vlq(event.time-last),event.status,event.number,event.value);
        last = event.time;
      }
      return chunk([...bytes,0,255,47,0]);
    });
    return Uint8Array.from([...ascii('MThd'),...u32(6),...u16(1),...u16(parts.length+1),...u16(480),...timing,...parts.flat()]);
  }

  function stereoWav(buffer, rate) {
    const data = new ArrayBuffer(44 + buffer.length * 4);
    const view = new DataView(data);
    function tag(offset,value) {
      for (let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i));
    }
    tag(0,'RIFF'); view.setUint32(4,data.byteLength-8,true); tag(8,'WAVE'); tag(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,2,true);
    view.setUint32(24,rate,true); view.setUint32(28,rate*4,true); view.setUint16(32,4,true);
    view.setUint16(34,16,true); tag(36,'data'); view.setUint32(40,buffer.length*4,true);
    for (let channel=0;channel<2;channel++) {
      buffer.getChannelData(channel).forEach((value,index) => {
        const sample=Math.max(-1,Math.min(1,value));
        view.setInt16(44+index*4+channel*2,Math.round(sample*(sample<0?32768:32767)),true);
      });
    }
    return data;
  }

  window.CGStudio = {candidates,midiFile,stereoWav};
})();
