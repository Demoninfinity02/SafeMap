"""
FastAPI app for Emergency Sound Detection.
Upload a .wav file and get a prediction: Emergency or Non-Emergency.
"""

import os
import subprocess
import pickle
import traceback
import shutil as _shutil

import numpy as np
import pandas as pd
import librosa
import uvicorn
from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from werkzeug.utils import secure_filename

# ── App configuration ─────────────────────────────────────────
app = FastAPI(title="Emergency Sound Detection")

BASE_DIR = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16 MB max
ALLOWED_EXTENSIONS = {"wav", "mp3", "ogg", "flac", "webm"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Mount static files & templates
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# ── Load trained artifacts ────────────────────────────────────
with open(os.path.join(BASE_DIR, "model.pkl"), "rb") as f:
    model = pickle.load(f)

with open(os.path.join(BASE_DIR, "scaler.pkl"), "rb") as f:
    scaler = pickle.load(f)

with open(os.path.join(BASE_DIR, "features.pkl"), "rb") as f:
    selected_features = pickle.load(f)


# ── Feature extraction (mirrors notebook logic) ──────────────
def extract_features(signal, sr):
    """Extract all audio features from a signal."""
    stft = np.abs(librosa.stft(y=signal))

    zcr = np.mean(librosa.feature.zero_crossing_rate(y=signal).T, axis=0)
    rms = np.mean(librosa.feature.rms(y=signal).T, axis=0)
    spec_cent = np.mean(librosa.feature.spectral_centroid(y=signal, sr=sr).T, axis=0)
    spec_bw = np.mean(librosa.feature.spectral_bandwidth(y=signal, sr=sr).T, axis=0)
    rolloff = np.mean(librosa.feature.spectral_rolloff(y=signal, sr=sr).T, axis=0)
    chroma = np.mean(librosa.feature.chroma_stft(S=stft, sr=sr).T, axis=0)
    mfcc = np.mean(librosa.feature.mfcc(y=signal, sr=sr).T, axis=0)
    mel = np.mean(librosa.feature.melspectrogram(y=signal, sr=sr).T, axis=0)
    contrast = np.mean(librosa.feature.spectral_contrast(S=stft, sr=sr).T, axis=0)
    tonnetz = np.mean(
        librosa.feature.tonnetz(y=librosa.effects.harmonic(y=signal), sr=sr).T, axis=0
    )

    return [zcr, rms, spec_cent, spec_bw, rolloff, chroma, mfcc, mel, contrast, tonnetz]


def split_features(features_list):
    """Convert raw feature arrays into a named DataFrame row."""
    df = pd.DataFrame({"features": [features_list]})

    df["zcr"] = df["features"].apply(lambda x: np.asarray(x[0]).flatten()[0])
    df["rms"] = df["features"].apply(lambda x: np.asarray(x[1]).flatten()[0])
    df["spec_cent"] = df["features"].apply(lambda x: np.asarray(x[2]).flatten()[0])
    df["spec_bw"] = df["features"].apply(lambda x: np.asarray(x[3]).flatten()[0])
    df["rolloff"] = df["features"].apply(lambda x: np.asarray(x[4]).flatten()[0])

    df_chroma = pd.DataFrame(
        df["features"].apply(lambda x: x[5]).tolist(),
        columns=[f"chroma{i}" for i in range(12)],
    )
    df_mfcc = pd.DataFrame(
        df["features"].apply(lambda x: x[6]).tolist(),
        columns=[f"mfcc{i}" for i in range(20)],
    )
    df_mel = pd.DataFrame(
        df["features"].apply(lambda x: x[7]).tolist(),
        columns=[f"mel{i}" for i in range(128)],
    )
    df_contrast = pd.DataFrame(
        df["features"].apply(lambda x: x[8]).tolist(),
        columns=[f"contrast{i}" for i in range(7)],
    )
    df_tonnetz = pd.DataFrame(
        df["features"].apply(lambda x: x[9]).tolist(),
        columns=[f"tonnetz{i}" for i in range(6)],
    )

    return pd.concat(
        [df[["zcr", "rms", "spec_cent", "spec_bw", "rolloff"]],
         df_chroma, df_mfcc, df_mel, df_contrast, df_tonnetz],
        axis=1,
    )


def find_ffmpeg():
    """Find ffmpeg binary path."""
    for path in ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']:
        if os.path.isfile(path):
            return path
    # fallback to PATH
    system_ffmpeg = _shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg
    # fallback to imageio-ffmpeg bundled binary
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


FFMPEG_PATH = find_ffmpeg()
print(f"[STARTUP] ffmpeg resolved to: {FFMPEG_PATH}")


def convert_to_wav(filepath):
    """Convert any audio file to wav using ffmpeg."""
    if not FFMPEG_PATH:
        print("ERROR: ffmpeg not found!")
        return None
    wav_path = filepath.rsplit('.', 1)[0] + '_converted.wav'
    try:
        subprocess.run(
            [FFMPEG_PATH, '-y', '-i', filepath, '-ar', '22050', '-ac', '1', wav_path],
            capture_output=True, check=True, timeout=30
        )
        return wav_path
    except subprocess.CalledProcessError as e:
        print(f"ffmpeg error: {e.stderr.decode()}")
        return None
    except Exception as e:
        print(f"convert_to_wav error: {e}")
        return None


def predict_audio(filepath):
    """Load audio file, extract features, scale, and predict."""
    # Convert non-wav formats (especially webm from browser mic) to wav
    ext = filepath.rsplit('.', 1)[-1].lower()
    converted_path = None
    if ext != 'wav':
        converted_path = convert_to_wav(filepath)
        if converted_path and os.path.exists(converted_path):
            filepath = converted_path

    try:
        audio, sr = librosa.load(filepath, res_type="kaiser_fast")
        raw_features = extract_features(audio, sr)
        df_features = split_features(raw_features)

        # Select only the features used during training
        df_features = df_features[selected_features]

        # Scale using the saved scaler
        scaled = scaler.transform(df_features)

        # Predict
        prediction = model.predict(scaled)[0]
        confidence = None
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(scaled)[0]
            confidence = round(float(max(proba)) * 100, 2)

        label = "Emergency 🚨" if prediction == 1 else "Non-Emergency ✅"
        return label, confidence
    finally:
        # Clean up converted file
        if converted_path and os.path.exists(converted_path):
            os.remove(converted_path)


# ── Helper ────────────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


async def save_upload(upload_file: UploadFile, dest: str):
    """Save an UploadFile to disk."""
    contents = await upload_file.read()
    with open(dest, "wb") as f:
        f.write(contents)


# ── Routes ────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/predict", response_class=HTMLResponse)
async def predict(request: Request, file: UploadFile = File(None)):
    if file is None or file.filename == "":
        return templates.TemplateResponse(
            "index.html", {"request": request, "error": "No file uploaded."}
        )

    if not allowed_file(file.filename):
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "error": f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            },
        )

    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    await save_upload(file, filepath)

    try:
        label, confidence = predict_audio(filepath)
    except Exception as e:
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "error": f"Error processing audio: {e}"},
        )
    finally:
        # Clean up uploaded file
        if os.path.exists(filepath):
            os.remove(filepath)

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "prediction": label,
            "confidence": confidence,
            "filename": filename,
        },
    )


@app.post("/api/predict")
async def api_predict(file: UploadFile = File(None)):
    """JSON API endpoint for programmatic access."""
    if file is None or file.filename == "":
        return JSONResponse({"error": "No file uploaded"}, status_code=400)

    if not allowed_file(file.filename):
        return JSONResponse({"error": "Invalid file type"}, status_code=400)

    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    await save_upload(file, filepath)

    try:
        label, confidence = predict_audio(filepath)
        return {
            "prediction": label,
            "confidence": confidence,
            "filename": filename,
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            {"error": str(e), "traceback": traceback.format_exc()},
            status_code=500,
        )
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


# ── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=5001, reload=True)
