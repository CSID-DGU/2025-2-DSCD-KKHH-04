# -*- coding: utf-8 -*-
"""
Pipeline V2.3: Financial KSL System (Final Integrated Version)
- Features: 
  1. Topic-Comment Structure (Strict Prompt)
  2. Vocabulary Injection (DB Awareness)
  3. Terminology Rules (Auto-Correction)
  4. Hybrid Synthesis (Auto-Caption for Verification)
  5. Robust Error Handling (Empty JSON Fix)
  6. Detailed Performance Timing (Seconds)
"""

import os
import sys
import time
import json
import csv
import wave
import hashlib
import threading
import subprocess
import tempfile
import traceback
import warnings
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# [Warning Suppression]
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU")

# =========================================================
# 1. Configuration
# =========================================================
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent   # backend/
DATA_DIR = BASE_DIR / "data"                # backend/data

GLOSS_DB_PATH = DATA_DIR / "gloss_dictionary_MOCK_1.csv"
GOLDEN_SET_PATH = DATA_DIR / "golden_set.json"
TERMINOLOGY_PATH = DATA_DIR / "terminology.json"
GLOSS_MP4_DIR = DATA_DIR / "gloss_mp4"

OUTPUT_DIR = BASE_DIR / "outputs"
LOG_DIR = OUTPUT_DIR / "logs"
CACHE_DIR = OUTPUT_DIR / "cache"


# [Create Dirs]
for d in [LOG_DIR, CACHE_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# [Font Path]
if sys.platform == "win32":
    FONT_PATH = "C:/Windows/Fonts/malgun.ttf"
elif sys.platform == "darwin":
    FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
else:
    FONT_PATH = "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"

# [Settings]
VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
WHISPER_MODEL = "small"
GEMINI_MODEL_NAME = "gemini-2.5-flash"

try:
    import sounddevice as sd
    import whisper
    import google.generativeai as genai
except ImportError:
    print("❌ pip install sounddevice openai-whisper google-generativeai python-dotenv")
    sys.exit(1)


# =========================================================
# 2. NLP (Topic-Comment + Vocab Injection)
# =========================================================
class SmartNLP:
    def __init__(self):
        if not GOOGLE_API_KEY:
            raise ValueError("❌ GOOGLE_API_KEY missing in .env")
        
        genai.configure(api_key=GOOGLE_API_KEY)
        
        # ---------------------------------------------------------
        # A. Vocabulary Injection (DB 단어장 로드)
        # ---------------------------------------------------------
        vocab_list = []
        if GLOSS_DB_PATH.exists():
            with open(GLOSS_DB_PATH, 'r', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    k_key = next((k for k in row.keys() if 'ko' in k.lower() or 'mean' in k.lower()), None)
                    if k_key:
                        val = row[k_key]
                        try:
                            terms = eval(val) if val.startswith('[') else [val]
                        except:
                            terms = [val]
                        vocab_list.extend([t.strip() for t in terms])
        
        unique_vocab = sorted(list(set(vocab_list)))
        vocab_str = ", ".join(unique_vocab)
        print(f"📚 [NLP] Loaded {len(unique_vocab)} words from DB.")

        # ---------------------------------------------------------
        # B. Terminology Injection (규칙 파일 로드)
        # ---------------------------------------------------------
        term_instruction = ""
        if TERMINOLOGY_PATH.exists():
            try:
                with open(TERMINOLOGY_PATH, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        terms = json.loads(content)
                        term_instruction = "\n[강제 변환 규칙 (Priority Rules)]\n"
                        for k, v in terms.items():
                            term_instruction += f"- 입력 '{k}' -> {json.dumps(v, ensure_ascii=False)}\n"
            except Exception as e:
                print(f"⚠️ Terminology Load Error: {e}")

        # ---------------------------------------------------------
        # C. Strict System Prompt
        # ---------------------------------------------------------
        self.sys_prompt = f"""
        당신은 '한국어->수어(KSL) 구조 변환 엔진'입니다. 번역가가 아닙니다.
        입력된 문장을 철저히 분석하여 **수어 문법(화제-서술)**에 맞게 재조립하세요.

        [Available Vocabulary (DB)]
        {vocab_str[:15000]}...

        {term_instruction}

        [🚫 절대 금지 사항 (Negative Constraints)]
        1. 조사(은/는/이/가/을/를)와 어미(-입니다/-습니다/-요)는 **무조건 삭제**하세요.
        2. 숫자를 낱개로 쪼개지 마세요. (예: "18" -> "1", "8" (X) | "18" (O))
        3. 문장의 원래 순서를 그대로 따라가지 마세요. 중요한 **[화제]**를 앞으로 끄집어내세요.

        [✅ 작업 단계 (Step-by-Step)]
        Step 1. **Keyword Extract:** 조사/어미 제거, 핵심 명사/동사/숫자만 남김.
        Step 2. **Grouping:** 숫자와 단위는 하나로 묶음 (type: "image").
        Step 3. **Restructure:** [화제(Topic)] -> [PAUSE] -> [서술(Comment)] 순서로 재배치.

        [출력 포맷 (JSON Only)]
        {{
            "cleaned": "정제된 문장 (예: 가입 조건 18세 이상)",
            "tokens": [
                {{"text": "나이", "type": "gloss"}},
                {{"text": "조건", "type": "gloss"}},
                {{"text": "[PAUSE]", "type": "pause"}},
                {{"text": "18세", "type": "image"}},
                {{"text": "이상", "type": "gloss"}}
            ]
        }}
        """
        
        self.model = genai.GenerativeModel(
            GEMINI_MODEL_NAME, 
            system_instruction=self.sys_prompt,
            generation_config={"response_mime_type": "application/json"}
        )

    def process(self, text):
        try:
            response = self.model.generate_content(text)
            return json.loads(response.text)
        except Exception as e:
            print(f"⚠️ NLP Error: {e}")
            return {"cleaned": "", "tokens": []}


# =========================================================
# 3. Mapper (Robust JSON Loading)
# =========================================================
class IntelligentMapper:
    def __init__(self):
        self.db_exact = {}
        self.golden_set = {}
        self._load_db()
        self._load_golden()

    def _load_db(self):
        if GLOSS_DB_PATH.exists():
            with open(GLOSS_DB_PATH, 'r', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    k_key = next((k for k in row.keys() if 'ko' in k.lower() or 'mean' in k.lower()), None)
                    id_key = next((k for k in row.keys() if 'id' in k.lower()), None)
                    
                    if k_key and id_key:
                        terms = row[k_key]
                        gid = row[id_key].strip()
                        try:
                            term_list = eval(terms) if terms.startswith('[') else [terms]
                        except:
                            term_list = [terms]
                        for t in term_list:
                            self.db_exact[t.strip()] = gid

    def _load_golden(self):
        # [FIX] 빈 JSON 파일 에러 방지 로직
        if GOLDEN_SET_PATH.exists():
            try:
                with open(GOLDEN_SET_PATH, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        self.golden_set = json.loads(content)
                    else:
                        self.golden_set = {}
            except json.JSONDecodeError:
                print("⚠️ Golden Set JSON corrupted or empty. Starting fresh.")
                self.golden_set = {}

    def map_token(self, token):
        txt = token.get("text", "")
        typ = token.get("type", "gloss")

        if typ != "gloss":
            return token

        # 1. Golden Set
        if txt in self.golden_set:
            return {**token, "id": self.golden_set[txt], "status": "golden"}

        # 2. Exact Match
        if txt in self.db_exact:
            return {**token, "id": self.db_exact[txt], "status": "exact"}

        # 3. Unknown
        return {**token, "id": None, "status": "unknown"}


# =========================================================
# 4. Synthesizer (Auto-Caption + Windows Fix)
# =========================================================
class HybridSynthesizer:
    def __init__(self):
        self.ffmpeg = "ffmpeg"

    def _escape_path(self, path_str):
        p = Path(path_str).as_posix()
        return p.replace(":", "\\:")

    def _add_caption(self, input_video, text, output_video):
        font_p = self._escape_path(str(FONT_PATH))
        drawtext = (
            f"fontfile='{font_p}':text='{text}':fontsize=60:fontcolor=yellow:"
            f"x=(w-text_w)/2:y=h-th-20:borderw=3:bordercolor=black"
        )
        cmd = [
            self.ffmpeg, "-y", "-i", str(input_video), "-vf", f"drawtext={drawtext}",
            "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy", str(output_video)
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception as e:
            print(f"⚠️ Caption Error: {e}")
            return False

    def _generate_text_video(self, text, out_path):
        txt_hash = hashlib.md5(text.encode()).hexdigest()
        txt_file = CACHE_DIR / f"content_{txt_hash}.txt"
        with open(txt_file, "w", encoding="utf-8") as f: f.write(text)
        
        font_p = self._escape_path(str(FONT_PATH))
        text_p = self._escape_path(str(txt_file))
        
        cmd = [
            self.ffmpeg, "-y", "-f", "lavfi", "-i", f"color=c=black:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:d=2",
            "-vf", f"drawtext=textfile='{text_p}':fontfile='{font_p}':fontsize=100:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(out_path)
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except Exception: return False
        finally:
            if txt_file.exists(): os.remove(txt_file)

    def synthesize(self, mapped_tokens):
        playlist = []
        print(f"   (Processing {len(mapped_tokens)} clips...)")

        for tok in mapped_tokens:
            typ = tok["type"]
            txt = tok.get("text", "")
            
            if typ == "gloss":
                gid = tok.get("id")
                if gid:
                    found = list(GLOSS_MP4_DIR.rglob(f"{gid}.mp4"))
                    if found:
                        src_video = found[0]
                        caption_hash = hashlib.md5(f"{gid}_{txt}".encode()).hexdigest()
                        caption_video = CACHE_DIR / f"cap_{caption_hash}.mp4"
                        
                        if not caption_video.exists():
                            success = self._add_caption(src_video, txt, caption_video)
                            if not success: caption_video = src_video
                        playlist.append(str(caption_video))
                    else:
                        print(f"⚠️ File Missing: {txt} (ID: {gid})")
                else:
                    print(f"❓ Unknown Gloss: {txt}")
            
            elif typ == "image":
                name_hash = hashlib.md5(txt.encode()).hexdigest()
                cache_path = CACHE_DIR / f"img_{name_hash}.mp4"
                if not cache_path.exists(): self._generate_text_video(txt, cache_path)
                if cache_path.exists(): playlist.append(str(cache_path))

            elif typ == "pause":
                pause_path = CACHE_DIR / "pause_0.5s.mp4"
                if not pause_path.exists():
                    cmd = [self.ffmpeg, "-y", "-f", "lavfi", "-i", f"color=c=black:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:d=0.5", 
                           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(pause_path)]
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                playlist.append(str(pause_path))

        return playlist


# =========================================================
# 5. Player & Main
# =========================================================
class VideoPlayer:
    def play(self, paths):
        if not paths: return False
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            list_path = f.name
            for p in paths:
                safe_p = p.replace("\\", "/")
                f.write(f"file '{safe_p}'\n")
        try:
            subprocess.run(
                ["ffplay", "-f", "concat", "-safe", "0", "-i", list_path, 
                 "-autoexit", "-hide_banner", "-loglevel", "error"],
                check=True
            )
            return True
        except Exception as e:
            print(f"❌ Play Error: {e}")
            return False
        finally:
            if os.path.exists(list_path): os.remove(list_path)

class AudioInput:
    def __init__(self):
        self.frames = []
        self.lock = threading.Lock()
        self.last_idx = 0
        self.stream = None
    def cb(self, i, f, t, s):
        with self.lock: self.frames.append(bytes(i))
    def start(self):
        self.stream = sd.RawInputStream(samplerate=16000, blocksize=1024, dtype='int16', channels=1, callback=self.cb)
        self.stream.start()
    def get_delta(self):
        with self.lock:
            curr = len(self.frames)
            if curr <= self.last_idx: return None
            d = b"".join(self.frames[self.last_idx:curr])
            self.last_idx = curr
            return d
    def save_wav(self, d, p):
        with wave.open(str(p), 'wb') as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000); wf.writeframes(d)

def main():
    print(f"\n🚀 Pipeline V2.3 Started | Model: {GEMINI_MODEL_NAME}")
    print("✨ Features: Detailed Timing (sec), Vocab Injection, Auto-Caption")
    
    try:
        audio_in = AudioInput()
        stt = whisper.load_model(WHISPER_MODEL)
        nlp = SmartNLP()
        mapper = IntelligentMapper()
        synth = HybridSynthesizer()
        player = VideoPlayer()
        
        audio_in.start()
        print("🎙️ Listening... Press [Enter] to translate.")
        
        while True:
            input("\n[Enter] > ")
            
            timings = {}
            pipeline_start = time.perf_counter()
            
            # 1. Input
            t0 = time.perf_counter()
            blob = audio_in.get_delta()
            if not blob: 
                print("⚠️ No audio detected.")
                continue
            wav_path = CACHE_DIR / "input.wav"
            audio_in.save_wav(blob, wav_path)
            timings["Input"] = time.perf_counter() - t0
            
            # 2. STT
            t0 = time.perf_counter()
            res = stt.transcribe(str(wav_path), language="ko")
            raw_text = res["text"].strip()
            timings["STT"] = time.perf_counter() - t0
            print(f"🗣️  Raw Input: {raw_text}")
            if not raw_text: continue
            
            # 3. NLP
            t0 = time.perf_counter()
            nlp_result = nlp.process(raw_text)
            timings["NLP"] = time.perf_counter() - t0
            
            cleaned_text = nlp_result.get("cleaned", "(No info)")
            tokens = nlp_result.get("tokens", [])
            print(f"✨ Corrected: {cleaned_text}")
            print(f"🧠 Structure: {json.dumps(tokens, ensure_ascii=False)}")
            
            # 4. Map
            t0 = time.perf_counter()
            mapped = [mapper.map_token(t) for t in tokens]
            timings["Query"] = time.perf_counter() - t0
            
            # 5. Synth
            t0 = time.perf_counter()
            playlist = synth.synthesize(mapped)
            timings["Synth"] = time.perf_counter() - t0
            
            # 6. Play
            t0 = time.perf_counter()
            player.play(playlist)
            timings["Output"] = time.perf_counter() - t0
            
            total_time = time.perf_counter() - pipeline_start
            
            # --- 📊 Performance Report (Seconds) ---
            print("\n" + "="*30)
            print(f"⏱️  Performance Report (Total: {total_time:.2f}s)")
            print("-" * 30)
            for stage, sec in timings.items():
                percent = (sec / total_time) * 100
                print(f" • {stage:<10} : {sec:>6.2f}s ({percent:>4.1f}%)")
            print("="*30 + "\n")
            
            # 7. Log Save
            log_entry = {
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "input_text": raw_text,
                "corrected_text": cleaned_text,
                "timings_sec": timings,
                "total_sec": total_time,
                "tokens": mapped,
            }
            log_file = LOG_DIR / f"log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(log_file, "w", encoding="utf-8") as f:
                json.dump(log_entry, f, ensure_ascii=False, indent=2)
            print(f"📝 Log saved to {log_file.name}")

    except KeyboardInterrupt:
        print("\n👋 Exiting...")
    except Exception:
        traceback.print_exc()

if __name__ == "__main__":
    main()