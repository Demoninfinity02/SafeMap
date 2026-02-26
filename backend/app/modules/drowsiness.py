import base64
import os
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

class DrowsinessDetector:
    def __init__(self):
        model_path = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
        )
        self.landmarker = FaceLandmarker.create_from_options(options)
        self.THRESHOLD = 0.25
        # Mediapipe canonical eye landmark indices
        self.L_EYE = [362, 385, 387, 263, 373, 380]
        self.R_EYE = [33, 160, 158, 133, 153, 144]

    def _calculate_ear(self, landmarks, eye_indices, w, h):
        def pt(idx):
            lm = landmarks[idx]
            return np.array([lm.x * w, lm.y * h])
        v1 = np.linalg.norm(pt(eye_indices[1]) - pt(eye_indices[5]))
        v2 = np.linalg.norm(pt(eye_indices[2]) - pt(eye_indices[4]))
        horiz = np.linalg.norm(pt(eye_indices[0]) - pt(eye_indices[3]))
        if horiz == 0.0:
            return 0.0
        return (v1 + v2) / (2.0 * horiz)

    def analyze_frame(self, base64_image: str):
        try:
            if ',' in base64_image:
                base64_image = base64_image.split(',')[1]

            img_data = base64.b64decode(base64_image)
            nparr = np.frombuffer(img_data, np.uint8)

            # Decode using mediapipe Image
            import cv2
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                return {"status": "error", "message": "Invalid image"}

            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

            result = self.landmarker.detect(mp_image)

            if not result.face_landmarks or len(result.face_landmarks) == 0:
                return {"status": "error", "message": "No face detected"}

            landmarks = result.face_landmarks[0]
            ear = (self._calculate_ear(landmarks, self.L_EYE, w, h) +
                   self._calculate_ear(landmarks, self.R_EYE, w, h)) / 2.0

            if ear < self.THRESHOLD:
                return {"status": "success", "eyes_closed": True, "ear": float(ear)}
            else:
                return {"status": "success", "eyes_closed": False, "ear": float(ear)}

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {"status": "error", "message": str(e)}
