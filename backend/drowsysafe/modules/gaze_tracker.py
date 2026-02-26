import numpy as np
import time

class GazeTracker:
    def __init__(self):
        self.targets = [(0.2, 0.2), (0.8, 0.2), (0.5, 0.5), (0.2, 0.8), (0.8, 0.8)]
        self.current_target_idx = 0
        self.start_time = time.time()
        self.reaction_times = []

    def get_next_target(self, frame_shape):
        h, w = frame_shape[:2]
        tx, ty = self.targets[self.current_target_idx]
        return int(tx * w), int(ty * h)

    def check_gaze_accuracy(self, eye_center, target_pos):
        dist = np.linalg.norm(np.array(eye_center) - np.array(target_pos))
        if dist < 100:
            self.reaction_times.append(time.time() - self.start_time)
            self.current_target_idx += 1
            self.start_time = time.time()
            return True
        return False

    def is_complete(self):
        return self.current_target_idx >= len(self.targets)