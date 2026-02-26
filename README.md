# SafeMap

> **The world's first Urban Safety & Health Intelligence Platform that prioritizes your life over your clock.**

Current navigation apps are obsessed with time but blind to humanity. They route us through toxic pollution, dark isolated streets, and over hazardous roads — just to save sixty seconds. **SafeMap changes that.**

---
### App to download link

https://github.com/Demoninfinity02/SafeMap/releases/tag/v1.0
---

## Features

### 1. Dynamic Safety Index

Each route is evaluated using **street light density, crowding levels, safety conditions, and environmental factors** to produce a real-time Safety Score.

- Search a destination and see **multiple route options** with a safety score beside each.
- Instead of just the fastest route, SafeMap suggests the **safest optimal route**.
- Routes are dynamically re-ranked as live conditions change.

#### Factor Weighting Strategy

Not every risk affects safety equally — our model prioritizes **direct threats to life first**.

| Factor | Impact | Normal Weight | Women Mode Weight |
|--------|--------|:---:|:---:|
| Crime history | Direct physical danger | 0.40 | 0.50 ↑ |
| Street lighting | Crime deterrent | 0.25 | 0.30 ↑ |
| Crowd density | Social protection | 0.15 | 0.15 — |
| Potholes | Accident risk | 0.20 | 0.05 ↓ |

**Formulas:**

$$\text{SafetyScore} = 0.40 \times \text{Crime} + 0.25 \times \text{Lighting} + 0.20 \times \text{Potholes} + 0.15 \times \text{Crowd}$$

$$\text{WomenSafetyScore} = 0.50 \times \text{Crime} + 0.30 \times \text{Lighting} + 0.15 \times \text{Crowd} + 0.05 \times \text{Potholes}$$

---

### 2. Collaborative Pothole & Hazard Network

Using the **accelerometer and gyroscope** already built into every smartphone, SafeMap automatically fingerprints road hazards.

- Potholes are detected in real time while driving — no manual input needed.
- Detected hazards are **instantly shared** with every user navigating the same route, creating a **live, crowdsourced safety map**.
- Every driver in the network is warned **before they hit a single bump**.

---

### 3. AI-Powered Incident Reporting & SOS

Users can report live incidents by uploading photos and descriptions.

- **AI summarizes, analyzes, and classifies** the incident automatically.
- Alerts are broadcast in real time — dynamically recalculating nearby users' routes.
- Built-in **SOS system** allows users to instantly call emergency numbers with one tap.

---

### 4. Multi-Device Emergency Vehicle AI Detection (Sensor Mesh Network)

SafeMap uses **edge-AI (a trained Random Forest ML model)** to detect emergency sirens through the device microphone.

- Nearby devices automatically form a **Sensor Mesh Network** — a decentralized, real-time communication layer between all SafeMap users on the road.
- To eliminate false alarms, the system requires **multi-device confirmation** — all drivers within a **400m range** must corroborate the detection through the mesh.
- Once confirmed, a **route-wide "Give Way" alert** propagates across the mesh to nearby drivers.
- This significantly cuts down emergency response times — and **saves lives**.

---

### 5. Women's Night Safety & Infrastructure Mode

A specialized **Women's Mode** analyzes street lighting density, foot traffic data, and identifies narrow or isolated roads.

- Isolated and poorly lit routes are **intentionally penalized** in routing.
- Navigation after dark always prioritizes **visibility and public safety** over speed.
- Unsafe roads are highlighted in **red**; safer, well-lit roads in **green**.

---

### 6. Pre-Ride Drowsiness Guard

Before the engine even starts, SafeMap uses **high-precision MediaPipe AI** to scan for fatigue and eye irritation via the front camera.

- Real-time **eye-blink and facial landmark detection**.
- If fatigue is detected, the system warns: **"Driver Fatigue Detected — Please Rest"**.
- Ensures you are mentally and physically fit to drive **before you enter the flow of traffic**.

---

## Impact

| Area | How SafeMap Helps |
|------|-------------------|
| **Road Accidents** | Real-time pothole & hazard warnings reduce collision risk |
| **Emergency Response** | Multi-device siren detection clears roads for ambulances & fire trucks |
| **Women's Safety** | Night-safe routing through well-lit, high-traffic corridors |
| **Drowsy Driving** | Pre-ride fatigue checks prevent impaired driving |
| **Community Safety** | Crowdsourced incident reporting creates a live urban intelligence layer |

> *"SafeMap — because reaching faster means nothing if you don't reach safer."*

---

## System Architecture

### High Level System Design

<img width="1806" height="882" alt="Screenshot 2026-02-25 161816" src="https://github.com/user-attachments/assets/43ffca94-6a34-4fa0-bda8-292542e8fd25" />

---

### Low Level System Design

<img width="1016" height="750" alt="Screenshot 2026-02-25 at 7 57 08 PM" src="https://github.com/user-attachments/assets/ab7acb48-7518-4494-80c3-69aa9dc1814d" />

---

### DB Schema

<img width="3602" height="1644" alt="safemap_Sensor_Mesh_Network" src="https://github.com/user-attachments/assets/df8ff90e-af57-4828-9dac-6035554a88d7" />

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Mobile Frontend** | React Native |
| **Database** | Firestore |
| **Maps & Navigation** | Mapbox API |
| **LLM / AI Assistant** | Ollama 3.1 |
| **Sound Classification** | Random Forest ML Model |
| **LLM Orchestration** | LangChain |
| **Image Processing** | OpenCV |
| **Backend API** | FastAPI |

---

## Getting Started

### 1. Running Application

#### OPTION 1 (RECOMMENDED) : Install .apk file from GitHub releases

1. Install apk files from **GitHub releases** and start using the application.
2. To connect backend, open the app, go to **Settings**, scroll to the bottom, and enter the IP address of the computer where the backend is running.

#### OPTION 2 : DEV MODE — Run application using laptop

##### Prerequisites

- **Node.js**: v18 or higher recommended
- **Python**: v3.9 or higher recommended
- **Expo CLI**: `npm install -g expo-cli`
- **Android Studio / Android SDK**: Required if you want to run the native Android build locally.
- **Physical Android Device**: Recommended for testing hardware features (Camera, Microphone).

##### Environment Variables

```
EXPO_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

##### Installing Dependencies

Navigate to `safe_map_git` — it contains the whole codebase for the mobile app, as well as the fully integrated backend.

1. Install Node dependencies:
   ```bash
   npm install
   ```

2. Rebuild and run the native Android app.
   Connect your physical Android device via USB (with USB Debugging enabled), then run:
   ```bash
   npx expo run:android
   ```
   This command will:
   - Generate the missing `android/` directory (Prebuild phase).
   - Compile the native Android APK.
   - Install the app on your connected device.
   - Start the Metro Bundler terminal.

**For subsequent runs:** If you haven't added any new native packages, you don't need to rebuild the APK. Just run `npx expo start` and open the app on your phone.

---

### 2. Running Backend

The backend powers the AI routing, Siren Detection, and Drowsiness checks.

1. Navigate to the backend folder:
   ```bash
   cd safe_map_git/backend
   ```
2. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *(Using `0.0.0.0` is crucial so your phone can access the server over your local Wi-Fi).*

**Note your computer's local IP address** (e.g., `192.168.1.5` or `10.1.7.47`). You will need this to connect the app later.

---
