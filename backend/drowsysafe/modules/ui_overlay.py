import cv2

def draw_minimal_ui(frame, status):
    h, w, _ = frame.shape
    cv2.rectangle(frame, (0, h-50), (w, h), (12, 12, 12), -1)
    
    color = (255, 255, 255)
    if "ALERT" in status:
        color = (100, 100, 255)
    
    cv2.putText(frame, status.upper(), (25, h-20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    return frame