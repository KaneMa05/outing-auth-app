"""Explicit one-time model setup; subsequent transcriptions are fully offline."""
import argparse
import json
import os
from pathlib import Path
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["setup", "transcribe", "check"])
    parser.add_argument("--model", required=True)
    parser.add_argument("--audio")
    parser.add_argument("--pass", dest="attempt", type=int, default=0)
    args = parser.parse_args()
    from faster_whisper import WhisperModel
    model_path = Path(args.model).resolve()
    if args.action == "setup":
        from huggingface_hub import snapshot_download
        # Pin model weights to an immutable Hugging Face commit, not a moving branch.
        snapshot_download("Systran/faster-whisper-small", revision="536b0662742c02347bc0e980a01041f333bce120", local_dir=str(model_path))
    os.environ["HF_HUB_OFFLINE"] = "1"
    model = WhisperModel(str(model_path), device="cpu", compute_type="int8", local_files_only=True, cpu_threads=min(8, os.cpu_count() or 1))
    if args.action in ("setup", "check"):
        # Actually execute the decoder; do not infer readiness from a file's existence.
        import numpy as np
        segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32), language="ko", beam_size=1, vad_filter=False)
        list(segments)
        if args.audio:
            segments, _ = model.transcribe(args.audio, language="ko", beam_size=5, temperature=0, vad_filter=True)
            text = " ".join(segment.text.strip() for segment in segments)
            if not any("가" <= char <= "힣" for char in text):
                raise ValueError("korean_speech_check_failed")
        print(json.dumps({"ok": True, "model": "small", "device": "cpu", "compute": "int8"}))
        return
    if args.attempt not in (0, 1) or not args.audio:
        raise ValueError("invalid_request")
    segments, _ = model.transcribe(args.audio, language="ko", beam_size=5 if args.attempt == 0 else 3,
                                   temperature=0, vad_filter=True, condition_on_previous_text=False)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    if not text or len(text) > 12000:
        raise ValueError("transcription_unavailable")
    print(json.dumps({"text": text}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("speech_setup_or_transcription_failed", file=sys.stderr)
        sys.exit(1)
