#!/usr/bin/env bash
# Build a synthetic two-voice visit from a "D|…" / "P|…" script with macOS `say`.
# Writes <name>.wav (16 kHz mono), <name>.m4a (like Safari) and <name>.webm (like Chrome).
# Usage: scripts/make_sample.sh samples/neuro_visit.txt
set -euo pipefail

script="$1"
name="${script%.txt}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

i=0
: >"$work/list.txt"
while IFS='|' read -r who text; do
  [[ -z "$who" ]] && continue
  voice="Samantha"
  [[ "$who" == "D" ]] && voice="Daniel"
  i=$((i + 1))
  say -v "$voice" -o "$work/$i.aiff" "$text"
  # A short pause between speakers, as in a real conversation.
  ffmpeg -loglevel error -y -i "$work/$i.aiff" -af "apad=pad_dur=0.6" -ar 16000 -ac 1 "$work/$i.wav"
  echo "file '$work/$i.wav'" >>"$work/list.txt"
done <"$script"

ffmpeg -loglevel error -y -f concat -safe 0 -i "$work/list.txt" -ar 16000 -ac 1 "$name.wav"
# Fragmented MP4, as Safari's MediaRecorder writes it.
ffmpeg -loglevel error -y -i "$name.wav" -c:a aac -b:a 64k -movflags +frag_keyframe+empty_moov "$name.m4a"
ffmpeg -loglevel error -y -i "$name.wav" -c:a libopus -b:a 32k "$name.webm"
echo "Wrote $name.wav, $name.m4a, $name.webm"
