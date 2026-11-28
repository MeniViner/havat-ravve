// Illustrative paths from the Open Design map. Loaded exclusively inside the demo store.
import { U } from '../data';
import type { Mode, Trail } from '../../survey/model';
import type { Slice } from './types';
import { put } from './types';

const paths: { id: string; name: string; modes: Mode[]; ends: string[]; coords: [number, number][] }[] = [
  {
    id: "demo-trail-walk", name: "שביל החממה", modes: ["walk"],
    ends: ["demo-p-gate","demo-p-greenhouse"],
    coords: [[31.2412, 34.7301], [31.24136, 34.73023], [31.24148, 34.73041], [31.24153, 34.73049], [31.24165, 34.73061], [31.24171, 34.73072], [31.2418, 34.7309], [31.24185, 34.73113], [31.24198, 34.73134], [31.24202, 34.73151], [31.2421, 34.7318]],
  },
  {
    id: "demo-trail-vehicles", name: "דרך המשק", modes: ["walk","vehicle"],
    ends: ["demo-p-gate","demo-p-petting"],
    coords: [[31.2412, 34.7301], [31.24116, 34.73026], [31.2411, 34.73042], [31.24104, 34.73057], [31.241, 34.73073], [31.24102, 34.73086], [31.2411, 34.73106], [31.24123, 34.73128], [31.24131, 34.73147], [31.24132, 34.73169], [31.24135, 34.73195], [31.2414, 34.73221], [31.2415, 34.7325]],
  },
  {
    id: "demo-trail-north", name: "השביל הצפוני", modes: ["walk"],
    ends: ["demo-p-tree","demo-p-pots"],
    coords: [[31.2418, 34.7309], [31.242, 34.7308], [31.24211, 34.7307], [31.24221, 34.73053], [31.24228, 34.73034], [31.24232, 34.73015], [31.2424, 34.72999], [31.2425, 34.7298]],
  }
];

const seedMap: Slice = (seed) => {
  for (const path of paths) {
    const points = path.coords.map(([lat, lng], i) => ({ seq: i + 1, segment: 1, lat, lng }));
    const trail: Trail = {
      id: path.id, name: path.name, modes: path.modes, ownerUid: U.beni,
      recordingId: path.id, revision: 'r1', geometry: 'g1', status: 'confirmed',
      count: points.length, chunks: 1, updatedAt: Date.UTC(2026, 10, 18),
      connections: path.ends.flatMap((targetId, i) => {
        const point = i === 0 ? points[0] : points[points.length - 1];
        return path.modes.map(mode => ({
          at: point.seq, mode, target: 'place' as const, targetId, lat: point.lat, lng: point.lng,
          targetVertex: 0, targetGeometry: '',
        }));
      }),
    };
    put(seed, 'farmTrails', [trail]);
    put(seed, 'farmTrails/' + trail.id + '/versions/g1/chunks', [{ id: '0', index: 0, points }]);
  }
};
export default seedMap;
