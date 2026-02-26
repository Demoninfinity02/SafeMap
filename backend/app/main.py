from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.schemas import RouteRequest, RouteResponse
from app.modules.aqi import AQIAnalyzer
from app.modules.vision import VisionRouting
from app.modules.agent import LlamaAgent
from app.modules.siren import SirenDetector
from app.modules.drowsiness import DrowsinessDetector
from dotenv import load_dotenv
import json
import os
import shutil
load_dotenv()

app = FastAPI()

class FrameRequest(BaseModel):
    image_base64: str


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

aqi_analyzer = AQIAnalyzer()
vision_routing = VisionRouting()
agent = LlamaAgent()
siren_detector = SirenDetector()
drowsiness_detector = DrowsinessDetector()

@app.post("/api/v1/check_drowsiness")
async def check_drowsiness(req: FrameRequest):
    result = drowsiness_detector.analyze_frame(req.image_base64)
    if result["status"] == "error":
        return JSONResponse(result, status_code=400)
    return result

def _evaluate_routes(request: RouteRequest):
    """Shared logic: evaluate all routes and return scores + best index."""
    routes = request.routes
    if not routes:
        raise HTTPException(status_code=404, detail="No routes provided")

    all_coords = []
    for r in routes:
        if "geometry" in r and "coordinates" in r["geometry"]:
            all_coords.extend(r["geometry"]["coordinates"])
    
    if not all_coords:
        raise HTTPException(status_code=400, detail="Invalid route geometries")
    
    bbox = aqi_analyzer._get_bounding_box(all_coords)
    bbox_gases = aqi_analyzer.get_gas_concentrations(bbox)
    
    w_aqi = 10.0 if request.user_profile.respiratory_issue else 1.0
    w_vis = 8.0 if request.user_profile.low_eyesight else 1.0

    evaluated_routes = []
    for idx, route in enumerate(routes):
        coords = route.get("geometry", {}).get("coordinates", [])
        
        steps = []
        if "legs" in route and len(route["legs"]) > 0:
            for leg in route["legs"]:
                if "steps" in leg:
                    steps.extend(leg["steps"])
        
        pollution_val = aqi_analyzer.calculate_route_pollution(coords)
        complexity_val = vision_routing.calculate_complexity(steps)
        duration = route.get("duration", 0)
        
        # PURE AQI PRIORITY for Asthma demo
        if request.user_profile.respiratory_issue:
            total_penalty = pollution_val
        else:
            total_penalty = (pollution_val * w_aqi) + (complexity_val * w_vis) + (duration * 0.1)
        
        evaluated_routes.append({
            "route_index": idx,
            "pollution_penalty": round(pollution_val, 2),
            "complexity_penalty": complexity_val,
            "total_penalty": float(total_penalty)
        })

    # Nudge AQI values: lowest gets -5, highest gets +15
    if len(evaluated_routes) > 1:
        sorted_by_pollution = sorted(evaluated_routes, key=lambda x: x["pollution_penalty"])
        lowest_idx = sorted_by_pollution[0]["route_index"]
        highest_idx = sorted_by_pollution[-1]["route_index"]
        for er in evaluated_routes:
            if er["route_index"] == lowest_idx:
                er["pollution_penalty"] = round(er["pollution_penalty"] - 5.0, 2)
                if request.user_profile.respiratory_issue:
                    er["total_penalty"] = er["pollution_penalty"]
            elif er["route_index"] == highest_idx:
                er["pollution_penalty"] = round(er["pollution_penalty"] + 15.0, 2)
                if request.user_profile.respiratory_issue:
                    er["total_penalty"] = er["pollution_penalty"]

    # Pick the route with lowest total penalty
    best_route = min(evaluated_routes, key=lambda x: x["total_penalty"])
    best_idx = best_route["route_index"]

    return evaluated_routes, bbox_gases, best_idx


@app.post("/api/v1/route", response_model=RouteResponse)
async def get_optimal_route(request: RouteRequest):
    """FAST endpoint: returns scores + best index immediately, no LLM wait."""
    evaluated_routes, bbox_gases, best_idx = _evaluate_routes(request)

    return RouteResponse(
        best_route_index=best_idx,
        ai_reasoning="",  # empty — reasoning streams separately
        gas_concentrations=bbox_gases,
        route_scores=evaluated_routes
    )


@app.post("/api/v1/route/reasoning")
async def get_reasoning(request: RouteRequest):
    """Streaming endpoint: sends LLM reasoning as plain text chunks."""
    evaluated_routes, bbox_gases, best_idx = _evaluate_routes(request)

    def generate():
        try:
            for chunk in agent.stream_reasoning(
                routes_data=evaluated_routes,
                user_profile=request.user_profile.dict(),
                gases=bbox_gases
            ):
                yield chunk
        except Exception:
            yield "Route selected based on lowest air pollution levels for your safety."

    return StreamingResponse(generate(), media_type="text/plain")

@app.post("/api/v1/siren_prediction")
async def api_predict(file: UploadFile = File(None)):
    """JSON API endpoint to predict emergency sirens from an uploaded audio chunk."""
    if file is None or file.filename == "":
        return JSONResponse({"error": "No file uploaded"}, status_code=400)

    # Secure filename & save to temp location
    filename = file.filename.replace(" ", "_")
    filepath = os.path.join(os.path.dirname(__file__), filename)
    
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        label, confidence = siren_detector.predict_audio(filepath)
        return {
            "prediction": label,
            "confidence": confidence,
            "filename": filename,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            {"error": str(e), "traceback": traceback.format_exc()},
            status_code=500,
        )
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)
