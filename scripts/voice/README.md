# Local Korean voice pilot

Outputs are kept in ignored `artifacts/qwen-tts-local/`; runtimes and model caches are in ignored `.tmp/qwen-tts-local/`.

The pilot uses the user-selected existing synthetic Fish Audio male reference. It does reference-conditioned synthesis, not model fine-tuning. Neither application audio nor production data is replaced.

## Reproduce

Run from the repository root in PowerShell after installing `qwen-local-requirements.txt` into the isolated environment:

```powershell
& scripts/voice/run-qwen-local.ps1 -Action generate -Device cpu -Count 3 -ModelSize 1.7B
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/check-qwen-speech.py --model-size 1.7B
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/build-qwen-review.py
```

Model revisions and reference hashes are recorded in the sample manifests. Existing matching samples are reused. The resolved dependency list records the tested CPU environment; GPU inference has not been validated.

## Initial pilot status, before training (2026-10-30)

- Three samples each from 0.6B and 1.7B were generated and checked for valid, non-silent audio.
- `review.html` compares both models against the existing Fish clips.
- Local Whisper small diagnostics flag possible pronunciation issues for both models. The 1.7B first two sentences transcribe `임무` as `인물` and `폭언` as `포근`. ASR can also make errors on the Fish controls, so this is not a human quality rating.
- Do not treat this pilot as approved for bulk replacement. Listen to the samples and resolve pronunciation issues first.
- Training candidates contain 28 training and 4 validation clips, approximately 114 seconds total. They require pronunciation review; no fine-tuning has run.
- No paid service call, push, or deployment is part of this workflow.

## Local 1.7B custom training

The user subsequently authorized fine-tuning. `train-qwen-lora.py` applies rank-8 LoRA to the main talker's attention query/value projections, using the official Qwen dataset and combined codec/sub-talker SFT loss. It trains in CPU float32 and saves small adapters rather than duplicating the base model. This is a local adaptation of the official full-parameter GPU example, not an official Qwen LoRA recipe.

```powershell
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/train-qwen-lora.py prepare
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/train-qwen-lora.py train --epochs 3
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/train-qwen-lora.py generate
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/check-qwen-speech.py --model-size trained
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/build-qwen-review.py
```

Training uses 28 public-recruitment job clips; four separate clips select the lowest validation-loss epoch. The three listening comparison prompts are excluded from both splits. `lora-1p7b/status.json` records measured losses and the dataset hash. Run a fresh training invocation only when deliberately retraining: optimizer state is not resumed.

Inference merges the adapter in memory, installs the selected reference speaker embedding at token 3000 (matching the official CustomVoice export), and generates with `language=Auto`, matching the official dataset's language-neutral prefix. The earlier untrained comparison files use reference-conditioned cloning, so they differ in inference conditioning as well as trained weights. Listening and ASR comparisons are diagnostic, not a controlled proof of improvement. The approximately two-minute synthetic dataset supports an initial trial only; naturalness must be reviewed before bulk use.

The first three-epoch run completed on 2026-10-30 in approximately 367 seconds on CPU. Validation loss decreased from 14.4723 to 13.8487, 13.0745, and 12.2289; epoch 3 was selected. The 1,605,632 trainable parameters produced a 6,438,056-byte adapter. These measurements establish that training ran and fit the held-out codec targets better; they do not establish pronunciation or listening quality.

All three trained samples were generated, checked as finite non-silent PCM WAV files, and added to the comparison page. Post-training Whisper diagnostics still transcribe `임무` as `인물` and `폭언` as `포근`; do not mark the pronunciation issues resolved or start bulk app replacement from this result. The ASR report is `asr-spotcheck-trained.json`.
