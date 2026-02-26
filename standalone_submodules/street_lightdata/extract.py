import osmium
import json
import geohash2

# Corrected bounding boxes for all Indian states and UTs
states_bbox = {
    "Andhra_Pradesh": (12.0, 19.0, 77.0, 84.0),
    "Arunachal_Pradesh": (26.8, 29.3, 91.0, 97.0),
    "Assam": (24.0, 28.2, 89.5, 96.0),
    "Bihar": (24.0, 27.5, 83.0, 88.3),
    "Chhattisgarh": (17.5, 24.0, 80.0, 84.5),
    "Goa": (14.9, 15.7, 73.7, 74.2),
    "Gujarat": (20.0, 24.7, 68.0, 74.5),
    "Haryana": (27.0, 30.8, 74.5, 77.5),
    "Himachal_Pradesh": (30.4, 33.3, 75.8, 78.3),
    "Jharkhand": (22.0, 25.0, 83.0, 87.0),
    "Karnataka": (11.5, 18.5, 74.0, 78.5),
    "Kerala": (8.0, 12.0, 74.5, 77.5),
    "Madhya_Pradesh": (21.0, 26.0, 74.0, 82.0),
    "Maharashtra": (15.6, 22.0, 72.5, 80.9),
    "Manipur": (23.8, 25.9, 93.0, 95.3),
    "Meghalaya": (25.0, 26.5, 89.8, 92.0),
    "Mizoram": (21.9, 24.3, 92.6, 93.3),
    "Nagaland": (25.6, 27.2, 93.4, 95.4),
    "Odisha": (17.8, 22.3, 81.0, 87.0),
    "Punjab": (29.5, 32.3, 73.8, 76.5),
    "Rajasthan": (23.3, 30.1, 69.5, 78.0),
    "Sikkim": (27.0, 28.2, 88.0, 88.9),
    "Tamil_Nadu": (8.0, 13.5, 76.0, 80.5),
    "Telangana": (16.5, 19.5, 77.0, 81.5),
    "Tripura": (22.5, 24.0, 91.0, 92.0),
    "Uttar_Pradesh": (24.0, 30.0, 77.0, 84.0),
    "Uttarakhand": (28.9, 31.3, 77.5, 81.0),
    "West_Bengal": (21.5, 27.0, 85.0, 89.9),
    "Jammu_and_Kashmir": (32.5, 36.8, 72.5, 80.5),
    "Ladakh": (32.5, 36.0, 76.0, 80.0),
    "Chandigarh": (30.7, 30.8, 76.7, 76.8),
    "Dadra_and_Nagar_Haveli_and_Daman_and_Diu": (20.0, 20.5, 72.8, 73.1),
    "Delhi": (28.4, 28.9, 76.8, 77.3),
    "Puducherry": (11.9, 12.0, 79.8, 79.9),
    "Andaman_and_Nicobar": (6.7, 13.7, 92.0, 93.0),
    "Lakshadweep": (10.0, 12.0, 71.0, 73.0)
}

class StreetLampStateHandler(osmium.SimpleHandler):
    def __init__(self, outfile, bbox):
        super().__init__()
        self.outfile = outfile
        self.lat_min, self.lat_max, self.lon_min, self.lon_max = bbox
        self.first = True
        self.outfile.write('{"type":"FeatureCollection","features":[')

    def node(self, n):
        if 'highway' in n.tags and n.tags['highway'] == 'street_lamp':
            lat, lon = n.location.lat, n.location.lon
            if self.lat_min <= lat <= self.lat_max and self.lon_min <= lon <= self.lon_max:
                if not self.first:
                    self.outfile.write(',')
                self.first = False

                # Compute geohash (precision 9 ~ ~5m)
                geo = geohash2.encode(lat, lon, precision=9)

                feature = {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": dict(n.tags),
                    "geohash": geo
                }
                self.outfile.write(json.dumps(feature))

    def close(self):
        self.outfile.write(']}')

# Input India PBF
input_file = "india-260223.osm.pbf"

# Process each state separately
for state, bbox in states_bbox.items():
    output_file = f"streetlights_{state}.geojson"
    print(f"Processing {state}...")
    with open(output_file, "w") as f:
        handler = StreetLampStateHandler(f, bbox)
        handler.apply_file(input_file, locations=True)
        handler.close()
    print(f"{state} streetlights saved to {output_file}")
    