#!/usr/bin/env bash

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input_file> [output_directory]"
  exit 1
fi

INPUT_FILE="$1"

if [ -n "$2" ]; then
  OUTPUT_DIR="$2"
else
  BASENAME="$(basename "$INPUT_FILE")"
  NAME_NO_EXT="${BASENAME%.*}"
  OUTPUT_DIR="$(dirname "$INPUT_FILE")/${NAME_NO_EXT}_frames"
fi

mkdir -p "$OUTPUT_DIR"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT_FILE")
INTERVAL=$(echo "$DURATION / 20" | bc -l)

for i in $(seq 0 19); do
  TIMESTAMP=$(echo "$i * $INTERVAL" | bc -l)
  printf -v PADDED "%02d" "$i"
  ffmpeg -ss "$TIMESTAMP" -i "$INPUT_FILE" -frames:v 1 "$OUTPUT_DIR/out_${PADDED}.png"
done
