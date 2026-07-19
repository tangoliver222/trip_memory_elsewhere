from pathlib import Path
import json
import re

import kokoro_onnx
import numpy as np
import soundfile as sf


root = Path(__file__).parent
model = kokoro_onnx.Kokoro(
    Path.home() / ".cache/hyperframes/tts/models/kokoro-v1.0.onnx",
    Path.home() / ".cache/hyperframes/tts/voices/voices-v1.0.bin",
)
paragraphs = [part.strip() for part in (root / "narration.txt").read_text().split("\n\n") if part.strip()]
audio = []
transcript = []
sample_rate = 24_000
cursor = 0.0

for index, paragraph in enumerate(paragraphs, start=1):
    sentences = [part for part in re.split(r"(?<=[，。；！？])", paragraph) if part.strip()]
    paragraph_samples = []
    for sentence in sentences:
        samples, sample_rate = model.create(sentence, voice="zf_xiaobei", speed=1.3)
        paragraph_samples.append(samples)
        duration = len(samples) / sample_rate
        transcript.append({"text": sentence.strip(), "start": round(cursor, 3), "end": round(cursor + duration, 3)})
        cursor += duration
        pause = np.zeros(round(sample_rate * 0.08), dtype=samples.dtype)
        paragraph_samples.append(pause)
        cursor += len(pause) / sample_rate
    samples = np.concatenate(paragraph_samples)
    audio.append(samples)
    paragraph_pause = np.zeros(round(sample_rate * 0.42), dtype=samples.dtype)
    audio.append(paragraph_pause)
    cursor += len(paragraph_pause) / sample_rate
    print(f"paragraph {index}/{len(paragraphs)}: {len(samples) / sample_rate:.2f}s")

combined = np.concatenate(audio)
sf.write(root / "narration.wav", combined, sample_rate)
(root / "transcript.json").write_text(json.dumps(transcript, ensure_ascii=False, indent=2) + "\n")
print(f"total: {len(combined) / sample_rate:.2f}s")
