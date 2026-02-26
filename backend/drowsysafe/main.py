import cv2
import mediapipe as mp
import numpy as np
from modules.eye_processor import calculate_ear
from modules.ui_overlay import draw_minimal_ui

THRESHOLD = 0.25
CONSEC_FRAMES = 15
COUNTER = 0

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True)
cap = cv2.VideoCapture(0)

L_EYE = [362, 385, 387, 263, 373, 380]
R_EYE = [33, 160, 158, 133, 153, 144]

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    status = "SCANNING..."
    
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            h, w, _ = frame.shape
            coords = np.array([(lm.x * w, lm.y * h) for lm in face_landmarks.landmark])
            ear = (calculate_ear(coords, L_EYE) + calculate_ear(coords, R_EYE)) / 2.0

            if ear < THRESHOLD:
                COUNTER += 1
                if COUNTER >= CONSEC_FRAMES:
                    status = "ALERT: NOT READY TO DRIVE"
                else:
                    status = "STABILIZING..."
            else:
                COUNTER = 0
                status = "READY TO DRIVE"

            for idx in [362, 33]:
                cv2.circle(frame, (int(coords[idx][0]), int(coords[idx][1])), 3, (0, 255, 0), -1)

    frame = draw_minimal_ui(frame, status)
    cv2.imshow('SafeMap AI', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()