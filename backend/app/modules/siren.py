import os
import subprocess
import pickle
import shutil as _shutil
import numpy as np
import pandas as pd
import librosa

BASE_DIR = os.path.dirname(__file__)

with open(os.path.join(BASE_DIR, "model.pkl"), "rb") as f:
    model = pickle.load(f)

with open(os.path.join(BASE_DIR, "scaler.pkl"), "rb") as f:
    scaler = pickle.load(f)

with open(os.path.join(BASE_DIR, "features.pkl"), "rb") as f:
    selected_features = pickle.load(f)

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
    system_ffmpeg = _shutil.which('ffmpeg')
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None

FFMPEG_PATH = find_ffmpeg()

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

class SirenDetector:
    def predict_audio(self, filepath: str):
        """Load audio file, extract features, scale, and predict."""
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

            df_features = df_features[selected_features]
            scaled = scaler.transform(df_features)

            prediction = model.predict(scaled)[0]
            confidence = None
            if hasattr(model, "predict_proba"):
                proba = model.predict_proba(scaled)[0]
                confidence = round(float(max(proba)) * 100, 2)

            label = "Emergency" if prediction == 1 else "Non-Emergency"
            return label, confidence
        finally:
            if converted_path and os.path.exists(converted_path):
                os.remove(converted_path)
