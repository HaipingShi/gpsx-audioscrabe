#!/bin/bash

# Audio conversion script for AudioScribe FLUX
# Converts audio to optimal format: 16kHz, mono, with optional noise reduction

INPUT_FILE="72.MP3"
OUTPUT_DIR="converted"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "=== Audio Conversion Script ==="
echo "Input file: $INPUT_FILE"
echo ""

# 1. Basic conversion: 16kHz, mono (recommended for transcription)
echo "[1/2] Converting to 16kHz mono WAV (basic)..."
ffmpeg -i "$INPUT_FILE" \
  -ar 16000 \
  -ac 1 \
  -y "$OUTPUT_DIR/72_16k_mono.wav"

# 2. With noise reduction: 16kHz, mono (better quality)
echo "[2/2] Converting with noise reduction (highpass + lowpass + denoise)..."
ffmpeg -i "$INPUT_FILE" \
  -ar 16000 \
  -ac 1 \
  -af "highpass=f=200, lowpass=f=3000, afftdn=nf=-25" \
  -y "$OUTPUT_DIR/72_16k_mono_denoised.wav"

echo ""
echo "=== Conversion Complete ==="
echo "Output files saved in: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/"
echo ""
echo "Recommended for transcription: 72_16k_mono_denoised.wav"

