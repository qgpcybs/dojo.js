import { Tileset } from "../../artTypes/world";
import { PhaserLayer } from "..";
import { createNoise2D } from "simplex-noise";

export function mapSystem(layer: PhaserLayer) {
    const {
        scenes: {
            Main: {
                maps: {
                    Main: { putTileAt },
                },
            },
        },
    } = layer;

    const noise = createNoise2D();

    for (let x = -500; x < 500; x++) {
        for (let y = -500; y < 500; y++) {
            const coord = { x, y };
            const seed = noise(x, y);

            putTileAt(coord, Tileset.Grass, "Background");

            if (seed >= 0.45) {
                putTileAt(coord, Tileset.Mountains, "Foreground");
            } else if (seed < -0.45) {
                putTileAt(coord, Tileset.Forest, "Foreground");
            }
        }
    }
}
