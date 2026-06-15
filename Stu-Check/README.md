# STU-Check — Client-Server Architecture

ระบบ AI ประเมินอารมณ์ผู้เรียนในห้องเรียน แบบ **Frontend (GitHub Pages) + Backend (FastAPI + Ngrok)**

---

## 📁 โครงสร้างไฟล์

```
Stu-Check/
├── index.html        ← Frontend (อัปโหลดขึ้น GitHub Pages)
├── server.py         ← Backend FastAPI (รันที่คอมบ้าน)
├── css/
│   └── style.css
└── js/
    └── app.js        ← Logic Frontend (อัปโหลดพร้อม index.html)
```

---

## 🚀 วิธีใช้งาน

### ฝั่ง Frontend (GitHub Pages)

1. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub Repository
2. เปิด **GitHub Pages** ใน Settings → Pages → Source: `main`
3. แชร์ลิงก์ `https://username.github.io/repo-name/` ให้เครื่องอื่นในห้องเรียน

### ฝั่ง Backend (คอมบ้าน)

```bash
# 1. ติดตั้ง dependencies
pip install fastapi uvicorn pillow numpy

# 2. รัน server
python server.py

# 3. เปิด Ngrok (terminal ใหม่)
ngrok http 8000
```

4. Ngrok จะให้ URL เช่น `https://xxxx-xxx.ngrok-free.app`
5. กลับไปที่หน้าเว็บ → กรอก URL ใน **"สถานะเซิร์ฟเวอร์"** → กด **ตรวจสอบ**

---

## 🔌 API Endpoints

| Method | Path       | คำอธิบาย                                     |
|--------|------------|----------------------------------------------|
| `GET`  | `/`        | ข้อมูลเซิร์ฟเวอร์                            |
| `GET`  | `/health`  | ตรวจสอบสถานะ (Frontend เรียกอัตโนมัติ)       |
| `POST` | `/predict` | รับภาพ Base64 → ส่งผล emotion_code กลับ      |

### ตัวอย่าง Request/Response `/predict`

```json
// Request
{ "image": "<base64 jpeg string>", "session_id": "optional" }

// Response
{
  "status": "success",
  "emotion_code": 0,
  "faces": 5,
  "positive": 3,
  "negative": 1,
  "neutral": 1,
  "message": "ประมวลผลใน 0.123 วินาที"
}
```

### Emotion Code

| Code | ความหมาย | อารมณ์                           |
|------|----------|----------------------------------|
| `0`  | Positive | happy, surprised                 |
| `1`  | Negative | sad, angry, fearful, disgusted   |
| `2`  | Neutral  | neutral                          |

---

## 🤖 ใส่โมเดล AI ของคุณ

เปิด [`server.py`](server.py) แล้วแก้ที่ฟังก์ชัน `analyze_emotion()`:

```python
def analyze_emotion(img: Image.Image) -> dict:
    # ═══════════════════════════════════════
    # ใส่โมเดล AI ของคุณที่นี่
    # ═══════════════════════════════════════
    ...
    return {"emotion_code": 0, "faces": 5, "positive": 3, "negative": 1, "neutral": 1}
```

---

## ⚡ Flow การทำงาน

```
Browser (GitHub Pages)
  ↓ เปิดกล้อง Webcam
  ↓ ถ่ายภาพนิ่ง 1 ภาพ ทุก 60 วินาที
  ↓ แปลงเป็น Base64 JPEG
  ↓ POST /predict → Ngrok URL → localhost:8000
Server (คอมบ้าน)
  ↓ Decode Base64 → PIL Image
  ↓ ส่งเข้าโมเดล AI วิเคราะห์อารมณ์
  ↓ Return { emotion_code, faces, positive, negative, neutral }
Browser
  ↓ อัปเดต UI, กราฟ, สถิติ
```
