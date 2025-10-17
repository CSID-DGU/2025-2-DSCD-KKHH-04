# core/ingest_service.py
# 게이트웨이 : Redis에 시퀀스 프레임을 스트리밍
import os, msgpack
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
R = redis.Redis.from_url(REDIS_URL)
STREAM_KEY_PREFIX = "seq:"

def flatten_frame(frame):
    L = [0.0]*63; Rv = [0.0]*63
    for h in frame.get("hands", []):
        vec = []
        for lm in h.get("landmarks", []):
            vec.extend([float(lm.get("x",0.0)), float(lm.get("y",0.0)), float(lm.get("z",0.0))])
        vec = (vec + [0.0]*63)[:63]
        if h.get("handedness") == "Left":
            L = vec
        else:
            Rv = vec
    return L + Rv  # 126

# 프레임 시퀀스를 Redis Stream에 추가
def enqueue_frames(session_id: str, frames: list):
    
    key = STREAM_KEY_PREFIX + session_id
    pipe = R.pipeline()
    for f in frames:
        vec = flatten_frame(f)
        pipe.xadd(key, {"ts": f["ts"], "vec": msgpack.packb(vec)})
    pipe.execute()
