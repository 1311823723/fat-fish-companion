"""Bounded, reusable Serena synthesis process. JSON-lines with --serve."""
import contextlib, json, os, re, sys, time
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'

def load_model(root):
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    from accelerate import dispatch_model
    from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSTokenizer
    torch.set_num_threads(4)
    torch.set_num_interop_threads(2)
    original_loader = Qwen3TTSTokenizer.from_pretrained.__func__
    def cpu_tokenizer(cls, *args, **kwargs):
        kwargs.update(device_map='cpu', dtype=torch.float32)
        kwargs.pop('max_memory', None)
        return original_loader(cls, *args, **kwargs)
    Qwen3TTSTokenizer.from_pretrained = classmethod(cpu_tokenizer)
    model = Qwen3TTSModel.from_pretrained(
        str(root / 'qwen-customvoice-1.7b'), device_map='cpu',
        dtype=torch.float16, attn_implementation='sdpa', local_files_only=True,
    )
    # Keep repeated codec prediction on GPU; page only the later talker layers.
    # Text embedding is a large lookup table, cheaply indexed on CPU.
    class CpuTextEmbedding(torch.nn.Module):
        def __init__(self, embedding):
            super().__init__()
            self.embedding = embedding
        def forward(self, indices):
            return self.embedding(indices.cpu()).to('cuda:0')
    embedding = model.model.talker.model.text_embedding
    model.model.talker.model.text_embedding = torch.nn.Identity()
    device_map = {
        'talker.model.norm': 'cuda:0',
        'talker.model.rotary_emb': 'cuda:0',
        'talker.model.codec_embedding': 'cuda:0',
        'talker.model.text_embedding': 'cpu',
        'talker.text_projection': 'cuda:0',
        'talker.codec_head': 'cuda:0',
        'talker.code_predictor': 'cuda:0',
    }
    for index in range(len(model.model.talker.model.layers)):
        device_map[f'talker.model.layers.{index}'] = 'cuda:0' if index < 20 else 'cpu'
    for layer in model.model.talker.model.layers[20:]:
        for parameter in layer.parameters():
            parameter.data = parameter.data.pin_memory()
    model.model = dispatch_model(model.model, device_map=device_map)
    model.model.talker.model.text_embedding = CpuTextEmbedding(embedding)
    torch.cuda.empty_cache()
    model.device = torch.device('cuda:0')
    for module in [model.model, model.model.talker, model.model.talker.code_predictor]:
        type(module).device = property(lambda self: torch.device('cuda:0'))
    return model

def render(model, req):
    import numpy as np
    import soundfile as sf
    import torch
    start=time.monotonic()
    text, name=str(req.get('text','')).strip(), str(req.get('name',''))
    if not text or len(text)>160 or not re.fullmatch(r'tts-[a-f0-9-]+\.wav',name):
        raise ValueError('invalid speech request')
    output=Path(req['output']).resolve()/name
    torch.manual_seed(42)
    max_tokens = 600
    wavs, sr = model.generate_custom_voice(
        text=text, language='Chinese', speaker='Serena',
        instruct='年轻女生轻松随意地和熟人说话，声线温暖自然，语气平静亲近。轻声但不耳语，略微慵懒，不刻意甜美，不像朗读。普通话清晰，语速从容，句尾自然放松。',
        max_new_tokens=max_tokens, temperature=0.75, top_p=0.9, top_k=50,
        non_streaming_mode=True,
    )
    audio = np.asarray(wavs[0], dtype=np.float32)
    seconds = len(audio) / sr
    if not np.isfinite(audio).all() or not 0 < seconds <= 45 or np.max(np.abs(audio)) <= 0:
        raise ValueError('invalid or overlong speech output')
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, sr, subtype='PCM_16')
    return dict(ok=True, name=name, duration=seconds, sampleRate=sr,
                elapsedMs=round((time.monotonic()-start)*1000),
                engine='qwen3-tts-serena-casual', device='cuda-cpu')

def main():
    serve='--serve' in sys.argv
    raw=sys.stdin.readline(8193) if serve else sys.stdin.read(8193)
    req=json.loads(raw)
    root=Path(req['runtime']).resolve()
    start=time.monotonic()
    with contextlib.redirect_stdout(sys.stderr):
        model=load_model(root)
    load_ms=round((time.monotonic()-start)*1000)
    first=True
    while True:
        if Path(req['runtime']).resolve()!=root:
            raise ValueError('runtime changed during reuse')
        with contextlib.redirect_stdout(sys.stderr):
            result=render(model,req)
        result['loadMs']=load_ms if first else 0
        result['reused']=not first
        print(json.dumps(result),flush=True)
        first=False
        if not serve:
            break
        raw=sys.stdin.readline(8193)
        if not raw:
            break
        req=json.loads(raw)

if __name__=='__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
