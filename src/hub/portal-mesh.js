import * as THREE from 'three';

/** Standing ring on the paddock grid, beside the preview kart. */
export const HUB_PORTAL_POSITION = { x: 2.7, y: 0, z: -2.35 };
export const HUB_PORTAL_RING_Y = 1.7;

export function createHubPortal() {
  const group = new THREE.Group();
  group.name = 'hub-portal';
  group.position.set(HUB_PORTAL_POSITION.x, HUB_PORTAL_POSITION.y, HUB_PORTAL_POSITION.z);
  group.rotation.y = Math.PI;
  group.scale.setScalar(1.05);
  const stone = new THREE.MeshStandardMaterial({ color: '#1b2424', roughness: 0.72, metalness: 0.08 });
  const lime = new THREE.MeshStandardMaterial({
    color: '#163028', emissive: '#d5ee7a', emissiveIntensity: 1.55, roughness: 0.32, metalness: 0.18,
  });
  const discMat = new THREE.MeshBasicMaterial({
    color: '#b8fff0', transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 28), lime);
  ring.position.y = HUB_PORTAL_RING_Y;
  ring.name = 'hub-portal-ring';
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.88, 24), discMat);
  disc.position.y = HUB_PORTAL_RING_Y;
  disc.name = 'hub-portal-disc';
  const post = new THREE.BoxGeometry(0.16, 2.85, 0.16);
  const left = new THREE.Mesh(post, stone);
  left.position.set(-0.92, 1.45, 0);
  const right = new THREE.Mesh(post, stone);
  right.position.set(0.92, 1.45, 0);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.14, 0.2), lime);
  cap.position.y = 2.82;
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.1, 0.62), stone);
  sill.position.y = 0.05;
  group.add(sill, left, right, cap, disc, ring);
  return group;
}

export function animateHubPortal(group, time) {
  const ring = group.getObjectByName('hub-portal-ring');
  const disc = group.getObjectByName('hub-portal-disc');
  if (ring) ring.rotation.z = time * 0.4;
  if (disc?.material) disc.material.opacity = 0.3 + Math.sin(time * 2.1) * 0.12;
}
