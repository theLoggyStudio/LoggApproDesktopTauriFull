import { describe, it, expect } from 'vitest';
import { checkPrivilege } from './helpers.tsx';

describe('checkPrivilege', () => {
  it('retourne true si acc01/apy01 (portail) et le privilège sont présents', () => {
    expect(checkPrivilege('nma02', 'acc01,nma02,nma01,asr01')).toBe(true);
    expect(checkPrivilege('asr02', 'apy01,nma02,asr02,nma01')).toBe(true);
    expect(checkPrivilege('crd04', 'apy01,crd04,vna01,vns01')).toBe(true);
  });

  it('retourne false si acc01/apy01 (portail) est absent', () => {
    expect(checkPrivilege('nma02', 'nma02,nma01,asr01')).toBe(false);
    expect(checkPrivilege('crd04', 'crd04,vna01,vns01')).toBe(false);
  });

  it('retourne false si le privilège est absent', () => {
    expect(checkPrivilege('nma02', 'acc01,nma01,asr01')).toBe(false);
    expect(checkPrivilege('crd04', 'apy01,vna01,vns01')).toBe(false);
  });

  it('accepte les anciens et nouveaux codes (rétrocompatibilité)', () => {
    expect(checkPrivilege('col02', 'acc01,crd06')).toBe(true);
    expect(checkPrivilege('pat01', 'acc01,vpr01')).toBe(true);
    expect(checkPrivilege('pay02', 'acc01,apy01')).toBe(true);
  });

  it('gère les chaînes vides ou invalides', () => {
    expect(checkPrivilege('nma02', '')).toBe(false);
    expect(checkPrivilege('', 'acc01,nma02')).toBe(false);
  });
});
