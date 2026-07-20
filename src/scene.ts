import * as THREE from 'three';
import { AABB } from './collision';
import { createSkyTexture } from './textures';
import { buildBattlefieldMap, MinimapFeature } from './map';
import { Terrain, MAP_HALF } from './terrain';

export interface SceneBundle {
  scene: THREE.Scene;
  obstacles: AABB[];
  minimap: MinimapFeature[];
  spawn: THREE.Vector3;
  sun: THREE.DirectionalLight;
  terrain: Terrain;
  /** 可被射击射线命中的对象 */
  shootables: THREE.Object3D[];
}

export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  // 白天晴空 · 大战场远雾
  scene.background = new THREE.Color(0xc9e3f8);
  scene.fog = new THREE.Fog(0xe8f0e4, 220, 560);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(720, 24, 16),
    new THREE.MeshBasicMaterial({
      map: createSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      color: 0xffffff,
    }),
  );
  sky.userData.noHit = true;
  scene.add(sky);

  scene.add(new THREE.AmbientLight(0xf2f6ff, 1.4));
  scene.add(new THREE.HemisphereLight(0xf2f8ff, 0xd4c29a, 1.25));

  const sun = new THREE.DirectionalLight(0xfffaeb, 2.6);
  sun.position.set(160, 200, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 520;
  const shadowExtent = MAP_HALF * 0.55;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.bias = -0.002;
  sun.shadow.normalBias = 0.04;
  sun.shadow.intensity = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xd4e5ff, 0.95);
  fill.position.set(-90, 60, -50);
  scene.add(fill);

  const terrain = new Terrain(scene, 140);
  terrain.mesh.userData.shootable = true;

  const mapData = buildBattlefieldMap(scene);

  return {
    scene,
    obstacles: mapData.obstacles,
    minimap: mapData.minimap,
    spawn: mapData.spawn,
    sun,
    terrain,
    shootables: [mapData.root, terrain.mesh],
  };
}
