import { describe, expect, it } from 'vitest';
import {
  buildRoles,
  checkVictoryAfterElimination,
  getMaxImpostors,
  isMrWhiteGuessCorrect,
  shouldContinueAfterImpostorEliminated,
} from './gameLogic';
import type { Role } from './types';

describe('getMaxImpostors', () => {
  it('respecte imposteurs ≤ civils sans Mr. White', () => {
    expect(getMaxImpostors({ playerCount: 4, impostorCount: 1, mrWhiteEnabled: false })).toBe(2);
    expect(getMaxImpostors({ playerCount: 5, impostorCount: 1, mrWhiteEnabled: false })).toBe(2);
    expect(getMaxImpostors({ playerCount: 6, impostorCount: 1, mrWhiteEnabled: false })).toBe(3);
  });

  it('réduit le plafond quand Mr. White est activé', () => {
    expect(getMaxImpostors({ playerCount: 4, impostorCount: 1, mrWhiteEnabled: true })).toBe(1);
    expect(getMaxImpostors({ playerCount: 6, impostorCount: 1, mrWhiteEnabled: true })).toBe(2);
  });
});

describe('buildRoles', () => {
  it('assigne le bon nombre de chaque rôle', () => {
    const roles = buildRoles({
      playerCount: 6,
      impostorCount: 2,
      mrWhiteEnabled: true,
    });
    expect(roles).toHaveLength(6);
    expect(roles.filter((r) => r === 'imposteur')).toHaveLength(2);
    expect(roles.filter((r) => r === 'mrWhite')).toHaveLength(1);
    expect(roles.filter((r) => r === 'citoyen')).toHaveLength(3);
  });
});

describe('checkVictoryAfterElimination', () => {
  const mk = (role: Role, eliminated = false) => ({ role, eliminated });

  it('retourne null si plus de 2 joueurs vivants', () => {
    expect(
      checkVictoryAfterElimination([mk('citoyen'), mk('citoyen'), mk('imposteur')])
    ).toBeNull();
  });

  it('Mr. White gagne à 2 restants', () => {
    expect(
      checkVictoryAfterElimination([mk('mrWhite'), mk('citoyen')])
    ).toBe('mrWhite');
  });

  it('imposteur gagne avec 1 civil et 1 imposteur', () => {
    expect(
      checkVictoryAfterElimination([mk('citoyen'), mk('imposteur')])
    ).toBe('imposteur');
  });
});

describe('shouldContinueAfterImpostorEliminated', () => {
  it('continue si Mr. White est vivant', () => {
    expect(
      shouldContinueAfterImpostorEliminated(
        [
          { role: 'mrWhite', eliminated: false },
          { role: 'imposteur', eliminated: true },
          { role: 'citoyen', eliminated: false },
        ],
        true
      )
    ).toBe(true);
  });

  it('termine si Mr. White est éliminé ou absent', () => {
    expect(
      shouldContinueAfterImpostorEliminated(
        [{ role: 'mrWhite', eliminated: true }, { role: 'citoyen', eliminated: false }],
        true
      )
    ).toBe(false);
    expect(
      shouldContinueAfterImpostorEliminated(
        [{ role: 'citoyen', eliminated: false }],
        false
      )
    ).toBe(false);
  });
});

describe('isMrWhiteGuessCorrect', () => {
  it('ignore casse et espaces', () => {
    expect(isMrWhiteGuessCorrect('  Pizza ', 'pizza')).toBe(true);
    expect(isMrWhiteGuessCorrect('burger', 'Pizza')).toBe(false);
  });
});
