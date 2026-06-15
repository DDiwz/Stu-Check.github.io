"""
╔══════════════════════════════════════════════════════════════════════╗
║          STU-Check — FastAPI Backend (คอมบ้าน + Ngrok)             ║
║  รับภาพ Base64 จาก Frontend (GitHub Pages) → วิเคราะห์อารมณ์ AI   ║
║  ส่งผลลัพธ์กลับเป็น JSON: { emotion_code, faces, positive, ... }   ║
╚══════════════════════════════════════════════════════════════════════╝

การติดตั้ง:
    pip install fastapi uvicorn pillow numpy

วิธีรัน:
    python server.py
    หรือ: uvicorn server:app --host 0.0.0.0 --port 8000 --reload

วิธีเปิดผ่าน Ngrok (เปิด terminal อีกหน้าต่าง):
    ngrok http 8000
    แล้วนำ URL ที่ได้ (เช่น https://xxxx.ngrok-free.app) ไปใส่ใน index.html
"""

import base64
import io
import logging
import time
from typing import Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

# ─────────────────────────────────────────────────
#  Logging
# ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("stucheck")

# ─────────────────────────────────────────────────
#  FastAPI App
# ─────────────────────────────────────────────────
app = FastAPI(
    title="STU-Check AI Backend",
    description="วิเคราะห์อารมณ์นักเรียนจากภาพ Webcam — โรงเรียนพะเยาพิทยาคม",
    version="2.0.0",
)

# ─────────────────────────────────────────────────
#  CORS — อนุญาตให้ GitHub Pages เรียกมาได้
#  (origins=["*"] ง่ายสุด ถ้าต้องการจำกัดให้ใส่ domain จริง)
# ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # หรือระบุ ["https://your-username.github.io"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────
#  Emotion Code ที่ส่งกลับ Frontend
# ─────────────────────────────────────────────────
EMOTION_POSITIVE = 0   # อารมณ์บวก  (happy, surprised)
EMOTION_NEGATIVE = 1   # อารมณ์ลบ   (sad, angry, fearful, disgusted)
EMOTION_NEUTRAL  = 2   # ปกติ/กลาง  (neutral)

# ─────────────────────────────────────────────────
#  โหลดโมเดล AI ตรวจสอบอารมณ์ (ครั้งเดียวตอนเริ่มเซิร์ฟเวอร์)
# ─────────────────────────────────────────────────
# TODO: วางโค้ดโหลดโมเดลของคุณที่นี่
# ตัวอย่างสำหรับ DeepFace:
#   from deepface import DeepFace
#
# ตัวอย่างสำหรับ TensorFlow/Keras:
#   import tensorflow as tf
#   model = tf.keras.models.load_model("emotion_model.h5")
#
# ตัวอย่างสำหรับ PyTorch:
#   import torch
#   model = torch.load("emotion_model.pth")
#   model.eval()
#
# ─── ตัวแปรสำหรับเก็บโมเดล ───
ai_model = None          # ← แทนที่ด้วยโมเดลที่โหลดแล้ว

def load_ai_model():
    """โหลดโมเดล AI ตรวจจับอารมณ์ — แก้ไขฟังก์ชันนี้ให้ตรงกับโมเดลของคุณ"""
    global ai_model

    # ════════════════════════════════════════
    # TODO: วางโค้ดโหลดโมเดลของคุณที่นี่
    # ════════════════════════════════════════
    # ตัวอย่าง:
    #   ai_model = tf.keras.models.load_model("path/to/model.h5")
    #   logger.info("โหลดโมเดล TF สำเร็จ")
    # ════════════════════════════════════════

    logger.info("⚠  ai_model ยังไม่ได้โหลด — ใช้ Dummy Logic สำหรับทดสอบ")
    ai_model = "DUMMY"   # ← ลบบรรทัดนี้เมื่อใส่โมเดลจริงแล้ว

# โหลดโมเดลตอนเริ่ม
load_ai_model()

# ─────────────────────────────────────────────────
#  Pydantic Models (Request / Response)
# ─────────────────────────────────────────────────
class PredictRequest(BaseModel):
    """ข้อมูลที่รับจาก Frontend"""
    image: str                        # Base64 JPEG string (ไม่มี data:image/... prefix)
    session_id: Optional[str] = None  # ไม่จำเป็น — ส่งมาจาก Frontend เพื่อ logging

class PredictResponse(BaseModel):
    """ข้อมูลที่ส่งกลับ Frontend"""
    status: str           # "success" | "error"
    emotion_code: int     # 0=positive, 1=negative, 2=neutral
    faces: int            # จำนวนใบหน้าที่ตรวจพบ
    positive: int         # จำนวนใบหน้าอารมณ์บวก
    negative: int         # จำนวนใบหน้าอารมณ์ลบ
    neutral: int          # จำนวนใบหน้าอารมณ์กลาง
    message: Optional[str] = None     # ข้อความเพิ่มเติม (เช่น error)

# ─────────────────────────────────────────────────
#  Helper — แปลง Base64 → PIL Image
# ─────────────────────────────────────────────────
def decode_image(base64_string: str) -> Image.Image:
    """แปลง Base64 string เป็น PIL Image"""
    # ลบ data URL prefix ถ้ามี (เผื่อ Frontend ส่งมาทั้งก้อน)
    if "," in base64_string:
        base64_string = base64_string.split(",", 1)[1]
    img_bytes = base64.b64decode(base64_string)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return img

# ─────────────────────────────────────────────────
#  ฟังก์ชันหลัก — วิเคราะห์อารมณ์จากภาพ
# ─────────────────────────────────────────────────
def analyze_emotion(img: Image.Image) -> dict:
    """
    วิเคราะห์อารมณ์จากภาพ PIL Image
    ส่งคืน dict: { emotion_code, faces, positive, negative, neutral }

    ════════════════════════════════════════════════════════
    TODO: แทนที่ส่วน DUMMY LOGIC ด้านล่างด้วยโมเดล AI จริง
    ════════════════════════════════════════════════════════

    ตัวอย่าง DeepFace:
    ─────────────────
        from deepface import DeepFace
        import cv2

        img_array = np.array(img)
        img_bgr   = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        results   = DeepFace.analyze(img_bgr, actions=["emotion"], enforce_detection=False)
        if not isinstance(results, list):
            results = [results]

        pos, neg, neu = 0, 0, 0
        POSITIVE_LABELS = {"happy", "surprise"}
        NEGATIVE_LABELS = {"sad", "angry", "fear", "disgust"}

        for r in results:
            dominant = r.get("dominant_emotion", "neutral").lower()
            if dominant in POSITIVE_LABELS:
                pos += 1
            elif dominant in NEGATIVE_LABELS:
                neg += 1
            else:
                neu += 1

        faces = pos + neg + neu
        # หา emotion_code จากกลุ่มที่มีมากที่สุด
        if pos >= neg and pos >= neu:
            emotion_code = EMOTION_POSITIVE
        elif neg > pos and neg >= neu:
            emotion_code = EMOTION_NEGATIVE
        else:
            emotion_code = EMOTION_NEUTRAL

        return {"emotion_code": emotion_code, "faces": faces,
                "positive": pos, "negative": neg, "neutral": neu}

    ════════════════════════════════════════════════════════
    """

    # ════════════════════════════════════════
    # DUMMY LOGIC — ลบทิ้งเมื่อใส่โมเดลจริงแล้ว
    # สุ่มตัวเลขเพื่อทดสอบ UI ก่อนมีโมเดลจริง
    # ════════════════════════════════════════
    import random
    faces    = random.randint(1, 5)
    pos      = random.randint(0, faces)
    neg      = random.randint(0, faces - pos)
    neu      = faces - pos - neg

    if pos >= neg and pos >= neu:
        emotion_code = EMOTION_POSITIVE
    elif neg > pos and neg >= neu:
        emotion_code = EMOTION_NEGATIVE
    else:
        emotion_code = EMOTION_NEUTRAL

    logger.warning("⚠  DUMMY MODE: สุ่มผลลัพธ์ — กรุณาใส่โมเดล AI จริง")
    # ════════════════════════════════════════
    # END DUMMY LOGIC
    # ════════════════════════════════════════

    return {
        "emotion_code": emotion_code,
        "faces":    faces,
        "positive": pos,
        "negative": neg,
        "neutral":  neu,
    }

# ─────────────────────────────────────────────────
#  GET /health — ตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่
# ─────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Frontend เรียกเพื่อตรวจสอบการเชื่อมต่อ"""
    return {
        "status":    "ok",
        "model":     "โมเดลพร้อมใช้งาน" if ai_model and ai_model != "DUMMY" else "DUMMY MODE",
        "timestamp": time.time(),
    }

# ─────────────────────────────────────────────────
#  POST /predict — รับภาพ → วิเคราะห์อารมณ์ → ส่งผลกลับ
# ─────────────────────────────────────────────────
@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    """
    รับ Base64 Image จาก Frontend → วิเคราะห์อารมณ์ → ส่ง JSON กลับ

    Request body:
        { "image": "<base64 jpeg string>", "session_id": "optional" }

    Response body:
        { "status": "success", "emotion_code": 0, "faces": 3,
          "positive": 2, "negative": 1, "neutral": 0 }
    """
    t0 = time.time()

    # 1️⃣ Decode Base64 → PIL Image
    try:
        img = decode_image(req.image)
        logger.info(f"รับภาพ: {img.size[0]}×{img.size[1]}px | session={req.session_id}")
    except Exception as e:
        logger.error(f"Decode image failed: {e}")
        raise HTTPException(status_code=400, detail=f"ไม่สามารถถอดรหัสภาพได้: {e}")

    # 2️⃣ วิเคราะห์อารมณ์
    try:
        result = analyze_emotion(img)
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(status_code=500, detail=f"AI วิเคราะห์ไม่สำเร็จ: {e}")

    elapsed = round(time.time() - t0, 3)
    logger.info(
        f"✅ emotion_code={result['emotion_code']} | "
        f"faces={result['faces']} "
        f"(+{result['positive']} -{result['negative']} ~{result['neutral']}) | "
        f"{elapsed}s"
    )

    return PredictResponse(
        status="success",
        emotion_code=result["emotion_code"],
        faces=result["faces"],
        positive=result["positive"],
        negative=result["negative"],
        neutral=result["neutral"],
        message=f"ประมวลผลใน {elapsed} วินาที",
    )

# ─────────────────────────────────────────────────
#  GET / — หน้าหลัก (ตรวจสอบง่ายผ่านเบราว์เซอร์)
# ─────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "app":     "STU-Check Backend",
        "version": "2.0.0",
        "docs":    "/docs",   # Swagger UI
        "health":  "/health",
        "predict": "POST /predict",
    }

# ─────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────
if __name__ == "__main__":
    logger.info("=" * 55)
    logger.info("  STU-Check FastAPI Server — Client-Server Mode")
    logger.info("  http://localhost:8000  |  docs: /docs")
    logger.info("  เปิด Ngrok แล้ววางลิงก์ใน index.html")
    logger.info("=" * 55)
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,   # auto-reload เมื่อแก้ไขโค้ด
        log_level="info",
    )
