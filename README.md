# SafeMap

### HIGH LEVEL SYSTEM DESIGN OF SAFEMAP APPLICATION.

<img width="1806" height="882" alt="Screenshot 2026-02-25 161816" src="https://github.com/user-attachments/assets/43ffca94-6a34-4fa0-bda8-292542e8fd25" />

---
### LOW LEVEL SYSTEM DESIGN OF SAFEMAP APPLICATION.

<img width="1016" height="750" alt="Screenshot 2026-02-25 at 7 57 08 PM" src="https://github.com/user-attachments/assets/ab7acb48-7518-4494-80c3-69aa9dc1814d" />

---

### DB Schema

<img width="3602" height="1644" alt="safemap_Sensor_Mesh_Network" src="https://github.com/user-attachments/assets/df8ff90e-af57-4828-9dac-6035554a88d7" />

---

### 🛠️ Tech Stack

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

## 1. Running Application

### OPTION 1 (RECOMMENDED) : Install .apk file from github releases

1. Install apk files from **github releases** and start using application
2. To connect backend, open app, go to settings and then scroll to bottom to setup ip address of the computer where backend is running (more on that down)

### OPTION 2 : DEV MODE, run application using laptop

#### 1. Prerequisites : 

- **Node.js**: (v18 or higher recommended)
- **Python**: (v3.9 or higher recommended)
- **Expo CLI**: `npm install -g expo-cli`
- **Android Studio / Android SDK**: Required if you want to run the native Android build locally.
- **Physical Android Device**: Recommended for testing hardware features (Camera, Microphone).

#### 2. Enviroment Variables: 

`EXPO_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here`

#### 3. Installing Dependencies

Navigate to `safe_map_git` it contains whole codebase for mobile app, as well as fully integrated backend

1. Install Node dependencies:
   ```bash
   npm install
   ```
   *(This creates the `node_modules` folder).*

2. Rebuild and run the native Android app:
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


## 🔌 2. Running Backend

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
