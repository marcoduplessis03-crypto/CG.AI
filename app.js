(() => {
  const root = document.getElementById('cg-concepts');
  const pitches = ['C4','D4','E4','F4','G4','A4','B4','C5'];
  const midi = [60,62,64,65,67,69,71,72];
  const { detectPitch, quantizeTake, encodeWav, tuneVoice, detectHits, percussion, percussionBuffer } = window.CGAudio;
  const instruments = [
    ['Piano','triangle',[0,2,4,2,1,3,2]],
    ['Flute','sine',[4,5,7,5,3,4,3]],
    ['Bass','triangle',[0,0,2,2,1,1,0]],
    ['Strings','sawtooth',[2,4,3,4,2,3,4]],
    ['Guitar','triangle',[4,2,4,2,5,3,5]],
    ['Clarinet','square',[2,3,4,3,1,2,3]],
    ['Keys','sine',[5,6,7,6,4,5,6]],
    ['Synth','sawtooth',[0,4,2,4,1,5,3]]
  ];
  const catalog = [
    ['Keys',['Piano','Electric piano','Organ','Harpsichord','Keys','Celesta']],
    ['Strings',['Strings','Violin','Viola','Cello','Harp','Pizzicato strings']],
    ['Winds & brass',['Flute','Clarinet','Oboe','Bassoon','Saxophone','Trumpet','French horn','Trombone']],
    ['Plucked & bass',['Guitar','Electric guitar','Overdriven guitar','Nylon guitar','Steel guitar','Banjo','Ukulele','Bass','Upright bass']],
    ['Synth',['Synth','Analog lead','Soft pad','Glass bells','Sub bass','Pluck']],
    ['Percussion',Object.keys(percussion)]
  ];
  const styles = {
    natural: ['Natural',1,.035,.82],
    soft: ['Soft',.66,.095,.9],
    bright: ['Bright',1.2,.015,.86],
    staccato: ['Staccato',.96,.018,.43],
    sustained: ['Sustained',.86,.08,.96]
  };
  const synths = { auto:'Instrument default', sine:'Sine', triangle:'Triangle', square:'Square', sawtooth:'Sawtooth' };
  const instrumentOptions = catalog.map(([family,names]) => '<optgroup label="'+family+'">'+names.map(name => '<option>'+name+'</option>').join('')+'</optgroup>').join('');
  const options = values => Object.entries(values).map(([key,label]) => '<option value="'+key+'">'+label+'</option>').join('');
  let beatCount = 16;
  let audio;
  let stopPlaying = () => {};
  const clef = '<path d="M34 83 C35 75 31 57 27 43 C24 33 26 25 31 24 C37 35 32 43 25 50 C13 61 15 75 26 77 C37 79 42 67 36 61 C29 53 21 61 25 68 M34 81 C36 88 33 94 28 93 C22 93 21 86 25 84" stroke="currentColor" stroke-width="2" fill="none"/>';
  const staff = [42,52,62,72,82].map(y => '<path d="M12 '+y+'H414"/>').join('');

  for (const app of root.querySelectorAll('.cg-app')) {
    let nextId = 1;
    let sections = ['Section 1'];
    let sectionIndex = 0;
    let lyrics = [];
    let brief = '';
    let variants = [];
    let generation = 0;
    let saveTimer;
    const history = [], redo = [];
    const originalTakes = new Map();
    const sample = index => instruments[index][2].map((pitch, position) => ({
      id: nextId++, pitch, start: position * 2, length: position % 2 === 0 ? 2 : 1
    }));
    const tracks = [sample(0), sample(1)];
    const soundFor = index => ({ instrument:instruments[index][0], style:'natural', synth:'auto' });
    const sounds = [soundFor(0),soundFor(1)];
    let track = 0;
    let selected = tracks[0][0].id;
    let group = new Set();
    let clipboard;
    let bpm = 92;
    let view = app.matches('.cg-capture') ? 'capture' : 'edit';
    let preview = false;
    let playback = null;
    let song = 'Evening Light';
    let frame = 0;
    let analyser;
    let drag;
    let erase;
    let volume = .8;
    let master;
    let pausedBeat = 0;
    let transportClock;
    let zoom = 1;
    let gridStep = 1;
    const vocalTakes = new Map();
    let captureSession;
    let captureMode;
    let recordingTimer;
    const timers = [];
    const voices = [];
    const partName = () => sounds[track].instrument;
    const currentNote = () => tracks[track].find(note => note.id === selected);
    const palette = ['#8ed7a5','#84c5f4','#f2bd73','#c7a3ec','#f39eac','#77d7cb','#d8dc87','#a5b2f1'];
    const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const trackColor = index => isColor(sounds[index].color) ? sounds[index].color : palette[index];
    const setup = app.querySelector('[data-sound-setup]');
    if (setup) {
      setup.innerHTML = '<label class="cg-field">Instrument<select data-sound="instrument">'+instrumentOptions+'</select></label><label class="cg-field">Style<select data-sound="style">'+options(Object.fromEntries(Object.entries(styles).map(([key,value])=>[key,value[0]])))+'</select></label><label class="cg-field">Synth type<select data-sound="synth">'+options(synths)+'</select></label><label class="cg-field">Vocal Auto-Tune<select data-vocal-mode><option value="off">Off</option><option value="chromatic">Chromatic</option><option value="major">C major</option></select></label><div class="cg-monitor"><label class="cg-switch-row"><input type="checkbox" role="switch" data-monitor> Mic test</label><span class="cg-sub" data-monitor-label>Record a short test phrase</span></div>';
    }
    let waveformIndex = 0;
    for (const scope of app.querySelectorAll('[data-waveform]')) {
      const gradient = 'cg-rgb-' + waveformIndex++;
      const colors = ['#ff387e','#ff9b50','#fded61','#59ffa5','#49e0ff','#8c7aff','#ff61d8'];
      const stops = colors.map((color,index) => '<stop offset="'+index*100/(colors.length-1)+'%" stop-color="'+color+'"/>').join('');
      scope.innerHTML = '<span class="cg-sub">Playback waveform</span><svg class="cg-scope" viewBox="0 0 640 42" preserveAspectRatio="none" role="img" aria-label="Playback waveform"><defs><linearGradient gradientUnits="userSpaceOnUse" x1="0" x2="640" y1="0" y2="0" id="'+gradient+'">'+stops+'</linearGradient></defs><path d="M0 21H640" fill="none" stroke="url(#'+gradient+')" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
    }
    for (const title of app.querySelectorAll('[data-song-title]')) {
      title.innerHTML = '<label class="cg-field">Song title<input type="text" maxlength="80" data-title-input value="Evening Light"></label>';
    }
    for (const panel of app.querySelectorAll('[data-pane="score"] [data-audio-export]')) {
      panel.innerHTML = '<h3>Export audio</h3><div class="cg-actions cg-export-options"><label class="cg-part-picker">Format <select data-format><option value="wav">WAV</option><option value="mp3" disabled>MP3 (planned)</option></select></label><button data-action="export-wav">Download WAV</button></div><p class="cg-caption" data-export-details aria-live="polite">Full arrangement · WAV</p><div class="cg-actions"><button data-action="export-score">Download part as MusicXML</button></div>';
    }
    for (const roll of app.querySelectorAll('[data-roll]')) {
      roll.innerHTML = '<label class="cg-zoom">Zoom <input type="range" data-zoom min="1" max="2" step=".25" value="1"><output data-zoom-label>1×</output></label><div class="cg-scroll"><div class="cg-timeline"><div class="cg-measures" aria-label="Four bars"><span>1</span><span>2</span><span>3</span><span>4</span></div><div class="cg-roll"><div class="cg-keys" aria-hidden="true">' +
        [...pitches].reverse().map(pitch => '<span>' + pitch + '</span>').join('') +
        '</div><div class="cg-notes" role="group" aria-label="Piano roll notes"></div></div></div></div><p class="cg-sub cg-caption">Click to add · Shift-click to select notes · Drag to move · Right-click to erase</p><div class="cg-actions cg-vocal-tools" data-vocal-tools hidden><button data-action="play-vocal">Play tuned voice</button><button data-action="export-vocal">Download tuned voice</button></div>';
    }
    for (const tools of app.querySelectorAll('[data-note-tools]')) {
      tools.innerHTML = '<button data-action="add-note">Add note</button><button data-action="lower">Lower</button><button data-action="raise">Raise</button><button data-action="shorten">Shorten</button><button data-action="lengthen">Lengthen</button><button data-action="split-note">Split</button><button data-action="merge-note">Merge</button><button data-action="duplicate">Duplicate</button><button data-action="copy-notes" title="Ctrl+C">Copy</button><button data-action="cut" title="Ctrl+X">Cut</button><button data-action="paste" title="Ctrl+V">Paste</button><button data-action="delete-notes" title="Delete">Delete</button>';
    }
    for (const tools of app.querySelectorAll('[data-duration-tools]')) {
      tools.innerHTML = '<label class="cg-part-picker">Note <select data-score-picker></select></label><button data-action="shorten">Shorten</button><button data-action="lengthen">Lengthen</button><span class="cg-sub">Drag the line end to resize</span>';
    }
    const arrangement = app.querySelector('[data-arrangement]');
    arrangement.innerHTML = '<div class="cg-actions" data-track-controls><label class="cg-part-picker">Track <select data-track-picker></select></label><button data-action="add-track">Add track</button><span class="cg-sub" data-track-count></span></div><div class="cg-actions" data-arrangement-playback><label class="cg-tempo">BPM <input type="number" data-bpm min="40" max="240" step="1" value="92" inputmode="numeric"></label><button class="cg-main" data-action="play-all">Play All</button></div>';
    const status = document.createElement('p');
    status.className = 'cg-caption';
    status.setAttribute('aria-live','polite');
    status.dataset.studioStatus = '';
    app.querySelector('.cg-capture-body').prepend(status);
    const trackPicker = app.querySelector('[data-track-picker]');
    const bpmInput = app.querySelector('[data-bpm]');
    const captureControls = app.querySelector('[data-capture-controls]');
    const trackControls = app.querySelector('[data-track-controls]');
    const arrangementPlayback = app.querySelector('[data-arrangement-playback]');
    const monitor = app.querySelector('[data-monitor]');
    const hudPosition = app.querySelector('[data-hud-position]');
    const hudTempo = app.querySelector('[data-hud-tempo]');
    const hudState = app.querySelector('[data-hud-state]');
    const hud = app.querySelector('.cg-hud');
    const volumeInput = app.querySelector('[data-volume]');
    const drumSound = app.querySelector('[data-drum-sound]');
    drumSound.innerHTML = Object.keys(percussion).map(name=>'<option>'+name+'</option>').join('');
    app.querySelector('[data-synth-wave]').innerHTML = options(synths);
    const noteColor = app.querySelector('[data-note-color]');
    const colorNames = ['Mint','Sky','Amber','Lilac','Rose','Teal','Lime','Periwinkle'];
    noteColor.innerHTML += palette.map((color,index)=>'<option value="'+color+'">'+colorNames[index]+'</option>').join('');
    const projectFile = app.querySelector('[data-project-file]');
    const projectStatus = app.querySelector('[data-project-status]');

    function maxLength(note) {
      const next = tracks[track].find(item => item.start > note.start)?.start ?? beatCount;
      return Math.min(4,next - note.start);
    }

    function setLength(note, length) {
      note.length = Math.max(.25,Math.min(maxLength(note),length));
      status.textContent = pitches[note.pitch] + ' · ' + note.length + (note.length === 1 ? ' beat' : ' beats');
    }

    function fitsAt(note, start) {
      return start >= 0 && start + note.length <= beatCount &&
        !tracks[track].some(other => other.id !== note.id &&
          start < other.start + other.length && other.start < start + note.length);
    }

    const noteValues = [[4,'whole'],[3,'half',true],[2,'half'],[1.5,'quarter',true],[1,'quarter'],[.75,'eighth',true],[.5,'eighth'],[.25,'16th']];
    function notationSegments(notes) {
      const events = [];
      let cursor = 0;
      function split(start,length,note) {
        let beat = start;
        while (length > 0) {
          const limit = Math.min(length,4 - beat % 4);
          const [value,type,dot] = noteValues.find(([size]) => size <= limit);
          events.push({...note,start:beat,length:value,type,dot,rest:!note,
            tieStop:Boolean(note && beat > start),tieStart:Boolean(note && value < length)});
          beat += value;
          length -= value;
        }
      }
      for (const note of notes) {
        split(cursor,note.start - cursor);
        split(note.start,note.length,note);
        cursor = note.start + note.length;
      }
      split(cursor,beatCount - cursor);
      return events;
    }

    function updateZoom() {
      const limit = Math.max(2,Math.floor(bpm / 30));
      zoom = Math.min(zoom,limit);
      gridStep = zoom >= 2 ? .25 : zoom >= 1.5 ? .5 : 1;
      const grid = gridStep === .25 ? '1/16' : gridStep === .5 ? '1/8' : '1/4';
      app.querySelector('[data-zoom]').max = limit;
      app.querySelector('[data-zoom]').value = zoom;
      app.querySelector('[data-zoom-label]').textContent = zoom + '× / ' + limit + '× · ' + grid + ' grid';
      app.querySelector('.cg-notes').style.setProperty('--subdivision',gridStep * 100 / beatCount + '%');
      app.querySelector('.cg-timeline').style.width = zoom * beatCount / 16 * 100 + '%';
    }

    function renderScore(score, notes) {
      const width = 74 + beatCount * 22;
      const staffLines = staff.replaceAll('H414','H'+(width-12));
      const barLines = Array.from({length:beatCount/4},(_,i)=>'<path d="M'+(61+(i+1)*88)+' 42v40"/>').join('');
      const segments = notationSegments(notes);
      score.classList.toggle('cg-score-preview', preview);
      const marks = [];
      const drum = Boolean(percussion[partName()]);
      for (const note of segments) {
        const x = 71 + note.start * 22;
        if (note.rest) {
          if (note.length >= 1) marks.push('<path d="M'+x+' 49l4 7 -5 7 6 6c-6 -3 -7 2 -4 5" fill="none" stroke="currentColor" stroke-width="1.65"/>');
          continue;
        }
        const y = drum ? 62 : 92 - note.pitch * 5;
        const stem = note.pitch >= 6 ? 'M'+(x-5)+' '+y+'v27' : 'M'+(x+5)+' '+y+'v-27';
        marks.push('<g data-score-note="'+note.id+'" stroke="currentColor" fill="none" stroke-width="1.7">' +
          (!drum && note.pitch === 0 ? '<path d="M'+(x-9)+' 92h18"/>' : '') +
          '<ellipse cx="'+x+'" cy="'+y+'" rx="5.7" ry="3.5" fill="'+(note.length < 2 ? 'currentColor' : 'none')+'" transform="rotate(-16 '+x+' '+y+')"/>'+
          (note.length < 4 ? '<path d="'+stem+'"/>' : '')+
          (note.dot ? '<circle cx="'+(x+10)+'" cy="'+(y-2)+'" r="1.4" fill="currentColor"/>' : '')+
          (note.length < 1 ? '<path d="M'+(x+5)+' '+(y-27)+'q8 5 7 13"/>' : '')+
          (note.length === .25 ? '<path d="M'+(x+5)+' '+(y-21)+'q8 5 7 13"/>' : '')+
          (note.tieStart ? '<path d="M'+(x+5)+' '+(y+6)+'q'+(note.length*11-5)+' 10 '+(note.length*22-10)+' 0"/>' : '')+
          '</g>');
      }
      for (const note of notes) {
        const x = 71 + note.start * 22;
        const end = x + note.length * 22 - 8;
        marks.push('<g class="cg-score-handle" data-resize="'+note.id+'" aria-hidden="true" opacity="'+(note.id === selected ? '1' : '.58')+'"><path d="M'+x+' 110H'+end+'M'+end+' 104v12" fill="none" stroke="currentColor" stroke-width="2"/><rect x="'+(end-9)+'" y="98" width="18" height="24" fill="transparent"/></g>');
      }
      const description = notes.map(note => pitches[note.pitch] + ' for ' + note.length + (note.length === 1 ? ' beat' : ' beats')).join(', ') || 'rests only';
      score.innerHTML = '<svg class="cg-score" style="min-width:'+width+'px" viewBox="0 0 '+width+' 124" role="img" aria-label="' + partName() + ' part at ' + bpm + ' BPM. ' + description + '"><g fill="none" stroke="currentColor" opacity=".65">' + staffLines + barLines + '</g>' + (drum ? '<path d="M24 51v22m6-22v22" stroke="currentColor" stroke-width="3"/>' : clef) + '<text x="43" y="59" font-size="17" font-family="serif" fill="currentColor">4<tspan x="43" dy="17">4</tspan></text>' + marks.join('') + '</svg>';
    }

    function render() {
      updateZoom();
      const notes = tracks[track];
      const note = currentNote();
      const steps = app.querySelector('[data-steps]');
      if (steps) steps.hidden = false;
      if (captureControls && view === 'capture' && trackControls.parentElement !== captureControls) {
        captureControls.append(trackControls,bpmInput.parentElement);
      }
      if (captureControls && view !== 'capture' && trackControls.parentElement !== arrangement) {
        arrangement.prepend(trackControls);
        arrangementPlayback.prepend(bpmInput.parentElement);
      }
      for (const field of app.querySelectorAll('[data-sound]')) field.value = sounds[track][field.dataset.sound];
      for (const pane of app.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== view;
      for (const button of app.querySelectorAll('[data-view][aria-pressed]')) button.setAttribute('aria-pressed', button.dataset.view === view);
      for (const label of app.querySelectorAll('[data-part]')) label.textContent = partName() + ' part';
      const activeNotes = new Set(selectedNotes().map(note=>note.id));
      for (const roll of app.querySelectorAll('.cg-notes')) {
        roll.style.setProperty('--track-color',trackColor(track));
        roll.toggleAttribute('data-locked',Boolean(sounds[track].locked));
        roll.innerHTML = notes.map(item => {
          const label = pitches[item.pitch] + ', bar ' + (Math.floor(item.start / 4) + 1) + ', beat ' + (item.start % 4 + 1) + ', ' + item.length + (item.length === 1 ? ' beat' : ' beats');
          return '<button class="cg-note" type="button" data-note="'+item.id+'" aria-label="'+label+'" aria-pressed="'+(activeNotes.has(item.id))+'" style="'+(isColor(item.color)?'--note-color:'+item.color+';':'')+'grid-column:'+(item.start * 4 + 1)+' / span '+(item.length * 4)+';grid-row:'+(8-item.pitch)+'"><span class="cg-note-label">'+pitches[item.pitch]+'</span><span class="cg-note-end" data-resize="'+item.id+'" aria-hidden="true"></span></button>';
        }).join('');
      }
      for (const score of app.querySelectorAll('[data-score]')) renderScore(score, notes);
      trackPicker.innerHTML = sounds.map((sound,index) => '<option value="'+index+'">'+(index+1)+'. '+sound.instrument+(sound.locked ? ' · Locked' : '')+'</option>').join('');
      trackPicker.value = track;
      app.querySelector('[data-track-count]').textContent = tracks.length + ' / ' + instruments.length + ' tracks';
      app.querySelector('[data-action="add-track"]').disabled = tracks.length === instruments.length;
      const trackList = app.querySelector('[data-track-list]');
      if (trackList) {
        trackList.innerHTML = tracks.map((items,index) => {
          const sound = sounds[index];
          const label = (sound.locked ? 'Unlock ' : 'Lock ') + sound.instrument;
          return '<span class="cg-track-item" style="--track-color:'+trackColor(index)+'"><button type="button" data-track="'+index+'" aria-pressed="'+(index===track)+'">'+(index+1)+'. '+escapeText(sound.instrument)+'</button><button type="button" data-lock-track="'+index+'" aria-label="'+escapeText(label)+'" aria-pressed="'+Boolean(sound.locked)+'">'+(sound.locked ? 'Locked' : 'Lock')+'</button></span>';
        }).join('');
      }
      for (const picker of app.querySelectorAll('[data-score-picker]')) {
        picker.innerHTML = '<option value="">Select note</option>'+notes.map(item => '<option value="'+item.id+'">'+pitches[item.pitch]+' · bar '+(Math.floor(item.start/4)+1)+', beat '+(item.start%4+1)+'</option>').join('');
        picker.value = note?.id ?? '';
        picker.disabled = !notes.length;
      }
      for (const button of app.querySelectorAll('[data-note-tools] button,[data-duration-tools] button')) {
        const action = button.dataset.action;
        if (action === 'copy-notes') { button.disabled = !activeNotes.size; continue; }
        if (sounds[track].locked) { button.disabled = true; continue; }
        if (action === 'add-note') { button.disabled = false; continue; }
        button.disabled = action === 'paste' ? !clipboard?.length : !note ||
          (action === 'shorten' && note.length === .25) ||
          (action === 'lengthen' && note.length === maxLength(note)) ||
          (action === 'lower' && note.pitch === 0) ||
          (action === 'raise' && note.pitch === pitches.length - 1);
      }
      app.querySelector('[data-selection-count]').textContent = activeNotes.size ? activeNotes.size+' selected' : 'No notes selected';
      app.querySelector('[data-track-color]').value = trackColor(track);
      const colorNotes = app.querySelector('[data-note-color]');
      colorNotes.disabled = !activeNotes.size || Boolean(sounds[track].locked);
      colorNotes.value = note?.color || '';
      renderWorkspace();
      renderTools();
      updateTransport();
    }


    function range() {
      return [sectionIndex * 16,Math.min(beatCount,sectionIndex * 16 + 16)];
    }

    function renderWorkspace() {
      app.style.setProperty('--bars',beatCount / 4);
      app.style.setProperty('--ticks',beatCount * 4);
      const marks = app.querySelector('.cg-measures');
      marks.innerHTML = Array.from({length:beatCount/4},(_,i)=>'<span>'+(i+1)+'</span>').join('');
      const sectionOptions = sections.map((name,index)=>'<option value="'+index+'">'+escapeText(name)+'</option>').join('');
      for (const picker of app.querySelectorAll('[data-section-select]')) {
        picker.innerHTML = sectionOptions;
        picker.value = sectionIndex;
      }
      app.querySelector('[data-section-name]').value = sections[sectionIndex];
      app.querySelector('[data-action="add-section"]').disabled = beatCount >= 128;
      for (const input of app.querySelectorAll('[data-title-input]')) {
        if (document.activeElement !== input) input.value = song;
      }
      app.querySelector('[data-lyrics]').value = lyrics[sectionIndex] || '';
      app.querySelector('[data-producer-brief]').value = brief;
      app.querySelector('[data-action="toggle-lock"]').textContent = sounds[track].locked ? 'Unlock notes' : 'Lock notes';
      app.querySelector('[data-action="toggle-lock"]').setAttribute('aria-pressed',Boolean(sounds[track].locked));
      app.querySelector('[data-voice-status]').textContent = partName() + ' · ' +
        (originalTakes.has(track) ? 'Original take available' : 'No original take') + ' · ' +
        (vocalTakes.has(track) ? 'Tuned take available' : 'No tuned take');
      app.querySelector('[data-action="play-original-voice"]').disabled = !originalTakes.has(track);
      app.querySelector('[data-mixer]').innerHTML = sounds.map((sound,index)=>
        '<article><h3>'+escapeText(sound.instrument)+'</h3><label>Level <input type="range" min="0" max="100" data-track-gain="'+index+'" value="'+Math.round((sound.level ?? 1)*100)+'"></label>'+
        '<label>Pan <input type="range" min="-100" max="100" data-track-pan="'+index+'" value="'+Math.round((sound.pan ?? 0)*100)+'"></label>'+
        '<div class="cg-actions"><button data-mute="'+index+'" aria-pressed="'+Boolean(sound.mute)+'">Mute</button><button data-solo="'+index+'" aria-pressed="'+Boolean(sound.solo)+'">Solo</button></div></article>').join('');
      app.querySelector('[data-candidates]').innerHTML = variants.map((candidate,index)=>
        '<article><h3>Idea '+candidate.label+'</h3><span>'+escapeText(candidate.sound.instrument)+' · '+candidate.notes.length+' notes</span><div class="cg-actions"><button data-audition="'+index+'">Audition</button><button data-apply="'+index+'">Add track</button></div></article>').join('');
    }

    function escapeText(value) {
      return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[character]);
    }

    function createIdeas(kind) {
      cancelCapture();
      stop();
      const [start,end] = range();
      variants = CGStudio.candidates(tracks[track],start,end,app.querySelector('[data-create-style]').value,kind,generation++);
      view = 'results';
      render();
    }

    function takeList(map) {
      return [...map].map(([index,buffer])=>({track:index,rate:buffer.sampleRate,samples:buffer.getChannelData(0)}));
    }

    function checkpoint() {
      const snapshot = projectSnapshot();
      const {tracks:noteTracks,sounds:instruments,sections:names,lyrics:words,...rest} = snapshot;
      history.push({...rest,tracks:structuredClone(noteTracks),sounds:structuredClone(instruments),sections:[...names],lyrics:[...words]});
      if (history.length > 30) history.shift();
      redo.length = 0;
    }

    function undoEdit(reverse) {
      const from = reverse ? redo : history;
      const to = reverse ? history : redo;
      if (!from.length) { status.textContent = reverse ? 'Nothing to redo.' : 'Nothing to undo.'; return; }
      const snapshot = projectSnapshot();
      to.push({...snapshot,tracks:structuredClone(snapshot.tracks),sounds:structuredClone(snapshot.sounds),sections:[...sections],lyrics:[...lyrics]});
      restoreProject(from.pop());
      queueSave();
    }

    function queueSave() {
      clearTimeout(saveTimer);
      projectStatus.dataset.saveState = 'pending';
      projectStatus.textContent = 'Saving…';
      saveTimer = setTimeout(async ()=>{
        try { await CGProjects.save(projectSnapshot()); projectStatus.dataset.saveState = 'saved'; projectStatus.textContent = 'Saved on this device.'; }
        catch { projectStatus.dataset.saveState = 'error'; projectStatus.textContent = 'Autosave failed. Download a project copy.'; }
      },450);
    }

    async function renderVersions() {
      const list = app.querySelector('[data-version-list]');
      try {
        const search = app.querySelector('[data-version-search]').value.toLowerCase();
        const entries = await CGProjects.versions();
        list.replaceChildren();
        for (const entry of entries.filter(item=>item.name.toLowerCase().includes(search))) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.version = entry.id;
          button.textContent = entry.name;
          list.append(button);
        }
        if (!list.children.length) list.textContent = 'No saved versions found.';
      } catch { list.textContent = 'Saved versions could not be read.'; }
    }

    const canHear = index => !sounds[index].mute && (!sounds.some(sound=>sound.solo) || sounds[index].solo);

    function workspaceAction(action, button) {
      if (button.dataset.audition !== undefined) {
        const candidate = variants[Number(button.dataset.audition)];
        const [start,end] = range();
        play('compare',candidate.notes,start,candidate.sound,end);
        return true;
      }
      if (button.dataset.apply !== undefined) {
        if (tracks.length >= instruments.length) { status.textContent = 'All eight tracks are in use.'; return true; }
        const candidate = variants[Number(button.dataset.apply)];
        checkpoint();
        tracks.push(candidate.notes.map(note=>({...note,id:nextId++})));
        sounds.push({...candidate.sound});
        selectTrack(tracks.length-1);
        view = 'edit';
        render();
        queueSave();
        return true;
      }
      for (const key of ['mute','solo']) {
        if (button.dataset[key] === undefined) continue;
        checkpoint();
        stop();
        const sound = sounds[Number(button.dataset[key])];
        sound[key] = !sound[key];
        render();
        queueSave();
        return true;
      }
      if (button.dataset.version) {
        CGProjects.getVersion(button.dataset.version).then(entry=>{
          if (!entry) throw new Error('Missing version');
          checkpoint();
          restoreProject(entry.project);
          queueSave();
        }).catch(()=>{status.textContent='Could not open that version.';});
        return true;
      }
      if (action === 'undo-edit' || action === 'redo-edit') undoEdit(action === 'redo-edit');
      else if (action === 'create-candidates') createIdeas(app.querySelector('[data-create-kind]').value);
      else if (action?.startsWith('propose-')) createIdeas(action.slice(8));
      else if (action === 'play-section' || action === 'preview-original') {
        const [start,end] = range();
        play('play-all',[],start,undefined,end);
      } else if (action === 'play-original-voice') play('original');
      else if (action === 'toggle-lock') {
        toggleTrackLock(track);
      } else if (action === 'add-section') {
        if (beatCount >= 128) return true;
        checkpoint();
        stop();
        beatCount += 16;
        sections.push('Section ' + (sections.length+1));
        sectionIndex = sections.length-1;
        render();
        queueSave();
      } else if (action === 'save-version') {
        const name = app.querySelector('[data-version-name]').value.trim() || song;
        CGProjects.saveVersion(name,projectSnapshot()).then(renderVersions).catch(()=>{status.textContent='Could not save the version.';});
      } else if (action === 'new-project') {
        if (!confirm('Start a blank project? You can undo this action.')) return true;
        checkpoint();
        restoreProject({format:'cg-ai',version:1,song:'Untitled song',bpm:92,tracks:[[]],sounds:[soundFor(0)],vocals:[],view:'capture'});
        queueSave();
      } else if (action === 'export-midi') {
        const parts = tracks.map((notes,index)=>{
          const instrument = sounds[index].instrument;
          const drum = percussion[instrument];
          return {notes,name:instrument,pitches:drum?[drum[0]-1]:midi,drum:Boolean(drum)};
        });
        download(new Blob([CGStudio.midiFile(parts,bpm)],{type:'audio/midi'}),fileStem()+'.mid');
      } else if (action === 'export-lyrics') {
        const words = sections.map((name,index)=>name+'\n'+(lyrics[index] || '')).join('\n\n');
        download(new Blob([words],{type:'text/plain'}),fileStem()+' - lyrics.txt');
      } else if (action === 'print-score') { view = 'score'; render(); window.print(); }
      else if (action === 'export-track-wav') exportWav(button,track);
      else return false;
      return true;
    }


    function selectOne(id) {
      group.clear();
      selected = id;
    }

    function setSelection(ids, primary) {
      group = new Set(ids);
      selected = group.has(primary) ? primary : group.values().next().value;
    }

    function selectedNotes() {
      return tracks[track].filter(note=>group.has(note.id) || note.id === selected);
    }

    function editSelection(action) {
      const notes = selectedNotes();
      if (action !== 'copy-notes' && sounds[track].locked) {
        status.textContent = 'Unlock this track to edit its notes.';
        return;
      }
      if (action === 'paste') {
        if (!clipboard?.length) return;
        const anchor = notes.length ? Math.max(...notes.map(note=>note.start+note.length)) : range()[0];
        const occupied = tracks[track];
        const length = Math.max(...clipboard.map(note=>note.start+note.length));
        let destination;
        for (let beat = anchor; beat + length <= beatCount; beat += .25) {
          if (clipboard.every(note=>occupied.every(other=>beat+note.start>=other.start+other.length ||
              beat+note.start+note.length<=other.start))) { destination = beat; break; }
        }
        if (destination === undefined) { status.textContent = 'The copied notes do not fit after the selection.'; return; }
        checkpoint();
        stop();
        const pasted = clipboard.map(note=>({...note,id:nextId++,start:note.start+destination}));
        tracks[track] = [...occupied,...pasted].sort((a,b)=>a.start-b.start);
        setSelection(pasted.map(note=>note.id));
        status.textContent = pasted.length + ' pasted.';
        render();
        queueSave();
        return;
      }
      if (!notes.length) return;
      if (action === 'copy-notes' || action === 'cut') {
        const first = notes[0].start;
        clipboard = notes.map(({id,...note})=>({...note,start:note.start-first}));
      }
      if (action === 'cut' || action === 'delete-notes') {
        checkpoint();
        stop();
        removeNotes(new Set(notes.map(note=>note.id)));
        queueSave();
      } else {
        status.textContent = notes.length + ' copied.';
        render();
      }
    }

    function toggleTrackLock(index) {
      checkpoint();
      if (index === track) cancelCapture();
      sounds[index].locked = !sounds[index].locked;
      render();
      queueSave();
    }

    function stopMetronome(session) {
      for (const click of session?.clicks || []) {
        try { click.stop(); } catch {}
      }
      if (session) session.clicks = [];
    }

    function startMetronome(session,beats) {
      if (!app.querySelector('[data-metronome]').checked) return;
      const start = audio.currentTime + .015;
      session.clicks = [];
      for (let beat = 0; beat < beats; beat++) {
        const time = start + beat * 60 / session.tempo;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = beat % 4 === 0 ? 1320 : 880;
        gain.gain.setValueAtTime(.001,time);
        gain.gain.exponentialRampToValueAtTime(.12,time+.003);
        gain.gain.exponentialRampToValueAtTime(.001,time+.045);
        oscillator.connect(gain);
        connectOutput(gain);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(time);
        oscillator.stop(time+.05);
        session.clicks.push(oscillator);
      }
    }

    function updateTransport() {
      const recording = captureSession?.recorder?.state === 'recording';
      const transportState = recording ? 'recording' : captureMode ? 'input' : playback ? 'playing' : pausedBeat ? 'paused' : 'ready';
      app.dataset.transportState = transportState;
      hudState.textContent = {recording:'RECORDING',input:'MIC INPUT',playing:'PLAYING',paused:'PAUSED',ready:'READY'}[transportState];
      hudTempo.textContent = bpm + ' BPM';
      for (const button of app.querySelectorAll('[data-action="audition-sound"],[data-action="audition-drum"]')) {
        button.disabled = Boolean(captureMode);
      }
      app.querySelector('[data-action="transport-play"]').disabled = playback === 'play-all' || !tracks.some(notes=>notes.length);
      app.querySelector('[data-action="transport-pause"]').disabled = playback !== 'play-all';
      app.querySelector('[data-action="transport-stop"]').disabled = !playback && !pausedBeat;
      const vocal = app.querySelector('[data-vocal-tools]');
      vocal.hidden = !vocalTakes.has(track);
      vocal.querySelector('[data-action="play-vocal"]').textContent = playback === 'vocal' ? 'Stop voice' : 'Play tuned voice';
      const record = app.querySelector('[data-action="record"]');
      record.textContent = captureMode === 'record' ? 'Finish take' : 'Record melody';
      record.disabled = captureMode === 'monitor' || Boolean(sounds[track].locked);
      for (const button of app.querySelectorAll('[data-action="play"],[data-action="play-all"]')) {
        const all = button.dataset.action === 'play-all';
        button.textContent = playback === button.dataset.action ? 'Stop' : all ? 'Play All' : 'Play track';
        button.disabled = all ? !tracks.some(notes => notes.length) : !tracks[track].length;
      }
      if (monitor) {
        monitor.checked = Boolean(captureMode === 'monitor' || playback === 'monitor');
        app.querySelector('[data-monitor-label]').textContent = captureMode === 'monitor' ? 'Mic on · hum a short phrase' : playback === 'monitor' ? 'Playing your phrase through ' + partName() : 'Mic off';
      }
    }


    function setVolume(value) {
      volume = value;
      volumeInput.value = Math.round(value * 100);
      volumeInput.style.setProperty('--volume-fill',volumeInput.value + '%');
      volumeInput.style.setProperty('--volume-glow',value * 18 + 'px');
      app.querySelector('[data-volume-value]').textContent = volumeInput.value + '%';
      if (master) master.gain.setTargetAtTime(value,audio.currentTime,.02);
    }

    function connectOutput(node) {
      if (!master) {
        master = audio.createGain();
        master.gain.value = volume;
        master.connect(audio.destination);
      }
      node.connect(master);
    }

    function setPlayhead(beat, active = false) {
      const roll = app.querySelector('.cg-notes');
      roll.style.setProperty('--playhead',Math.min(100,beat / beatCount * 100) + '%');
      roll.style.setProperty('--playhead-opacity',active ? '1' : '.35');
      const position = Math.floor(Math.min(beatCount - .00001,Math.max(0,beat)));
      const label = String(Math.floor(position / 4) + 1).padStart(2,'0') + '.' + String(position % 4 + 1).padStart(2,'0');
      if (hudPosition.value !== label) hudPosition.value = label;
    }

    function transportBeat() {
      return transportClock ? Math.min(beatCount,transportClock.beat +
        Math.max(0,audio.currentTime - transportClock.time) / transportClock.secondsPerBeat) : 0;
    }

    function renderTools() {
      const notes = tracks[track], sound = sounds[track];
      const isDrum = Object.hasOwn(percussion,sound.instrument);
      const barPicker = app.querySelector('[data-drum-bar]');
      const oldBar = barPicker.value;
      if (barPicker.options.length !== beatCount/4) {
        barPicker.innerHTML = Array.from({length:beatCount/4},(_,i)=>'<option>'+(i+1)+'</option>').join('');
        if (Number(oldBar) <= beatCount/4 && Number(oldBar)>0) barPicker.value = oldBar;
      }
      const bar = Number(app.querySelector('[data-drum-bar]').value) - 1;
      const firstBeat = bar * 4;
      if (isDrum) drumSound.value = sound.instrument;
      app.querySelector('[data-drum-hint]').textContent = isDrum ? 'Click steps to toggle hits on ' + sound.instrument + '.' : 'Add a drum track or select an existing percussion track to edit its steps.';
      app.querySelector('[data-drum-steps]').innerHTML = Array.from({length:16},(_,index) => {
        const start = firstBeat + index / 4;
        const on = notes.some(note=>note.start===start);
        return '<button type="button" data-drum-step="'+start+'" aria-pressed="'+on+'" '+(!isDrum?'disabled':'')+'>'+(index+1)+'</button>';
      }).join('');
      app.querySelector('[data-action="add-drum-track"]').disabled = tracks.length >= instruments.length;
      app.querySelector('[data-action="generate-harmony"]').disabled = isDrum || !notes.length || tracks.length >= instruments.length;
      const synthWave = app.querySelector('[data-synth-wave]');
      const attack = app.querySelector('[data-synth-attack]');
      const release = app.querySelector('[data-synth-release]');
      synthWave.value = sound.synth;
      attack.value = Math.round((sound.attack ?? styles[sound.style][2]) * 1000);
      release.value = Math.round((sound.release ?? styles[sound.style][3]) * 100);
      app.querySelector('[data-attack-value]').textContent = attack.value + ' ms';
      app.querySelector('[data-release-value]').textContent = release.value + '%';
    }

    function useStudioAction(action, button) {
      if (action === 'audition-sound') play('preview',[{pitch:4,start:0,length:1}]);
      if (action === 'audition-drum') play('preview',[{pitch:0,start:0,length:.75}],0,{...soundFor(track),instrument:drumSound.value});
      if (action === 'add-drum-track' || action === 'generate-harmony') {
        if (tracks.length >= instruments.length) return;
        const source = sounds[track];
        let notes = [];
        let sound = {...soundFor(track),instrument:drumSound.value};
        if (action === 'generate-harmony') {
          if (percussion[source.instrument] || !tracks[track].length) return;
          const interval = Number(app.querySelector('[data-harmony-interval]').value);
          notes = tracks[track].map(note => ({...note,id:nextId++,pitch:(note.pitch + interval + 7) % 7}));
          sound = {...source};
        }
        tracks.push(notes);
        sounds.push(sound);
        selectTrack(tracks.length - 1);
        view = 'edit';
        status.textContent = action === 'generate-harmony' ? 'Harmony added to track ' + (track + 1) + '.' : sound.instrument + ' track added.';
        render();
      }
      if (button.dataset.drumStep !== undefined && percussion[sounds[track].instrument]) {
        const start = Number(button.dataset.drumStep);
        const existing = tracks[track].find(note=>note.start===start);
        if (existing) removeNotes(new Set([existing.id]));
        else if (fitsAt({length:.25},start)) {
          stop();
          placeNote({pitch:0,length:.25},start);
          render();
        }
        app.querySelector('[data-drum-step="'+start+'"]')?.focus();
      }
    }

    function removeNotes(ids) {
      if (!tracks[track].some(note=>ids.has(note.id))) return;
      tracks[track] = tracks[track].filter(note=>!ids.has(note.id));
      for (const id of ids) group.delete(id);
      if (ids.has(selected)) selected = group.values().next().value;
      status.textContent = ids.size === 1 ? 'Note removed.' : ids.size + ' notes removed.';
      render();
    }

    function eraseThrough(event) {
      const distance = Math.hypot(event.clientX - erase.x,event.clientY - erase.y);
      const steps = Math.max(1,Math.ceil(distance / 4));
      const ids = new Set();
      for (let step = 0; step <= steps; step++) {
        const part = step / steps;
        const x = erase.x + (event.clientX - erase.x) * part;
        const y = erase.y + (event.clientY - erase.y) * part;
        const note = document.elementFromPoint(x,y)?.closest('.cg-note');
        if (note && app.contains(note)) ids.add(Number(note.dataset.note));
      }
      erase.x = event.clientX;
      erase.y = event.clientY;
      if (ids.size) removeNotes(ids);
    }

    function drawWaveform(path) {
      for (const line of app.querySelectorAll('.cg-scope path')) line.setAttribute('d',path);
    }

    function watchWaveform() {
      app.setAttribute('data-audio-active','');
      const input = analyser;
      const data = new Uint8Array(input.fftSize);
      let level = 0;
      const draw = () => {
        input.getByteTimeDomainData(data);
        let peak = 0;
        let path = '';
        for (let i = 0; i <= 128; i++) {
          const value = data[Math.floor(i * (data.length - 1) / 128)];
          peak = Math.max(peak,Math.abs(value - 128) / 128);
          path += (i ? 'L' : 'M') + i * 5 + ' ' + (21 + (128 - value) * .34).toFixed(1);
        }
        const signal = Math.min(1,peak * (captureMode ? 1 : volume) * 1.7);
        level = Math.max(signal,level * .84);
        hud.style.setProperty('--hud-level',level.toFixed(3));
        drawWaveform(path);
        if (transportClock) setPlayhead(transportBeat(),true);
        frame = requestAnimationFrame(draw);
      };
      draw();
    }

    function stop() {
      playback = null;
      transportClock = undefined;
      pausedBeat = 0;
      setPlayhead(0);
      timers.splice(0).forEach(clearTimeout);
      for (const voice of voices.splice(0)) { try { voice.stop(); } catch {} }
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (analyser) analyser.disconnect();
      analyser = undefined;
      app.removeAttribute('data-audio-active');
      drawWaveform('M0 21H640');
      hud.style.setProperty('--hud-level','0');
      for (const note of app.querySelectorAll('.cg-playing')) note.classList.remove('cg-playing');
      updateTransport();
    }

    async function play(action, monitoredNotes = [], fromBeat = 0, previewSound, untilBeat = action === 'monitor' ? 4 : action === 'preview' ? 1 : beatCount) {
      const wasPlaying = playback === action && action !== 'compare';
      stopPlaying();
      if (wasPlaying) return;
      playback = action;
      stopPlaying = stop;
      updateTransport();
      const session = Symbol();
      play.session = session;
      try {
        audio ||= new AudioContext();
        await audio.resume();
        if (audio.state !== 'running') throw new Error('Audio output is suspended.');
      } catch {
        if (playback === action && play.session === session) {
          stop();
          status.textContent = 'Audio could not start here. Try the localhost page in Chrome or Edge and press Play again.';
        }
        return;
      }
      if (playback !== action || play.session !== session) return;
      status.textContent = action === 'play-all' ? 'Playing the full arrangement.' : 'Playing ' + partName() + '.';
      if (action === 'vocal' || action === 'original') {
        const buffer = (action === 'original' ? originalTakes : vocalTakes).get(track);
        if (!buffer) { stop(); return; }
        analyser = audio.createAnalyser();
        connectOutput(analyser);
        watchWaveform();
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        source.onended = () => { if (play.session === session && playback === action) stop(); };
        voices.push(source);
        source.start();
        status.textContent = action === 'original' ? 'Playing the original take.' : 'Playing the tuned take.';
        return;
      }
      const secondsPerBeat = 60 / bpm;
      const startTime = audio.currentTime + .04;
      if (action === 'play-all' || action === 'play' || action === 'compare') transportClock = {time:startTime,beat:fromBeat,secondsPerBeat};
      const playingTracks = action === 'compare' ? [...tracks,monitoredNotes] : action === 'play-all' ? tracks : ['monitor','preview'].includes(action) ? [monitoredNotes] : [tracks[track]];
      if (audio) {
        analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        connectOutput(analyser);
        watchWaveform();
      }
      playingTracks.forEach((notes,index) => {
        const trackIndex = ['play-all','compare'].includes(action) ? index : track;
        const candidate = action === 'compare' && index === tracks.length;
        if ((action === 'play-all' || (action === 'compare' && !candidate)) && !canHear(index)) return;
        for (const note of notes) {
          const end = Math.min(untilBeat,note.start + note.length);
          if (end <= fromBeat || note.start >= untilBeat) continue;
          const first = Math.max(fromBeat,note.start);
          const duration = (end - first) * secondsPerBeat;
          const offset = (first - fromBeat) * secondsPerBeat;
          if (trackIndex === track && (action === 'play-all' || action === 'play')) {
            const highlight = active => app.querySelector('[data-note="'+note.id+'"]')?.classList.toggle('cg-playing',active);
            timers.push(setTimeout(() => highlight(true), (offset + .04) * 1000));
            timers.push(setTimeout(() => highlight(false), (offset + duration + .04) * 1000));
          }
          if (!audio) continue;
          voices.push(scheduleNote(audio,analyser,note,(candidate || action === 'preview') && previewSound ? previewSound : sounds[trackIndex],startTime + offset,duration,playingTracks.length));

        }
      });
      timers.push(setTimeout(stop, ((untilBeat - fromBeat) * secondsPerBeat + .04) * 1000));
    }

    function scheduleNote(context, destination, note, sound, start, duration, mixSize) {
      const drum = percussion[sound.instrument];
      const guitar = sound.synth === 'auto' && sound.instrument.endsWith(' guitar') &&
        ['Electric guitar','Overdriven guitar'].includes(sound.instrument);
      const voice = drum ? context.createBufferSource() : context.createOscillator();
      const gain = context.createGain();
      const [,volume,defaultAttack,defaultRelease] = styles[sound.style];
      const attack = sound.attack ?? defaultAttack;
      const release = sound.release ?? defaultRelease;
      const family = catalog.find(([,names]) => names.includes(sound.instrument))?.[0];
      const fallback = { Keys:'triangle', Strings:'sawtooth', 'Winds & brass':'sine', 'Plucked & bass':'triangle', Synth:'square' };
      if (drum) voice.buffer = percussionBuffer(context,sound.instrument,note.pitch,duration);
      else {
        voice.type = sound.synth === 'auto' ? (instruments.find(([name]) => name === sound.instrument)?.[1] ?? fallback[family]) : sound.synth;
        voice.frequency.value = 440 * 2 ** ((midi[note.pitch] - 69) / 12);
        if (guitar) {
          const harmonics = sound.instrument === 'Electric guitar' ? [0,1,.55,.26,.18,.07,.04] : [0,1,.34,.58,.23,.33,.12,.18,.09];
          voice.setPeriodicWave(context.createPeriodicWave(new Float32Array(harmonics.length),Float32Array.from(harmonics)));
        }
      }
      gain.gain.setValueAtTime(.001,start);
      gain.gain.exponentialRampToValueAtTime(.10 * volume / Math.sqrt(mixSize),start + Math.min(attack,duration * .3));
      if (guitar) gain.gain.exponentialRampToValueAtTime(.025 / Math.sqrt(mixSize),start + duration * .34);
      gain.gain.exponentialRampToValueAtTime(.001,start + duration * release);
      const pan = context.createStereoPanner();
      pan.pan.value = sound.pan ?? 0;
      const level = context.createGain();
      level.gain.value = sound.level ?? 1;
      voice.connect(gain).connect(level).connect(pan).connect(destination);
      voice.onended = () => { voice.disconnect(); gain.disconnect(); level.disconnect(); pan.disconnect(); };
      voice.start(start);
      voice.stop(start + duration);
      return voice;
    }

    function finishCapture() {
      clearTimeout(recordingTimer);
      stopMetronome(captureSession);
      if (captureSession?.recorder?.state === 'recording') captureSession.recorder.stop();
      else cancelCapture();
    }

    function releaseCaptureMeter(session) {
      if (!session?.meter) return;
      session.source.disconnect();
      if (analyser !== session.meter) return;
      cancelAnimationFrame(frame);
      frame = 0;
      session.meter.disconnect();
      analyser = undefined;
      app.removeAttribute('data-audio-active');
      drawWaveform('M0 21H640');
      hud.style.setProperty('--hud-level','0');
    }

    function cancelCapture() {
      const session = captureSession;
      captureSession = undefined;
      captureMode = undefined;
      clearTimeout(recordingTimer);
      if (session?.recorder?.state === 'recording') session.recorder.stop();
      session?.stream?.getTracks().forEach(input => input.stop());
      stopMetronome(session);
      releaseCaptureMeter(session);
      updateTransport();
    }

    async function beginCapture(mode) {
      cancelCapture();
      stopPlaying();
      const session = { index:track, tempo:bpm, drum:Boolean(percussion[partName()]), step:gridStep, vocalMode:app.querySelector('[data-vocal-mode]').value };
      captureSession = session;
      captureMode = mode;
      updateTransport();
      status.textContent = 'Allow microphone access to start.';
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
          throw new Error('Open the app from localhost in Chrome or Edge.');
        }
        audio ||= new AudioContext();
        await audio.resume();
        const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
        if (captureSession !== session) {
          stream.getTracks().forEach(input => input.stop());
          return;
        }
        session.stream = stream;
        const recorder = session.recorder = new MediaRecorder(stream);
        const chunks = [];
        const startBeat = range()[0];
        const beats = mode === 'monitor' ? 4 : 16;
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => {
          if (captureSession !== session) return;
          cancelCapture();
          status.textContent = 'The microphone recording could not be read.';
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach(input => input.stop());
          stopMetronome(session);
          releaseCaptureMeter(session);
          if (captureSession !== session) return;
          updateTransport();
          try {
            const bytes = await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer();
            const take = await audio.decodeAudioData(bytes);
            if (captureSession !== session) return;
            captureSession = undefined;
            captureMode = undefined;
            const input = take.getChannelData(0);
            if (mode === 'record') { checkpoint(); originalTakes.set(session.index,take); }
            let corrected;
            if (mode === 'record' && session.vocalMode !== 'off' && !session.drum) {
              const tuned = tuneVoice(input,take.sampleRate,session.vocalMode);
              corrected = audio.createBuffer(1,tuned.length,take.sampleRate);
              corrected.copyToChannel(tuned,0);
            }
            const events = session.drum ? detectHits(input,take.sampleRate,session.tempo,beats,session.step) :
              quantizeTake(input,take.sampleRate,session.tempo,beats,detectPitch);
            const notes = events.map(note => ({...note,id:nextId++}));
            if (corrected) vocalTakes.set(session.index,corrected);
            if (!notes.length) {
              status.textContent = 'No clear notes detected. Try a steady hum close to the microphone.';
              if (mode === 'record') { view = 'voice'; queueSave(); }
              render();
              return;
            }
            if (mode === 'monitor') {
              status.textContent = 'Playing the mic test through ' + partName() + '.';
              await play('monitor',notes);
              return;
            }
            if (!corrected) vocalTakes.delete(session.index);
            const left = tracks[session.index].filter(note=>note.start<startBeat).map(note=>({...note,length:Math.min(note.length,startBeat-note.start)}));
            const endBeat = startBeat + beats;
            const right = tracks[session.index].filter(note=>note.start+note.length>endBeat).map(note=>{
              if (note.start>=endBeat) return note;
              return {...note,id:nextId++,start:endBeat,length:note.start+note.length-endBeat};
            });
            tracks[session.index] = [...left,...notes.map(note=>({...note,start:note.start+startBeat})),...right];
            selectOne(notes[0].id);
            queueSave();
            view = 'edit';
            status.textContent = notes.length + ' notes detected. Check the piano roll.';
            render();
          } catch {
            cancelCapture();
            status.textContent = 'The take could not be analysed. Try again.';
          }
        };
        recorder.start();
        if (mode === 'record') startMetronome(session,beats);
        session.source = audio.createMediaStreamSource(stream);
        session.meter = audio.createAnalyser();
        session.meter.fftSize = 512;
        session.source.connect(session.meter);
        analyser = session.meter;
        updateTransport();
        watchWaveform();
        recordingTimer = setTimeout(finishCapture,beats * 60000 / session.tempo);
        status.textContent = session.drum ? 'Recording now. Tap or clap the rhythm.' : 'Recording now. Hum one note at a time.';
      } catch (error) {
        if (captureSession !== session) return;
        cancelCapture();
        status.textContent = error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser and try again.' : 'Microphone unavailable. Check your input device and open the localhost address.';
      }
    }


    function projectSnapshot() {
      return {
        format:'cg-ai',version:1,song,bpm,track,zoom,view,volume,
        tracks,sounds,beatCount,sections,sectionIndex,lyrics,brief,originals:takeList(originalTakes),
        metronome:app.querySelector('[data-metronome]').checked,
        vocalMode:app.querySelector('[data-vocal-mode]').value,
        vocals:[...vocalTakes].map(([index,buffer]) => ({
          track:index,rate:buffer.sampleRate,samples:buffer.getChannelData(0)
        }))
      };
    }

    function restoreProject(project) {
      const {format,version,tracks:savedTracks,sounds:savedSounds,vocals} = project;
      const savedBeats = project.beatCount ?? 16;
      if (!Number.isInteger(savedBeats) || savedBeats < 16 || savedBeats > 128 || savedBeats % 16) throw new Error('Invalid arrangement length.');
      const validSound = sound => sound && catalog.some(([,names])=>names.includes(sound.instrument)) &&
        Object.hasOwn(styles,sound.style) && Object.hasOwn(synths,sound.synth) &&
        (sound.level === undefined || Number.isFinite(sound.level) && sound.level >= 0 && sound.level <= 1) &&
        (sound.pan === undefined || Number.isFinite(sound.pan) && Math.abs(sound.pan) <= 1) &&
        (sound.attack === undefined || Number.isFinite(sound.attack) && sound.attack >= 0 && sound.attack <= .25) &&
        (sound.release === undefined || Number.isFinite(sound.release) && sound.release >= .4 && sound.release <= 1);
      if (format !== 'cg-ai' || version !== 1 || !Array.isArray(savedTracks) || !Array.isArray(savedSounds) ||
          !savedTracks.length || savedTracks.length > instruments.length || savedSounds.length !== savedTracks.length ||
          !savedSounds.every(validSound) || !Array.isArray(vocals) || vocals.length > savedTracks.length ||
          typeof project.song !== 'string' || project.song.length > 80 || !Number.isInteger(project.bpm) ||
          project.bpm < 40 || project.bpm > 240) {
        throw new Error('Invalid project.');
      }
      let id = 1;
      const restored = savedTracks.map(notes => {
        if (!Array.isArray(notes) || notes.length > savedBeats * 4) throw new Error('Invalid notes.');
        let end = 0;
        return notes.map(note => {
          if (!note || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch >= pitches.length ||
              !Number.isFinite(note.start) || !Number.isFinite(note.length) ||
              !Number.isInteger(note.start * 4) || !Number.isInteger(note.length * 4) ||
              note.start < end || note.length < .25 || note.length > 4 || note.start + note.length > savedBeats) {
            throw new Error('Invalid note position.');
          }
          end = note.start + note.length;
          return {id:id++,pitch:note.pitch,start:note.start,length:note.length,color:isColor(note.color)?note.color:undefined};
        });
      });
      function readTakes(takes) {
      const recordings = new Map();
      for (const take of takes) {
        const {track:index,rate,samples} = take;
        if (!Number.isInteger(index) || index < 0 || index >= restored.length || recordings.has(index) ||
            !Number.isInteger(rate) || rate < 8000 || rate > 192000 || !(samples instanceof Float32Array) ||
            !samples.length || samples.length > rate * 25 || !samples.every(Number.isFinite)) {
          throw new Error('Invalid vocal take.');
        }
        const buffer = new AudioBuffer({numberOfChannels:1,length:samples.length,sampleRate:rate});
        buffer.copyToChannel(samples,0);
        recordings.set(index,buffer);
      }
      return recordings;
      }
      const recordings = readTakes(vocals);
      const originals = readTakes(project.originals || []);
      cancelCapture();
      stop();
      beatCount = savedBeats;
      sections = Array.from({length:beatCount/16},(_,i)=>typeof project.sections?.[i] === 'string' ? project.sections[i].slice(0,60) : 'Section '+(i+1));
      sectionIndex = Number.isInteger(project.sectionIndex) && sections[project.sectionIndex] ? project.sectionIndex : 0;
      lyrics = sections.map((_,i)=>typeof project.lyrics?.[i] === 'string' ? project.lyrics[i].slice(0,10000) : '');
      brief = typeof project.brief === 'string' ? project.brief.slice(0,2000) : '';
      originalTakes.clear();
      for (const [index,buffer] of originals) originalTakes.set(index,buffer);
      tracks.splice(0,tracks.length,...restored);
      sounds.splice(0,sounds.length,...savedSounds);
      vocalTakes.clear();
      for (const [index,buffer] of recordings) vocalTakes.set(index,buffer);
      song = project.song.trim() || 'Untitled song';
      bpm = project.bpm;
      setVolume(Number.isFinite(project.volume) ? Math.min(1,Math.max(0,project.volume)) : .8);
      track = Number.isInteger(project.track) && restored[project.track] ? project.track : 0;
      selectOne(tracks[track][0]?.id);
      nextId = id;
      clipboard = undefined;
      zoom = Number.isFinite(project.zoom) ? Math.max(1,project.zoom) : 1;
      view = ['capture','edit','score','creator','lyrics','producer','voice','mixer','library','export'].includes(project.view) ? project.view : 'edit';
      bpmInput.value = bpm;
      app.querySelector('[data-metronome]').checked = Boolean(project.metronome);
      app.querySelector('[data-vocal-mode]').value = ['off','chromatic','major'].includes(project.vocalMode) ? project.vocalMode : 'off';
      for (const name of app.querySelectorAll('[data-song-name]')) name.textContent = song;
      for (const input of app.querySelectorAll('[data-title-input]')) input.value = song;
      render();
    }

    async function saveProject(button) {
      button.disabled = true;
      try {
        await CGProjects.save(projectSnapshot());
        projectStatus.dataset.saveState = 'saved';
        projectStatus.textContent = 'Saved in this browser.';
      } catch {
        projectStatus.dataset.saveState = 'error';
        projectStatus.textContent = 'Browser save failed. Use Save Locally to download your project.';
      } finally {
        button.disabled = false;
      }
    }

    function download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    }

    const fileStem = () => song.replace(/[^a-z0-9 _-]/gi,'').trim() || 'CG.AI Song';

    async function exportWav(button, onlyTrack) {
      const details = button.closest('[data-audio-export]').querySelector('[data-export-details]');
      const active = tracks.map((notes,index) => ({notes,sound:sounds[index]})).filter((part,index) => part.notes.length && (onlyTrack === undefined ? canHear(index) : index === onlyTrack));
      if (!active.length) {
        details.textContent = 'Add notes to a track first.';
        return;
      }
      const name = fileStem() + (onlyTrack === undefined ? '' : ' - '+partName());
      const secondsPerBeat = 60 / bpm;
      button.disabled = true;
      details.textContent = 'Rendering WAV…';
      try {
        const sampleRate = 44100;
        const context = new OfflineAudioContext(2,Math.ceil((beatCount * secondsPerBeat + .1) * sampleRate),sampleRate);
        const output = context.createGain();
        output.gain.value = volume;
        output.connect(context.destination);
        for (const {notes,sound} of active) {
          for (const note of notes) scheduleNote(context,output,note,sound,note.start * secondsPerBeat,note.length * secondsPerBeat,onlyTrack === undefined ? tracks.length : 1);
        }
        const rendered = await context.startRendering();
        download(new Blob([CGStudio.stereoWav(rendered,sampleRate)],{type:'audio/wav'}),name + '.wav');
        details.textContent = 'Downloaded ' + name + '.wav';
      } catch {
        details.textContent = 'Could not render the WAV. Try again in Chrome or Edge.';
      } finally {
        button.disabled = false;
      }
    }

    function exportPart() {
      const escape = value => value.replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[character]);
      const drum = percussion[partName()];
      const segments = notationSegments(tracks[track]);
      let measures = '';
      for (let bar = 0; bar < beatCount / 4; bar++) {
        const clef = drum ? '<sign>percussion</sign>' : '<sign>G</sign><line>2</line>';
        let content = bar ? '' : '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef>'+clef+'</clef></attributes><direction><sound tempo="' + bpm + '"/></direction>';
        for (const note of segments.filter(item => Math.floor(item.start / 4) === bar)) {
          const pitch = pitches[note.pitch];
          const sound = note.rest ? '<rest/>' : drum ? '<unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>' :
            '<pitch><step>'+pitch[0]+'</step><octave>'+pitch[1]+'</octave></pitch>';
          const ties = drum ? [] : [note.tieStop && 'stop',note.tieStart && 'start'].filter(Boolean);
          const instrument = drum && !note.rest ? '<instrument id="P1-I1"/>' : '';
          content += '<note>'+sound+'<duration>'+note.length*4+'</duration>'+
            ties.map(tie=>'<tie type="'+tie+'"/>').join('')+instrument+
            '<type>'+note.type+'</type>'+(note.dot?'<dot/>':'')+
            (ties.length?'<notations>'+ties.map(tie=>'<tied type="'+tie+'"/>').join('')+'</notations>':'')+'</note>';
        }
        measures += '<measure number="' + (bar + 1) + '">' + content + '</measure>';
      }
      const instrument = drum ? '<score-instrument id="P1-I1"><instrument-name>'+escape(partName())+'</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>10</midi-channel><midi-unpitched>'+drum[0]+'</midi-unpitched></midi-instrument>' : '';
      const xml = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>'+escape(song)+'</work-title></work><part-list><score-part id="P1"><part-name>'+escape(partName())+'</part-name>'+instrument+'</score-part></part-list><part id="P1">'+measures+'</part></score-partwise>';
      download(new Blob([xml],{type:'application/vnd.recordare.musicxml+xml'}),fileStem()+' - '+partName()+'.musicxml');
    }

    function insert(copy, afterBeat, step = .25) {
      const beats = Array.from({length:beatCount / step}, (_,i) => (afterBeat + i * step) % beatCount);
      const start = beats.find(beat => fitsAt({length:copy.length},beat));
      if (start === undefined) {
        status.textContent = 'No room in these four bars. Shorten or cut a note to make space.';
        return;
      }
      placeNote(copy,start);
    }

    function placeNote(copy,start) {
      const notes = tracks[track];
      const item = { ...copy, id:nextId++, start };
      notes.push(item);
      notes.sort((left,right) => left.start - right.start);
      selectOne(item.id);
      status.textContent = pitches[item.pitch] + ' inserted at bar ' + (Math.floor(start / 4) + 1) + ', beat ' + (start % 4 + 1) + '.';
    }

    function addNoteAtPoint(event, roll) {
      const {left,top,width,height} = roll.getBoundingClientRect();
      const start = Math.floor((event.clientX - left) / width * beatCount / gridStep) * gridStep;
      const pitch = pitches.length - 1 - Math.floor((event.clientY - top) / height * pitches.length);
      if (!Number.isFinite(start) || !Number.isInteger(pitch) ||
          start < 0 || start >= beatCount || pitch < 0 || pitch >= pitches.length) return;
      if (!fitsAt({length:gridStep},start)) {
        status.textContent = 'That beat already has a note on this track. Choose a free beat.';
        return;
      }
      stop();
      placeNote({pitch,length:gridStep},start);
      render();
      roll.querySelector('[data-note="' + selected + '"]')?.focus();
    }

    function selectTrack(index) {
      cancelCapture();
      stop();
      track = index;
      selectOne(tracks[track][0]?.id);
    }

    app.addEventListener('contextmenu',event => {
      if (event.target.closest('.cg-notes') || document.elementFromPoint(event.clientX,event.clientY)?.closest('.cg-notes')) event.preventDefault();
    });
    app.addEventListener('pointerdown', event => {
      if (sounds[track].locked && (event.target.closest('.cg-notes') || event.target.closest('[data-resize]'))) return;
      if (event.button === 2 && !drag && event.target.closest('.cg-notes')) {
        event.preventDefault();
        stop();
        checkpoint();
        erase = {pointer:event.pointerId,x:event.clientX,y:event.clientY};
        app.setPointerCapture(event.pointerId);
        eraseThrough(event);
        return;
      }
      const handle = event.target.closest('[data-resize]');
      const body = event.target.closest('.cg-note');
      if ((!handle && !body) || event.button !== 0 || event.shiftKey || drag) return;
      const note = tracks[track].find(item => item.id === Number(handle?.dataset.resize ?? body.dataset.note));
      if (!note) return;
      const score = handle?.closest('.cg-score');
      const bounds = (handle || body).closest('.cg-notes')?.getBoundingClientRect();
      const beatWidth = score ? score.getBoundingClientRect().width * 22 / (74 + beatCount*22) : bounds.width / beatCount;
      if (beatWidth <= 0) return;
      event.preventDefault();
      stop();
      if (handle || !group.has(note.id)) selectOne(note.id);
      else selected = note.id;
      checkpoint();
      drag = { pointer:event.pointerId, x:event.clientX, y:event.clientY, note, beatWidth,
        rowHeight:bounds?.height / pitches.length, resizing:Boolean(handle), length:note.length,
        members:selectedNotes().map(item=>({note:item,start:item.start,pitch:item.pitch})) };
      app.setPointerCapture(event.pointerId);
      render();
    });
    app.addEventListener('pointermove', event => {
      if (erase?.pointer === event.pointerId) {
        if (event.buttons & 2) eraseThrough(event);
        else erase = undefined;
        return;
      }
      if (drag?.pointer !== event.pointerId) return;
      const { note,length,x,y,beatWidth,rowHeight,resizing,members } = drag;
      const beatDelta = Math.round((event.clientX - x) / beatWidth / gridStep) * gridStep;
      if (resizing) {
        const target = Math.max(.25,Math.min(maxLength(note),length + beatDelta));
        if (target !== note.length) {
          setLength(note,target);
          render();
        }
        return;
      }
      const pitchesDelta = -Math.round((event.clientY-y)/rowHeight);
      const ids = new Set(members.map(member=>member.note.id));
      const others = tracks[track].filter(item=>!ids.has(item.id));
      const moved = members.map(member=>({
        note:member.note,start:member.start+beatDelta,pitch:member.pitch+pitchesDelta
      }));
      if (moved.some(item=>item.pitch<0 || item.pitch>=pitches.length || item.start<0 ||
          item.start+item.note.length>beatCount || others.some(other=>item.start<other.start+other.length &&
          item.start+item.note.length>other.start))) return;
      if (moved.every(item=>item.start===item.note.start && item.pitch===item.note.pitch)) return;
      for (const item of moved) { item.note.start = item.start; item.note.pitch = item.pitch; }
      tracks[track].sort((a,b) => a.start - b.start);
      status.textContent = members.length>1 ? members.length+' notes moved.' : pitches[note.pitch]+' moved.';
      render();
    });
    const endDrag = event => {
      if (drag?.pointer === event.pointerId || erase?.pointer === event.pointerId) queueSave();
      if (drag?.pointer === event.pointerId) drag = undefined;
      if (erase?.pointer === event.pointerId) erase = undefined;
    };
    app.addEventListener('pointerup',endDrag);
    app.addEventListener('pointercancel',endDrag);
    app.addEventListener('lostpointercapture',endDrag);

    app.addEventListener('click', event => {
      const button = event.target.closest('button');
      const scoreNote = event.target.closest('[data-score-note]');
      if (scoreNote) {
        selectOne(Number(scoreNote.dataset.scoreNote));
        render();
      }
      if (!button) {
        const roll = event.target.closest('.cg-notes');
        if (roll && !event.shiftKey && !sounds[track].locked) { checkpoint(); addNoteAtPoint(event,roll); queueSave(); }
        return;
      }
      if (button.disabled) return;
      const { action, view:nextView, track:nextTrack, note:noteId } = button.dataset;
      if (button.dataset.lockTrack !== undefined) { toggleTrackLock(Number(button.dataset.lockTrack)); return; }
      if (['copy-notes','cut','paste','delete-notes'].includes(action)) { editSelection(action); return; }
      const noteChange = ['take','add-note','lower','raise','shorten','lengthen','duplicate','split-note','merge-note'].includes(action) || button.dataset.drumStep !== undefined;
      if (sounds[track].locked && (noteChange || action === 'record')) { status.textContent = 'Unlock this track to change its notes.'; return; }
      if (noteChange || ['add-track','add-drum-track','generate-harmony'].includes(action)) { checkpoint(); queueSave(); }
      if (workspaceAction(action,button)) return;
      if (action === 'transport-play') {
        const start = pausedBeat;
        cancelCapture();
        play('play-all',[],start);
        return;
      }
      if (action === 'transport-pause') {
        const beat = transportBeat();
        stop();
        pausedBeat = beat;
        setPlayhead(beat,true);
        updateTransport();
        return;
      }
      if (action === 'transport-stop') { stop(); return; }
      if (action === 'fullscreen') {
        const change = document.fullscreenElement ? document.exitFullscreen() : app.requestFullscreen?.();
        change?.catch(() => { status.textContent = 'Full screen is unavailable in this browser window.'; });
        return;
      }
      if (button.dataset.drumStep !== undefined ||
          ['audition-sound','audition-drum','add-drum-track','generate-harmony'].includes(action)) {
        useStudioAction(action,button);
        return;
      }
      if (action === 'save-project') { saveProject(button); return; }
      if (action === 'save-project-file') {
        try {
          const project = CGProjects.pack(projectSnapshot());
          download(new Blob([project],{type:'application/json'}),fileStem() + '.cgai');
          projectStatus.textContent = 'Project file downloaded.';
        } catch {
          projectStatus.textContent = 'The project file could not be created.';
        }
        return;
      }
      if (action === 'open-project') { projectFile.click(); return; }
      if (action === 'record') { if (captureMode === 'record') finishCapture(); else beginCapture('record'); return; }
      if (action === 'play' || action === 'play-all') { cancelCapture(); play(action); return; }
      if (action === 'play-vocal') { play('vocal'); return; }
      if (action === 'export-vocal') {
        const take = vocalTakes.get(track);
        if (take) download(new Blob([encodeWav(take.getChannelData(0),take.sampleRate)],{type:'audio/wav'}),fileStem() + ' - tuned voice.wav');
        return;
      }
      if (action === 'export-wav') { exportWav(button); return; }
      if (action === 'export-score') { exportPart(); return; }
      if (nextView) { cancelCapture(); view = nextView; if (view === 'library') renderVersions(); queueSave(); }
      if (nextTrack !== undefined) selectTrack(Number(nextTrack));
      if (noteId !== undefined) {
        const id = Number(noteId);
        if (event.shiftKey) {
          const ids = new Set(selectedNotes().map(note=>note.id));
          if (ids.has(id)) ids.delete(id);
          else ids.add(id);
          setSelection(ids,id);
        } else selectOne(id);
      }
      if (action === 'add-track' && tracks.length < instruments.length) {
        tracks.push([]);
        sounds.push(soundFor(tracks.length - 1));
        selectTrack(tracks.length - 1);
        status.textContent = partName() + ' track added. Open Edit notes to enter notes by hand, or record a melody.';
      }
      if (action === 'take') {
        cancelCapture();
        stop();
        tracks[track] = sample(track).map(note=>({...note,start:note.start+range()[0]}));
        selectOne(tracks[track][0].id);
        view = 'edit';
        status.textContent = partName() + ' sample take loaded.';
      }
      const note = currentNote();
      if (action === 'add-note') {
        stop();
        const nextBeat = note ? Math.ceil((note.start + note.length) / gridStep) * gridStep : 0;
        insert({pitch:note?.pitch ?? 0,length:gridStep},nextBeat,gridStep);
      }
      if (note && ['lower','raise','shorten','lengthen','duplicate'].includes(action)) {
        stop();
        if (action === 'lower' || action === 'raise') {
          note.pitch += action === 'raise' ? 1 : -1;
          status.textContent = 'Note set to ' + pitches[note.pitch] + '.';
        }
        if (action === 'shorten' || action === 'lengthen') setLength(note,note.length + (action === 'shorten' ? -gridStep : gridStep));
        if (action === 'duplicate') insert(note, note.start + note.length);
      }
      if (action === 'split-note' && note && note.length >= .5) {
        stop();
        const length = Math.floor(note.length * 2) / 4;
        const tail = {...note,id:nextId++,start:note.start+length,length:note.length-length};
        note.length = length;
        tracks[track].splice(tracks[track].indexOf(note)+1,0,tail);
        status.textContent = 'Note split in two.';
      }
      if (action === 'merge-note' && note) {
        const next = tracks[track].find(item=>item.start===note.start+note.length);
        if (next && next.pitch === note.pitch && next.length + note.length <= 4) {
          stop();
          note.length += next.length;
          tracks[track] = tracks[track].filter(item=>item!==next);
          status.textContent = 'Adjacent notes merged.';
        } else status.textContent = 'Select a note followed by another note at the same pitch.';
      }
      if (action === 'preview') {
        preview = !preview;
        button.setAttribute('aria-pressed',preview);
        button.textContent = preview ? 'Close preview' : 'Print preview';
      }
      render();
      if (noteId !== undefined) app.querySelector('[data-note="'+noteId+'"]')?.focus();
      if (nextTrack !== undefined) app.querySelector('[data-track="'+nextTrack+'"]')?.focus();
      if (action === 'take' && app.matches('.cg-capture')) app.querySelector('[data-pane="edit"] [data-action="play"]').focus();
    });
    projectFile.addEventListener('change',async () => {
      const file = projectFile.files[0];
      projectFile.value = '';
      if (!file) return;
      try {
        if (file.size > 430_000_000) throw new Error('File too large.');
        restoreProject(CGProjects.unpack(await file.text()));
        projectStatus.textContent = 'Project opened. Use Save to keep it in this browser.';
      } catch {
        projectStatus.textContent = 'This file could not be opened as a CG.AI project.';
      }
    });
    trackPicker.addEventListener('change', event => {
      selectTrack(Number(event.target.value));
      render();
    });
    app.addEventListener('change', event => {
      const field = event.target;
      if (field.matches('[data-metronome]')) queueSave();
      if (field.matches('[data-track-color]') && isColor(field.value)) {
        checkpoint();
        sounds[track].color = field.value;
        render();
        queueSave();
      }
      if (field.matches('[data-note-color]') && !sounds[track].locked) {
        checkpoint();
        for (const note of selectedNotes()) note.color = isColor(field.value)?field.value:undefined;
        render();
        queueSave();
      }
      if (field.matches('[data-section-select]')) { sectionIndex = Number(field.value); render(); queueSave(); }
      if (field.matches('[data-section-name]')) { checkpoint(); sections[sectionIndex] = field.value.trim() || 'Section '+(sectionIndex+1); render(); queueSave(); }
      if (field.matches('[data-sound],[data-synth-wave],[data-vocal-mode]')) queueSave();
      if (field.matches('[data-studio-tool]')) {
        for (const panel of app.querySelectorAll('[data-tool-panel]')) panel.hidden = panel.dataset.toolPanel !== field.value;
      }
      if (field.matches('[data-drum-bar]')) renderTools();
      if (field.matches('[data-drum-sound]') && percussion[sounds[track].instrument]) {
        stop();
        sounds[track].instrument = field.value;
        render();
      }
      if (field.matches('[data-synth-wave]')) {
        sounds[track].synth = field.value;
        render();
      }
      if (field.matches('[data-sound]')) {
        stop();
        sounds[track][field.dataset.sound] = field.value;
        render();
      }
      if (field.matches('[data-show-steps]')) render();
      if (field.matches('[data-monitor]')) {
        if (field.checked) beginCapture('monitor');
        else { cancelCapture(); stop(); }
      }
      if (field.matches('[data-score-picker]')) {
        selectOne(Number(field.value) || undefined);
        render();
      }
      if (field.matches('[data-format]')) {
        field.closest('[data-audio-export]').querySelector('[data-export-details]').textContent = 'Full arrangement · ' + field.value.toUpperCase();
      }
    });
    document.addEventListener('keydown',event => {
      if (app.inert || event.defaultPrevented || event.repeat || event.altKey) return;
      if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      const modified = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (view === 'edit') {
        const action = modified ? {c:'copy-notes',x:'cut',v:'paste'}[key] : key === 'delete' ? 'delete-notes' : '';
        if (action) { event.preventDefault(); editSelection(action); return; }
        if (modified && key === 'a') {
          event.preventDefault();
          setSelection(tracks[track].map(note=>note.id),selected);
          render();
          return;
        }
      }
      if (event.code === 'Space' && event.target.closest?.('button,summary')) return;
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey) {
        if (captureMode) return;
        const action = playback === 'play-all' ? 'transport-pause' : 'transport-play';
        const button = app.querySelector('[data-action="'+action+'"]');
        if (button.disabled) return;
        event.preventDefault();
        button.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoEdit(event.shiftKey);
      }
    });
    document.addEventListener('fullscreenchange',() => {
      app.querySelector('[data-action="fullscreen"]').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    });
    app.addEventListener('input',event => {
      const field = event.target;
      if (field.matches('[data-version-search]')) { renderVersions(); return; }
      if (field.matches('[data-lyrics]')) { lyrics[sectionIndex] = field.value; queueSave(); return; }
      if (field.matches('[data-producer-brief]')) { brief = field.value; queueSave(); return; }
      if (field.matches('[data-track-gain],[data-track-pan]')) {
        const isPan = field.dataset.trackPan !== undefined;
        sounds[Number(isPan ? field.dataset.trackPan : field.dataset.trackGain)][isPan?'pan':'level'] = Number(field.value)/100;
        queueSave();
        return;
      }
      if (field.matches('[data-volume],[data-zoom],[data-title-input],[data-synth-attack],[data-synth-release]')) queueSave();
      if (field.matches('[data-volume]')) { setVolume(Number(field.value) / 100); return; }
      if (field.matches('[data-synth-attack]')) {
        sounds[track].attack = Number(field.value) / 1000;
        app.querySelector('[data-attack-value]').textContent = field.value + ' ms';
        return;
      }
      if (field.matches('[data-synth-release]')) {
        sounds[track].release = Number(field.value) / 100;
        app.querySelector('[data-release-value]').textContent = field.value + '%';
        return;
      }
      if (event.target.matches('[data-zoom]')) {
        zoom = Number(event.target.value);
        updateZoom();
        return;
      }
      if (!event.target.matches('[data-title-input]')) return;
      song = event.target.value.trim() || 'Untitled song';
      for (const name of app.querySelectorAll('[data-song-name]')) name.textContent = song;
    });
    bpmInput.addEventListener('change', () => {
      cancelCapture();
      stop();
      bpm = bpmInput.value ? Math.max(40,Math.min(240,Math.round(Number(bpmInput.value)))) : bpm;
      bpmInput.value = bpm;
      status.textContent = 'Arrangement tempo set to ' + bpm + ' BPM.';
      queueSave();
      render();
    });
    setVolume(volume);
    render();
    app.inert = true;
    CGProjects.load().then(project => {
      if (project) {
        restoreProject(project);
        if (view === 'library') renderVersions();
        projectStatus.dataset.saveState = 'saved';
        projectStatus.textContent = 'Saved project restored.';
      }
    }).catch(() => {
      projectStatus.textContent = 'Browser storage could not be loaded.';
    }).finally(() => { app.inert = false; });
  }
})();
