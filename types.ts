export enum EntityType {
  PLAYER,
  ENEMY_RUNNER,
  ENEMY_TURRET,
  BULLET_PLAYER,
  BULLET_ENEMY,
  PARTICLE,
  PLATFORM
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  type: EntityType;
  pos: Vector2;
  vel: Vector2;
  size: Vector2;
  color: string;
  health: number;
  active: boolean;
  facing: 1 | -1; // 1 = right, -1 = left
  state?: string; // 'idle', 'run', 'jump', 'duck'
  frameTimer?: number;
  frameIndex?: number;
  grounded?: boolean;
  cooldown?: number;
}

export interface GameState {
  score: number;
  lives: number;
  gameOver: boolean;
  gameWon: boolean;
  highScore: number;
}

export type InputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  shoot: boolean;
};