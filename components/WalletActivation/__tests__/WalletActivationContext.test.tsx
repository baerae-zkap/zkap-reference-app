import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import {
  WalletActivationError,
  WalletActivationProvider,
  WalletActivationStep,
  useWalletActivation,
} from '../WalletActivationContext';
import { Wallet, WalletStatus } from '@/stores/walletStore';

describe('WalletActivationContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletActivationProvider>{children}</WalletActivationProvider>
  );

  describe('useWalletActivation hook', () => {
    it('throws error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useWalletActivation());
      }).toThrow('useWalletActivation must be used within a WalletActivationProvider');

      consoleSpy.mockRestore();
    });

    it('provides context value when used inside provider', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedChainId).toBe(null);
      expect(result.current.createdWallet).toBe(null);
      expect(result.current.error).toBe(null);
    });
  });

  describe('open and close', () => {
    it('opens at the default funding step', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);
    });

    it('opens at a specified step with a selected chain', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open(WalletActivationStep.CREATING, 84532);
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.currentStep).toBe(WalletActivationStep.CREATING);
      expect(result.current.selectedChainId).toBe(84532);
    });

    it('closes the activation flow', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('step navigation', () => {
    it('moves from FUNDING to CREATING', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open();
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.CREATING);
    });

    it('moves from CREATING to COMPLETE', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open(WalletActivationStep.CREATING);
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.COMPLETE);
    });

    it('does not go beyond COMPLETE', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open(WalletActivationStep.COMPLETE);
        result.current.nextStep();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.COMPLETE);
    });

    it('moves from CREATING back to FUNDING', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open(WalletActivationStep.CREATING);
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);
    });

    it('does not go before FUNDING', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open(WalletActivationStep.FUNDING);
        result.current.prevStep();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);
    });

    it('goes to a specific step', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });

      act(() => {
        result.current.open();
        result.current.goToStep(WalletActivationStep.CREATING);
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.CREATING);
    });

    it('clears errors when navigating', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });
      const mockError: WalletActivationError = {
        code: 'NETWORK_ERROR',
        message: 'Test error',
        recoverable: true,
        action: 'retry',
      };

      act(() => {
        result.current.open();
        result.current.setError(mockError);
      });
      expect(result.current.error).toEqual(mockError);

      act(() => {
        result.current.nextStep();
      });
      expect(result.current.error).toBe(null);
    });
  });

  describe('state setters', () => {
    it('sets created wallet', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });
      const mockWallet: Wallet = {
        address: '0x1234567890abcdef',
        chainId: 84532,
        status: WalletStatus.DERIVED,
        createdAt: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.setCreatedWallet(mockWallet);
      });

      expect(result.current.createdWallet).toEqual(mockWallet);
    });

    it('sets and clears error', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });
      const mockError: WalletActivationError = {
        code: 'NETWORK_ERROR',
        message: 'Network error',
        recoverable: false,
        action: 'back',
      };

      act(() => {
        result.current.setError(mockError);
      });
      expect(result.current.error).toEqual(mockError);

      act(() => {
        result.current.setError(null);
      });
      expect(result.current.error).toBe(null);
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });
      const mockWallet: Wallet = {
        address: '0x1234567890abcdef',
        chainId: 84532,
        status: WalletStatus.DERIVED,
        createdAt: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.open(WalletActivationStep.COMPLETE, 84532);
        result.current.setCreatedWallet(mockWallet);
        result.current.setError({
          code: 'NETWORK_ERROR',
          message: 'Network error',
          recoverable: true,
          action: 'retry',
        });
        result.current.reset();
      });

      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedChainId).toBe(null);
      expect(result.current.createdWallet).toBe(null);
      expect(result.current.error).toBe(null);
    });
  });

  describe('complete workflow', () => {
    it('supports FUNDING -> CREATING -> COMPLETE', () => {
      const { result } = renderHook(() => useWalletActivation(), { wrapper });
      const mockWallet: Wallet = {
        address: '0x1234567890abcdef',
        chainId: 84532,
        status: WalletStatus.DERIVED,
        createdAt: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.open(WalletActivationStep.FUNDING, 84532);
      });
      expect(result.current.currentStep).toBe(WalletActivationStep.FUNDING);

      act(() => {
        result.current.nextStep();
      });
      expect(result.current.currentStep).toBe(WalletActivationStep.CREATING);

      act(() => {
        result.current.setCreatedWallet(mockWallet);
        result.current.nextStep();
      });
      expect(result.current.createdWallet).toEqual(mockWallet);
      expect(result.current.currentStep).toBe(WalletActivationStep.COMPLETE);
    });
  });
});
