`qwen_dataset.py` is the unmodified official Qwen3-TTS `finetuning/dataset.py`, downloaded on 2026-10-30.

Source: https://github.com/QwenLM/Qwen3-TTS/blob/main/finetuning/dataset.py

Copyright 2026 The Alibaba Qwen team. Licensed under Apache-2.0; see the source header.

SHA256 of the downloaded Windows UTF-8 file: `53aa08554e30da0567d2c690526d01c459abd863910732c72680d6a52dca4673`.

The local training loop follows the official `finetuning/sft_12hz.py` loss and conditioning construction, with CPU eager attention and LoRA adapters in place of full-model GPU training. Its downloaded reference SHA256 was `3f96ad38d39c14b63520ea448b4de5741dddd089b376fe874e71a0676dee4920`.
