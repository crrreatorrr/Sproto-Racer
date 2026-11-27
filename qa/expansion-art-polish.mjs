import assert from 'node:assert/strict';
import { Scene } from 'three';
import { CIRCUITS } from '../src/circuits.js';
import { createTrack } from '../src/track.js';

// Inspect the same scene constructor the live browser races use. All added
// pavement and sky guides must stay finite and within their visual budget.
for (const course of CIRCUITS.slice(-3)) {
  const scene = new Scene();
  const track = createTrack(scene, course);
  assert.equal(track.sections.length, 12);
  const tiles = [];
  const guides = [];
  track.trackGroup.traverse(mesh => {
    if (mesh.name === 'pavedCircuit') tiles.push(mesh);
    if (mesh.name === 'sky-lane-width-guide') guides.push(mesh);
  });
  assert.ok(tiles.length > 5 && tiles.length < 160, course.id + ': tile batching');
  assert.equal(guides.length, 2 * track.sky.lanes.length);
  let pavedTriangles = 0;
  for (const { geometry } of tiles) {
    const { position, normal, color, aPavement } = geometry.attributes;
    for (const attr of [position, normal, color, aPavement]) {
      assert.equal(attr.count, position.count);
      assert.ok(attr.array.every(Number.isFinite), course.id + ': nonfinite road vertex');
    }
    pavedTriangles += position.count / 3;
  }
  assert.ok(pavedTriangles > 4000 && pavedTriangles < 260000, course.id + ': road triangle budget');
  for (const {geometry, material} of guides) {
    assert.ok(geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(material.transparent && !material.depthWrite && material.opacity < .4);
    assert.ok(geometry.index.array.every(i => i < geometry.attributes.position.count));
  }
  console.log(course.id, {tiles:tiles.length, pavedTriangles, guides:guides.length});
  track.dispose();
  assert.equal(scene.children.length, 0);
}
