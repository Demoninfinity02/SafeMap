from fastapi import FastAPI, HTTPException
from app.schemas import RouteRequest, RouteResponse
from app.modules.aqi import AQIAnalyzer
from app.modules.vision import VisionRouting
from app.modules.agent import LlamaAgent
from dotenv import load_dotenv
load_dotenv()


app = FastAPI()
aqi_analyzer = AQIAnalyzer()
vision_routing = VisionRouting()
agent = LlamaAgent()

@app.post("/api/v1/route", response_model=RouteResponse)
async def get_optimal_route(request: RouteRequest):
    mapbox_data = vision_routing.get_mapbox_routes(request.source, request.destination)
    if not mapbox_data or "routes" not in mapbox_data:
        raise HTTPException(status_code=400, detail="Mapbox fetch failed")

    routes = mapbox_data["routes"]
    if not routes:
        raise HTTPException(status_code=404, detail="No routes found")

    all_coords = []
    for r in routes:
        all_coords.extend(r["geometry"]["coordinates"])
    
    bbox = aqi_analyzer._get_bounding_box(all_coords)
    bbox_gases = aqi_analyzer.get_gas_concentrations(bbox)
    
    w_aqi = 5.0 if request.user_profile.respiratory_issue else 1.0
    w_vis = 5.0 if request.user_profile.low_eyesight else 1.0

    evaluated_routes = []
    for idx, route in enumerate(routes):
        coords = route["geometry"]["coordinates"]
        steps = route["legs"][0]["steps"]
        
        pollution_val = aqi_analyzer.calculate_route_pollution(coords)
        complexity_val = vision_routing.calculate_complexity(steps)
        
        total_penalty = (pollution_val * w_aqi) + (complexity_val * w_vis) + (route["duration"] * 0.1)
        
        evaluated_routes.append({
            "route_index": idx,
            "pollution_penalty": pollution_val,
            "complexity_penalty": complexity_val,
            "duration": route["duration"],
            "total_penalty": total_penalty
        })

    agent_decision = agent.evaluate_and_reason(
        routes_data=evaluated_routes,
        user_profile=request.user_profile.dict(),
        gases=bbox_gases
    )

    best_idx = agent_decision.get("best_route_index", 0)
    if best_idx >= len(routes):
        best_idx = 0

    return RouteResponse(
        best_route_index=best_idx,
        ai_reasoning=agent_decision.get("ai_reasoning", ""),
        gas_concentrations=bbox_gases,
        route_geometry=routes[best_idx]["geometry"]
    )