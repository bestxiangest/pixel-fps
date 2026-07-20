import * as THREE from 'three';
import PF from 'pathfinding';
import type { AABB } from './collision';
import { MAP_HALF } from './map';

const CELL_SIZE = 3;
const NAV_MARGIN = 3;
const UNIT_CLEARANCE = 0.85;

interface GridPoint {
  x: number;
  z: number;
}

/**
 * 从地图 AABB 构建的静态导航网格。Grid 在寻路时会被算法修改，
 * 因此每次查询都 clone，基础网格始终保持只读。
 */
export class NavigationGrid {
  private readonly min = -MAP_HALF + NAV_MARGIN;
  private readonly max = MAP_HALF - NAV_MARGIN;
  private readonly size = Math.floor((this.max - this.min) / CELL_SIZE) + 1;
  private readonly grid: PF.Grid;
  private readonly finder = new PF.AStarFinder({
    diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles,
  });

  constructor(obstacles: AABB[]) {
    const matrix = Array.from({ length: this.size }, () =>
      Array<number>(this.size).fill(0),
    );

    for (const obstacle of obstacles) {
      const minCell = this.worldToCell(
        obstacle.min.x - UNIT_CLEARANCE,
        obstacle.min.z - UNIT_CLEARANCE,
      );
      const maxCell = this.worldToCell(
        obstacle.max.x + UNIT_CLEARANCE,
        obstacle.max.z + UNIT_CLEARANCE,
      );
      for (let z = minCell.z; z <= maxCell.z; z++) {
        for (let x = minCell.x; x <= maxCell.x; x++) {
          matrix[z][x] = 1;
        }
      }
    }
    this.grid = new PF.Grid(matrix);
  }

  private worldToCell(x: number, z: number): GridPoint {
    return {
      x: THREE.MathUtils.clamp(
        Math.round((x - this.min) / CELL_SIZE),
        0,
        this.size - 1,
      ),
      z: THREE.MathUtils.clamp(
        Math.round((z - this.min) / CELL_SIZE),
        0,
        this.size - 1,
      ),
    };
  }

  private cellToWorld(x: number, z: number): GridPoint {
    return {
      x: this.min + x * CELL_SIZE,
      z: this.min + z * CELL_SIZE,
    };
  }

  private nearestWalkable(cell: GridPoint, maxRadius = 9): GridPoint | null {
    if (this.grid.isWalkableAt(cell.x, cell.z)) return cell;
    for (let radius = 1; radius <= maxRadius; radius++) {
      let best: GridPoint | null = null;
      let bestDistance = Infinity;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const x = cell.x + dx;
          const z = cell.z + dz;
          if (!this.grid.isInside(x, z) || !this.grid.isWalkableAt(x, z)) continue;
          const distance = dx * dx + dz * dz;
          if (distance < bestDistance) {
            best = { x, z };
            bestDistance = distance;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  isWalkable(x: number, z: number): boolean {
    const cell = this.worldToCell(x, z);
    return this.grid.isWalkableAt(cell.x, cell.z);
  }

  findNearestWalkablePosition(
    x: number,
    z: number,
    occupied: GridPoint[] = [],
    minSeparation = 0,
  ): GridPoint {
    const requested = this.worldToCell(x, z);
    const separated = (candidate: GridPoint) => {
      const world = this.cellToWorld(candidate.x, candidate.z);
      return occupied.every(
        point => Math.hypot(point.x - world.x, point.z - world.z) >= minSeparation,
      );
    };
    for (let radius = 0; radius <= 14; radius++) {
      let best: GridPoint | null = null;
      let bestDistance = Infinity;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const cell = { x: requested.x + dx, z: requested.z + dz };
          if (
            !this.grid.isInside(cell.x, cell.z) ||
            !this.grid.isWalkableAt(cell.x, cell.z) ||
            !separated(cell)
          ) {
            continue;
          }
          const distance = dx * dx + dz * dz;
          if (distance < bestDistance) {
            best = cell;
            bestDistance = distance;
          }
        }
      }
      if (best) return this.cellToWorld(best.x, best.z);
    }
    const fallback = this.nearestWalkable(requested);
    return fallback ? this.cellToWorld(fallback.x, fallback.z) : { x, z };
  }

  /** 沿线采样导航格，快速判断是否可以直达。 */
  hasLineOfTravel(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.max(1, Math.ceil(distance / (CELL_SIZE * 0.45)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cell = this.worldToCell(
        THREE.MathUtils.lerp(fromX, toX, t),
        THREE.MathUtils.lerp(fromZ, toZ, t),
      );
      if (!this.grid.isWalkableAt(cell.x, cell.z)) return false;
    }
    return true;
  }

  findPath(fromX: number, fromZ: number, toX: number, toZ: number): GridPoint[] {
    if (this.hasLineOfTravel(fromX, fromZ, toX, toZ)) {
      return [{ x: toX, z: toZ }];
    }

    const start = this.nearestWalkable(this.worldToCell(fromX, fromZ));
    const end = this.nearestWalkable(this.worldToCell(toX, toZ));
    if (!start || !end) return [];

    const workingGrid = this.grid.clone();
    const rawPath = this.finder.findPath(
      start.x,
      start.z,
      end.x,
      end.z,
      workingGrid,
    );
    if (rawPath.length < 2) return [];

    const compressed = PF.Util.compressPath(rawPath);
    const points = compressed
      .slice(1)
      .map(([x, z]) => this.cellToWorld(x, z));
    if (this.isWalkable(toX, toZ)) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(last.x - toX, last.z - toZ) > 0.5) {
        points.push({ x: toX, z: toZ });
      }
    }
    return points;
  }
}
