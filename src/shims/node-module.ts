// Browser stand-in for Node's 'module' builtin, which MuJoCo's Emscripten
// loader only uses on its Node code path.
export const createRequire = (): never => {
  throw new Error('createRequire is not available in the browser');
};
export default { createRequire };
