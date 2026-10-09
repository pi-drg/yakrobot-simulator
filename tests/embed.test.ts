import { describe, expect, it } from 'vitest';
import { parseColor, parseOptions, parseOrigin } from '../src/embed/options';
import { MESSAGE_TYPE, parseCommand, resolve } from '../src/embed/api';

describe('page options', () => {
  it('defaults to the full app with the debug HUD', () => {
    expect(parseOptions('')).toEqual({ embed: false, hud: true, parentOrigin: null, robot: null, theme: {} });
  });

  it('embed mode hides the HUD unless asked for', () => {
    expect(parseOptions('?embed=1').hud).toBe(false);
    expect(parseOptions('?embed').embed).toBe(true);
    expect(parseOptions('?embed=1&hud=1').hud).toBe(true);
    expect(parseOptions('?embed=0').embed).toBe(false);
  });

  it('maps theme params to CSS variables, hex only', () => {
    const o = parseOptions('?accent=%23ff6600&stop=c00&panel=00000080&frame=url(x)');
    expect(o.theme).toEqual({ '--accent': '#ff6600', '--stop': '#c00', '--panel': '#00000080' });
  });

  it('rejects colours that could inject CSS', () => {
    expect(parseColor('red')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('#fff;background:url(x)')).toBeNull();
    expect(parseColor('ABCDEF')).toBe('#ABCDEF');
  });

  it('accepts only http(s) parent origins, normalised', () => {
    expect(parseOrigin('https://yakrobot.com/some/page?x=1')).toBe('https://yakrobot.com');
    expect(parseOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(parseOrigin('javascript:alert(1)')).toBeNull();
    expect(parseOrigin('not a url')).toBeNull();
    expect(parseOptions('?parent=https%3A%2F%2Fyakrobot.com').parentOrigin).toBe('https://yakrobot.com');
  });
});

describe('host message API', () => {
  const msg = (o: object) => ({ type: MESSAGE_TYPE, ...o });

  it('accepts the documented commands', () => {
    expect(parseCommand(msg({ cmd: 'claw', value: true }))).toEqual({ cmd: 'claw', value: true });
    expect(parseCommand(msg({ cmd: 'lights' }))).toEqual({ cmd: 'lights', value: undefined });
    expect(parseCommand(msg({ cmd: 'physics', value: 'simple' }))).toEqual({ cmd: 'physics', value: 'simple' });
    expect(parseCommand(msg({ cmd: 'reset', value: 'ignored' }))).toEqual({ cmd: 'reset' });
    expect(parseCommand(msg({ cmd: 'getState' }))).toEqual({ cmd: 'getState' });
  });

  it('ignores foreign or malformed messages', () => {
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand('reset')).toBeNull();
    expect(parseCommand({ cmd: 'reset' })).toBeNull(); // no type tag
    expect(parseCommand({ type: 'other', cmd: 'reset' })).toBeNull();
    expect(parseCommand(msg({ cmd: 'selfDestruct' }))).toBeNull();
    expect(parseCommand(msg({ cmd: 'lights', value: 'on' }))).toBeNull();
    expect(parseCommand(msg({ cmd: 'physics', value: 'bullet' }))).toBeNull();
  });

  it('omitted value toggles, explicit value sets', () => {
    expect(resolve(undefined, false)).toBe(true);
    expect(resolve(undefined, true)).toBe(false);
    expect(resolve(true, true)).toBe(true);
    expect(resolve(false, true)).toBe(false);
  });
});
