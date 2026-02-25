import osmium
import json

class StreetLampHandler(osmium.SimpleHandler):
    def __init__(self, output_file):
        super().__init__()
        self.outfile = output_file
        self.first = True
        # Start GeoJSON
        self.outfile.write('{"type":"FeatureCollection","features":[')

    def node(self, n):
        # Check if node has highway=street_lamp
        if 'highway' in n.tags and n.tags['highway'] == 'street_lamp':
            if not self.first:
                self.outfile.write(',')
            self.first = False

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [n.location.lon, n.location.lat]
                },
                "properties": dict(n.tags)
            }

            self.outfile.write(json.dumps(feature))

    def close(self):
        self.outfile.write(']}')  # Close GeoJSON

# Path to your India OSM PBF
osm_file = "india-260223.osm.pbf"

# Output file
output_file = "streetlights_india.geojson"

with open(output_file, "w") as f:
    handler = StreetLampHandler(f)
    print("Processing India OSM file. This may take a while...")
    handler.apply_file(osm_file, locations=True)
    handler.close()

print(f"Streetlight data saved to {output_file}")