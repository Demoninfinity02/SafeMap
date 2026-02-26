import osmium
import json

class StreetLampHandler(osmium.SimpleHandler):
    def __init__(self, output_file):
        super().__init__()
        self.output = open(output_file, "w")
        self.output.write('{"type":"FeatureCollection","features":[\n')
        self.first = True
        self.count = 0

    def node(self, n):
        if (
            ('highway' in n.tags and n.tags['highway'] == 'street_lamp') or
            ('man_made' in n.tags and n.tags['man_made'] == 'street_lamp')
        ):
            if not n.location.valid():
                return

            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [n.location.lon, n.location.lat]
                },
                "properties": dict(n.tags)
            }

            if not self.first:
                self.output.write(",\n")
            else:
                self.first = False

            self.output.write(json.dumps(feature))
            self.count += 1

            if self.count % 10000 == 0:
                print(f"Extracted {self.count} streetlights...")

    def close(self):
        self.output.write("\n]}")
        self.output.close()


handler = StreetLampHandler("streetlight.geojson")
handler.apply_file("india-260223.osm.pbf", locations=True)
handler.close()

print(f"\n✅ Finished! Total streetlights extracted: {handler.count}")