from pydantic import BaseModel
from typing import List, Dict, Any

class UserProfile(BaseModel):
    respiratory_issue: bool
    low_eyesight: bool

class RouteRequest(BaseModel):
    source: List[float]
    destination: List[float]
    user_profile: UserProfile

class RouteResponse(BaseModel):
    best_route_index: int
    ai_reasoning: str
    gas_concentrations: Dict[str, float]
    route_geometry: Any