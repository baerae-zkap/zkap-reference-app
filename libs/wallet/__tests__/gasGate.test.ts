import { GAS_BUFFER_ETH, isInsufficientForGas } from '../gasGate';

describe('gasGate', () => {
  describe('GAS_BUFFER_ETH', () => {
    it('is the 0.0001 ETH buffer', () => {
      expect(GAS_BUFFER_ETH).toBe(0.0001);
    });
  });

  describe('isInsufficientForGas', () => {
    it('returns false for null (loading/error sentinel — do not gate)', () => {
      expect(isInsufficientForGas(null)).toBe(false);
    });

    it('returns true for a balance below the buffer', () => {
      expect(isInsufficientForGas('0.0')).toBe(true);
      expect(isInsufficientForGas('0.00005')).toBe(true);
    });

    it('returns false for a balance at or above the buffer', () => {
      expect(isInsufficientForGas('0.0001')).toBe(false);
      expect(isInsufficientForGas('0.001')).toBe(false);
      expect(isInsufficientForGas('1.0')).toBe(false);
    });

    it('handles the exact threshold boundary (>= passes)', () => {
      expect(isInsufficientForGas('0.0001')).toBe(false);
      expect(isInsufficientForGas('0.00009999999999999')).toBe(true);
    });

    it('fails closed on a non-numeric / malformed balance string', () => {
      expect(isInsufficientForGas('')).toBe(true);
      expect(isInsufficientForGas('abc')).toBe(true);
      expect(isInsufficientForGas('0x1')).toBe(true);
      expect(isInsufficientForGas('1.2.3')).toBe(true);
      expect(isInsufficientForGas('NaN')).toBe(true);
    });

    it('respects a custom threshold', () => {
      expect(isInsufficientForGas('0.5', 1.0)).toBe(true);
      expect(isInsufficientForGas('1.5', 1.0)).toBe(false);
    });
  });
});
