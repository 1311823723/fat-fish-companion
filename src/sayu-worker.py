"""Local, one-shot GPT-SoVITS V4 synthesis; JSON stdin/stdout."""
import sys, os, json, time, re, contextlib
from pathlib import Path
def main():
    start=time.monotonic()
    req=json.loads(sys.stdin.read(8193))
    text=str(req.get('text','')).strip()
    name=req.get('name','')
    if not text or len(text)>160 or not re.fullmatch(r'tts-[a-f0-9-]+\.wav',name):
        raise ValueError('invalid speech request')
    runtime=Path(req['runtime']).resolve()
    repo=runtime/'source/GPT-SoVITS-20250422v4'
    model=runtime/'sayu-model'
    output=Path(req['output']).resolve()/name
    os.environ['PATH']=str(repo)+os.pathsep+os.environ.get('PATH','')
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['TRANSFORMERS_OFFLINE']='1'
    os.environ['TOKENIZERS_PARALLELISM']='false'
    os.environ['HF_HOME']=str(runtime/'cache/huggingface')
    os.environ['MPLCONFIGDIR']=str(runtime/'cache/matplotlib')
    os.environ['PYTHONUTF8']='1'
    os.chdir(repo)
    sys.path[:0]=[str(repo),str(repo/'GPT_SoVITS')]
    with contextlib.redirect_stdout(sys.stderr):
        import torch, soundfile as sf, numpy as np
        torch.set_num_threads(2)
        # jieba_fast has no CPython 3.12 Windows wheel; use its API-compatible
        # pure Python implementation for segmentation without compiler installs.
        import jieba, jieba.posseg
        sys.modules['jieba_fast']=jieba
        sys.modules['jieba_fast.posseg']=jieba.posseg
        # This headless worker only needs audio loading, not the Gradio training UI.
        import types, librosa
        audio_utils=types.ModuleType('tools.my_utils')
        def load_audio(file,sr):
            data,source_sr=sf.read(str(file),dtype='float32',always_2d=True)
            return librosa.resample(data.mean(axis=1),orig_sr=source_sr,target_sr=sr)
        audio_utils.load_audio=load_audio
        sys.modules['tools.my_utils']=audio_utils
        from GPT_SoVITS.TTS_infer_pack.TTS import TTS
        from transformers import AutoModelForMaskedLM, AutoTokenizer
        from feature_extractor.cnhubert import CNHubert
        class LowMemoryTTS(TTS):
            def init_cnhuhbert_weights(self,base_path):
                # Long reference WAV convolution needs much more VRAM than its
                # weights. Keep this one-time reference encoder on CPU entirely.
                self.cnhuhbert_model=CNHubert(base_path).eval().float().cpu()
            def _set_prompt_semantic(self,ref_wav_path):
                wav,_=librosa.load(ref_wav_path,sr=16000)
                if not 48000<=len(wav)<=160000:
                    raise ValueError('reference must be 3 to 10 seconds')
                with torch.no_grad():
                    audio=torch.from_numpy(wav).float()
                    audio=torch.cat([audio,torch.zeros(int(self.configs.sampling_rate*0.3))])
                    feature=self.cnhuhbert_model.model(audio.unsqueeze(0))['last_hidden_state'].transpose(1,2)
                    codes=self.vits_model.extract_latent(feature.to(self.configs.device))
                    self.prompt_cache['prompt_semantic']=codes[0,0].to(self.configs.device)
            def init_bert_weights(self,base_path):
                self.bert_tokenizer=AutoTokenizer.from_pretrained(base_path)
                self.bert_model=AutoModelForMaskedLM.from_pretrained(base_path).eval().float().cpu()
            def set_ref_audio(self,ref_audio_path):
                super().set_ref_audio(ref_audio_path)
                self.cnhuhbert_model.cpu()
                if torch.cuda.is_available():torch.cuda.empty_cache()
            def using_vocoder_synthesis(self,*args,**kwargs):
                self.t2s_model.cpu()
                if torch.cuda.is_available():torch.cuda.empty_cache()
                try:return super().using_vocoder_synthesis(*args,**kwargs)
                finally:self.t2s_model.to(self.configs.device)
        device='cuda' if torch.cuda.is_available() else 'cpu'
        cfg={'custom':{'device':device,'is_half':False,'version':'v2',
            't2s_weights_path':str(model/'早柚-e10.ckpt'),
            'vits_weights_path':str(model/'早柚_e10_s600.pth'),
            'bert_base_path':str(repo/'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large'),
            'cnhuhbert_base_path':str(repo/'GPT_SoVITS/pretrained_models/chinese-hubert-base')}}
        tts=LowMemoryTTS(cfg)
        def bert_feature(preprocessor,text,word2ph):
            inputs=preprocessor.tokenizer(text,return_tensors='pt')
            with torch.no_grad():
                result=preprocessor.bert_model(**inputs,output_hidden_states=True)
                features=result.hidden_states[-3][0].cpu()[1:-1]
            return torch.cat([features[i].repeat(n,1) for i,n in enumerate(word2ph)],dim=0).T
        tts.text_preprocessor.get_bert_feature=types.MethodType(bert_feature,tts.text_preprocessor)
        ref=next((model/'references').glob('*可以睡觉*'))
        prompt=re.sub(r'^【[^】]*】','',ref.stem)
        parts=list(tts.run({'text':text,'text_lang':'all_zh','ref_audio_path':str(ref),
            'prompt_text':prompt,'prompt_lang':'all_zh','text_split_method':'cut5',
            'batch_size':1,'parallel_infer':False,'split_bucket':False,'speed_factor':0.96,
            'sample_steps':16,'seed':42,'return_fragment':False}))
        sr=parts[0][0]
        samples=np.concatenate([a for _,a in parts])
        duration=len(samples)/sr
        peak=float(np.max(np.abs(samples.astype(np.float32))))
        if not np.isfinite(samples).all() or not 0<duration<=45 or peak<=0:
            raise ValueError(f'invalid audio output: seconds={duration}, peak={peak}, finite={np.isfinite(samples).all()}, dtype={samples.dtype}')
        output.parent.mkdir(parents=True,exist_ok=True)
        sf.write(output,samples,sr,subtype='PCM_16')
    print(json.dumps({'ok':True,'name':name,'duration':duration,'sampleRate':sr,
        'elapsedMs':round((time.monotonic()-start)*1000),'engine':'gpt-sovits-v2-sayu','device':device,'peak':peak}),flush=True)
if __name__=='__main__':
    try:main()
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
