import { parseRobot, type RobotConfig } from '../control/robot';
import { parseAssembly, type Assembly } from './assembly';

/** One robot: its drive/physics config plus how its parts fit together. */
export interface RobotProfile {
  /** Folder name under robots/, also used for the model file and ?robot=. */
  id: string;
  name: string;
  robot: RobotConfig;
  assembly: Assembly;
}

// Every robots/<id>/ folder with both files becomes a profile.
const robotFiles = import.meta.glob('../../robots/*/robot.json', { eager: true, import: 'default' });
const assemblyFiles = import.meta.glob('../../robots/*/assembly.json', { eager: true, import: 'default' });

const idOf = (path: string) => path.split('/').at(-2)!;

export const DEFAULT_ROBOT_ID = 'yakrobot-4wd';

export const PROFILES: RobotProfile[] = Object.entries(robotFiles)
  .map(([path, raw]) => {
    const id = idOf(path);
    const asmPath = path.replace('robot.json', 'assembly.json');
    if (!(asmPath in assemblyFiles)) throw new Error(`robots/${id} has robot.json but no assembly.json`);
    const robot = parseRobot(raw);
    return { id, name: robot.name, robot, assembly: parseAssembly(assemblyFiles[asmPath]) };
  })
  // default robot first, then alphabetical
  .sort((a, b) => (a.id === DEFAULT_ROBOT_ID ? -1 : b.id === DEFAULT_ROBOT_ID ? 1 : a.id.localeCompare(b.id)));

export function getProfile(id: string | null | undefined): RobotProfile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES.find((p) => p.id === DEFAULT_ROBOT_ID) ?? PROFILES[0];
}

/** GLB built by `npm run model` for this robot. */
export const modelPath = (id: string) => `models/${id}.glb`;
