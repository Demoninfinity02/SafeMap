import os
import requests

class VisionRouting:
    def __init__(self):
        self.api_key = os.getenv("MAPBOX_API_KEY")

    def get_mapbox_routes(self, source: list, dest: list) -> dict:
        coords = f"{source[0]},{source[1]};{dest[0]},{dest[1]}"
        url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords}"
        params = {
            "alternatives": "true",
            "geometries": "geojson",
            "steps": "true",
            "access_token": self.api_key
        }
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json()
        return {}

    def calculate_complexity(self, steps: list) -> float:
        penalty = 0.0
        for step in steps:
            maneuver_type = step.get('maneuver', {}).get('type')
            if maneuver_type in ['rotary', 'roundabout']:
                penalty += 100.0
            for intersection in step.get('intersections', []):
                if len(intersection.get('bearings', [])) > 4:
                    penalty += 20.0
                penalty += intersection.get('turn_weight', 0) * 10
        return penalty
    def get_mapbox_routes(self, source: list, dest: list) -> dict:
        coords = f"{source[0]},{source[1]};{dest[0]},{dest[1]}"
        url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords}"
        params = {
            "alternatives": "true",
            "geometries": "geojson",
            "steps": "true",
            "access_token": self.api_key
        }
        response = requests.get(url, params=params)
        
        if response.status_code == 200:
            return response.json()
            
        print(f"MAPBOX ERROR: {response.status_code} - {response.text}")
        return {}