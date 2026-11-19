# CG.AI

A local browser music studio for capturing a hummed melody or tapped rhythm, editing instrument parts, and exporting music.

## Run locally

Python 3 is required to serve the files. From PowerShell in this folder, run:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/ in Chrome or Edge and allow microphone access when requested. Keep the terminal open. Press Ctrl+C to stop the server.

## Included

- Microphone capture, note transcription, percussion detection and experimental vocal pitch correction.
- Up to eight tracks, piano-roll note entry, movement, resizing, group selection and keyboard editing.
- Track colours and note locks, drum sequencing, synth controls and local harmony suggestions.
- Playback, pause, master volume, track mixer, waveform and playhead.
- Named song sections, lyrics, browser autosave, project files and version snapshots.
- WAV, MIDI, MusicXML, lyrics and project export, plus a printable score view.

## Current limitations

This is a development prototype. Generated backing ideas use local musical rules. External full-song generation and virtual singers need a model integration. Transcription uses a limited pitch range and a C-major note set. Audio processing, notation layout and browser interactions need further testing.

Browser saves belong to the current browser and site address. Download a .cgai project file to keep a portable copy. Microphone recordings stay in the browser and can be included in saved project files.

## Source files

- index.html — studio screens and controls.
- styles.css — layout, themes and animation.
- app.js — project interactions, playback, recording and export.
- audio.js — pitch detection, percussion and vocal processing.
- studio.js — candidate generation, MIDI and stereo WAV.
- projects.js — browser storage and project file encoding.
- BUILD_PLAN.md — initial project phases.

## Development status

The application has no hosted account system, subscription billing or production deployment yet. Repository access and licensing should be chosen before distributing the project.
