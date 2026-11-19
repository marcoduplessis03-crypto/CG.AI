# CG.AI build plan

10 November 2026

CG.AI lets someone capture a musical idea with their microphone, edit it on an FL Studio–style piano roll, and export readable sheet music for each instrument.

## Build sequence

| Stage | Scope | Ready to move on when |
| --- | --- | --- |
| Phase 1A · Internal prototype | Local browser app. Record up to four bars of a hummed melody with one note at a time, a count-in and a chosen tempo. Convert after recording and play it back as piano. Move, resize, add and delete notes. | Across a small set of real takes, humming and correcting is typically faster than drawing the same notes manually, with a result the user recognises. |
| Phase 1B · Private pilot | Let invited users record and edit a melody with their own mic, save it and export a simple single-staff PDF. Start with 4/4 and common note values. | Testers complete the workflow on their own, and some come back with a second musical idea. A musician can read the exported part. |
| Phase 1C · Complete arrangement workflow | Pick instrument sounds, record parts against one another, and capture taps or claps to a chosen percussion lane. Add project save and reopen, PDF and MusicXML exports for the full score and individual parts. | We can record a small arrangement, correct it, reopen it, and give each player a usable part. Verify notation for every supported instrument, including clef, range and transposition where applicable. |
| Phase 2 · Hosted subscriptions | Host the tested browser app. Add accounts, cloud projects and billing once we have a clear paid offer. | The first paying users can subscribe, recover their projects and manage their plan. |
| Phase 3 · Desktop | Reuse the editor, project format and export logic. Test installation, microphone access and save/reopen on each supported system. | The same project opens and plays correctly across web and desktop. |
| Phase 4 · Mobile | Design for quick microphone capture and touch-friendly edits. Test with device microphones and continue projects on larger screens. | A mobile take can be opened, edited and exported through the same project workflow. |

## First build checklist

- [ ] Make a four-bar 4/4 piano roll with tempo, count-in, playback and manual note editing. Use one project representation for notes, timing and instrument choice so playback and notation read the same edits.
- [ ] Capture a short microphone take locally. Show when the microphone is recording and let the user retry a take.
- [ ] Turn the recording into editable notes with a start beat, duration and pitch. Keep the take available for comparison while testing.
- [ ] Collect short reference takes with steady notes, repeated pitches, pauses, slides, quiet voices and ordinary laptop-mic noise.
- [ ] Time the same task two ways on several phrases. Record and correct a take, then enter equivalent notes by hand. Alternate which method goes first and log missing, extra and misplaced notes.
- [ ] Add single-staff PDF export once recording and editing are usable. Check that playback and notation agree and that measures, rests and ties are readable.
- [ ] Invite 10–20 people who already write or arrange music. Start with songwriters and small-ensemble arrangers who sometimes need to hand a part to someone else.

## Pilot and pricing test

The internal prototype tests capture speed. The private pilot adds a PDF so testers can finish a real job. Track signups, first successful record/edit/export, return use within two weeks, and paid take-up separately. Ask users to bring their own melody and follow up about whether they used the export.

Run the private pilot free. Once people can save projects and reliably export parts, test a £7.99/month founding offer. ScoreCloud already includes monophonic voice notation on its free plan and lists Plus at $5.99 and Songwriter at $11.99 per month in USD. The offer to test is a faster workflow from an idea to an editable, shareable part. [ScoreCloud plan comparison](https://scorecloud.com/plans-comparison-chart/)

| Active paid subscribers | Gross monthly billings at £7.99 |
| ---: | ---: |
| 10 | £79.90 |
| 50 | £399.50 |
| 100 | £799 |
| 500 | £3,995 |
| 1,000 | £7,990 |

Illustrative funnel only. If 500 relevant people see the demo, 100 sign up, 50 finish a first project and 10 pay, that yields £79.90 per month while all 10 remain subscribed. The inputs are assumptions. Figures are before fees, refunds, applicable taxes and operating costs.

A strong early signal would be seeing people return with new music and some accept a real paid offer. If users convert a melody once and rarely return, test whether the workflow fits occasional use better than a monthly subscription before expanding billing.
