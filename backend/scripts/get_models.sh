#!/usr/bin/env bash
# Downloads the speech models (about 520 MB) into backend/models: Parakeet (speech-to-text),
# Silero (finds pauses) and TitaNet (voice prints). Run once per machine, from anywhere.
set -euo pipefail
cd "$(dirname "$0")/../models" 2>/dev/null || { mkdir -p "$(dirname "$0")/../models" && cd "$(dirname "$0")/../models"; }
base=https://github.com/k2-fsa/sherpa-onnx/releases/download
if [ ! -d sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8 ]; then
  curl -sSLO "$base/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2"
  tar xjf sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2 && rm sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
fi
[ -f silero_vad.onnx ] || curl -sSLO "$base/asr-models/silero_vad.onnx"
[ -f nemo_en_titanet_small.onnx ] || curl -sSLO "$base/speaker-recongition-models/nemo_en_titanet_small.onnx"
echo "Models ready in $(pwd)"
ls
