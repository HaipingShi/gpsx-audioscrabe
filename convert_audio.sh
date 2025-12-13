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
echo "说明："
echo "- WAV 格式是未压缩的，所以文件会比 MP3 大（MP3 是有损压缩）"
echo "- 16kHz 单声道 WAV 的比特率 = 16000 Hz × 16 bit × 1 = 256 kbps"
echo "- 源 MP3 是 128 kbps 压缩格式，所以 WAV 会大约 2 倍大小"
echo "- 这是正常的！转写需要未压缩格式以保证质量"
echo ""

# 1. Basic conversion: 16kHz, mono (recommended for transcription)
echo "[1/3] Converting to 16kHz mono WAV (basic)..."
ffmpeg -i "$INPUT_FILE" \
  -ar 16000 \
  -ac 1 \
  -y "$OUTPUT_DIR/72_16k_mono.wav"

# 2. With noise reduction: 16kHz, mono (better quality)
echo "[2/3] Converting with noise reduction (highpass + lowpass + denoise)..."
ffmpeg -i "$INPUT_FILE" \
  -ar 16000 \
  -ac 1 \
  -af "highpass=f=200, lowpass=f=3000, afftdn=nf=-25" \
  -y "$OUTPUT_DIR/72_16k_mono_denoised.wav"

# 3. FLAC compressed version (smaller file, lossless)
echo "[3/3] Creating FLAC compressed version (smaller, still lossless)..."
ffmpeg -i "$INPUT_FILE" \
  -ar 16000 \
  -ac 1 \
  -af "highpass=f=200, lowpass=f=3000, afftdn=nf=-25" \
  -compression_level 8 \
  -y "$OUTPUT_DIR/72_16k_mono_denoised.flac"

echo ""
echo "=== Conversion Complete ==="
echo "Output files saved in: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/" | grep -E "(72_16k|total)"
echo ""
echo "文件说明："
echo "- 72_16k_mono.wav: 基础转换（未压缩）"
echo "- 72_16k_mono_denoised.wav: 降噪版本（未压缩，推荐用于转写）"
echo "- 72_16k_mono_denoised.flac: 降噪+压缩版本（无损压缩，文件更小）"
echo ""
echo "推荐使用: 72_16k_mono_denoised.wav (质量最好) 或 .flac (文件更小)"

