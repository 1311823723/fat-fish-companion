"""Feiyu Cute F6 JSON-lines worker; staged GPU inference for 4 GB cards.

Requires a separately obtained CosyVoice checkout and FeiyuVoice release.
Their code, weights, references and license files are not bundled here.
"""
import contextlib
import gc
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                  TOKENIZERS_PARALLELISM='false', OMP_NUM_THREADS='4')


def asset(package, relative):
    target = (package / relative).resolve()
    if not target.is_relative_to(package) or not target.is_file():
        raise ValueError('Missing or unsafe model asset')
    return target


def checksum(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def load_model(root):
    package = (root / 'models/tts/package').resolve()
    manifest = json.loads((package / 'manifest.json').read_text(encoding='utf-8'))
    selected = manifest['styles']['cute']
    if manifest.get('schema') != 'feiyu-voice-local-release-v1':
        raise ValueError('Unsupported voice release')
    checkpoint = asset(package, selected['llm_checkpoint'])
    reference = asset(package, selected['reference_audio'])
    for file, expected in [(checkpoint, selected['llm_sha256']),
                           (reference, selected['reference_sha256'])]:
        if checksum(file) != expected:
            raise ValueError('Voice asset checksum mismatch')
    source = root / 'cosyvoice-source'
    sys.path[:0] = [str(source), str(source / 'third_party/Matcha-TTS')]
    import torch
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.cli.model import CosyVoiceModel, CosyVoice3Model
    if not torch.cuda.is_available():
        raise RuntimeError('This low-memory profile requires CUDA')
    torch.set_num_threads(4)
    torch.set_num_interop_threads(2)

    def staged_load(model, llm_file, flow_file, hift_file):
        for name, file in [('llm', checkpoint), ('flow', flow_file), ('hift', hift_file)]:
            state = torch.load(file, map_location='cpu', weights_only=True)
            if name == 'hift':
                state = {k.replace('generator.', ''): v for k, v in state.items()}
            network = getattr(model, name)
            network.load_state_dict(state, strict=True)
            del state
            if name == 'llm':
                network.half()
            network.to('cpu' if name == 'flow' else model.device).eval()
            gc.collect()

    original_audio = CosyVoice3Model.token2wav

    def full_precision_audio(model, *args, **kwargs):
        # Non-streaming inference joins the LLM thread before this step.
        model.llm.cpu()
        torch.cuda.empty_cache()
        model.flow.to(model.device)
        model.fp16 = False
        return original_audio(model, *args, **kwargs)

    CosyVoiceModel.load = staged_load
    CosyVoice3Model.token2wav = full_precision_audio
    model_dir = (package / manifest['base_model_dir']).resolve()
    if not model_dir.is_relative_to(package):
        raise ValueError('Unsafe base model path')
    voice = AutoModel(model_dir=str(model_dir), fp16=True, load_trt=False, load_vllm=False)
    return voice, manifest['inference']['prompt_prefix'] + selected['reference_text'], reference


def render(loaded, request):
    import numpy as np
    import soundfile as sf
    import torch
    from cosyvoice.utils.common import set_all_random_seed
    voice, prompt, reference = loaded
    text, name = str(request.get('text', '')).strip(), str(request.get('name', ''))
    if not text or len(text) > 160 or not re.fullmatch(r'tts-[a-f0-9-]+\.wav', name):
        raise ValueError('Invalid speech request')
    started = time.monotonic()
    voice.model.flow.cpu()
    torch.cuda.empty_cache()
    voice.model.llm.to(voice.model.device)
    voice.model.fp16 = True
    set_all_random_seed(42)
    with torch.inference_mode():
        chunks = [part['tts_speech'].detach().cpu().numpy()[0]
                  for part in voice.inference_zero_shot(text, prompt, str(reference),
                      stream=False, speed=1.0, text_frontend=True)]
    if not chunks:
        raise ValueError('Empty speech output')
    audio = np.concatenate(chunks)
    duration = len(audio) / voice.sample_rate
    if not np.isfinite(audio).all() or not 0.1 < duration <= 45 or abs(audio).max() <= 1e-4:
        raise ValueError('Invalid or overlong speech output')
    audio *= min(1.0, 0.98 / float(abs(audio).max()))
    output = Path(request['output']).resolve() / name
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, voice.sample_rate, subtype='PCM_16')
    # Keep the GPU free while idle; the reusable process retains CPU weights.
    voice.model.flow.cpu()
    torch.cuda.empty_cache()
    return dict(ok=True, name=name, duration=duration, sampleRate=voice.sample_rate,
                elapsedMs=round((time.monotonic() - started) * 1000),
                engine='cosyvoice3-feiyu-cute', device='cuda-cpu-staged')


def main():
    serve = '--serve' in sys.argv
    raw = sys.stdin.readline(8193) if serve else sys.stdin.read(8193)
    request = json.loads(raw)
    root = Path(request['runtime']).resolve()
    started = time.monotonic()
    with contextlib.redirect_stdout(sys.stderr):
        loaded = load_model(root)
    load_ms = round((time.monotonic() - started) * 1000)
    first = True
    while True:
        if Path(request['runtime']).resolve() != root:
            raise ValueError('Runtime changed during reuse')
        with contextlib.redirect_stdout(sys.stderr):
            result = render(loaded, request)
        result.update(loadMs=load_ms if first else 0, reused=not first)
        print(json.dumps(result), flush=True)
        first = False
        if not serve:
            break
        raw = sys.stdin.readline(8193)
        if not raw:
            break
        request = json.loads(raw)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
