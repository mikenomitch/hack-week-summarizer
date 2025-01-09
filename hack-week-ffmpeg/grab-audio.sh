#!/bin/sh

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
  OUTPUT_DIR="$(dirname "$INPUT_FILE")"
fi

mkdir -p "$OUTPUT_DIR"

# Extract audio to mp3 format
ffmpeg -i "$INPUT_FILE" -vn -acodec libmp3lame -q:a 2 "$OUTPUT_DIR/${NAME_NO_EXT}.mp3"
