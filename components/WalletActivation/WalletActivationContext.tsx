import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Wallet } from '@/stores/walletStore';

export type WalletActivationErrorCode =
  | 'NETWORK_ERROR'
  | 'SDK_ERROR'
  | 'BUNDLER_ERROR'
  | 'UNKNOWN_ERROR'
  // Wallet creation specific errors
  | 'CHAIN_CONFIG_FAILED'
  | 'ANCHOR_COMPUTATION_FAILED'
  | 'DERIVATION_FAILED'
  | 'DEPLOYMENT_FAILED'
  | 'VERIFICATION_FAILED'
  | 'PASSKEY_ERROR'
  | 'NO_RECOVERY_ACCOUNTS';

export interface WalletActivationError {
  code: WalletActivationErrorCode;
  message: string;
  recoverable: boolean;
  action: 'retry' | 'back' | 'reset';
}

export enum WalletActivationStep {
  FUNDING = 0,
  CREATING = 1,
  COMPLETE = 2,
}

const STEP_ORDER: readonly WalletActivationStep[] = [
  WalletActivationStep.FUNDING,
  WalletActivationStep.CREATING,
  WalletActivationStep.COMPLETE,
];

interface WalletActivationState {
  currentStep: WalletActivationStep;
  isOpen: boolean;
  selectedChainId: number | null;
  createdWallet: Wallet | null;
  error: WalletActivationError | null;
}

interface WalletActivationActions {
  open: (resumeAtStep?: WalletActivationStep, chainId?: number) => void;
  close: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: WalletActivationStep) => void;
  setCreatedWallet: (wallet: Wallet) => void;
  setError: (error: WalletActivationError | null) => void;
  reset: () => void;
}

type WalletActivationContextValue = WalletActivationState & WalletActivationActions;

const initialState: WalletActivationState = {
  currentStep: WalletActivationStep.FUNDING,
  isOpen: false,
  selectedChainId: null,
  createdWallet: null,
  error: null,
};

const WalletActivationContext = createContext<WalletActivationContextValue | null>(null);

export function useWalletActivation(): WalletActivationContextValue {
  const context = useContext(WalletActivationContext);
  if (!context) {
    throw new Error('useWalletActivation must be used within a WalletActivationProvider');
  }
  return context;
}

interface WalletActivationProviderProps {
  children: ReactNode;
}

export function WalletActivationProvider({ children }: WalletActivationProviderProps) {
  const [state, setState] = useState<WalletActivationState>(initialState);

  const open = useCallback((resumeAtStep?: WalletActivationStep, chainId?: number) => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      currentStep: resumeAtStep ?? WalletActivationStep.FUNDING,
      selectedChainId: chainId != null ? chainId : null,
    }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => {
      const idx = STEP_ORDER.indexOf(prev.currentStep);
      const nextIdx = Math.min(idx + 1, STEP_ORDER.length - 1);
      return {
        ...prev,
        currentStep: idx === -1 ? prev.currentStep : STEP_ORDER[nextIdx],
        error: null,
      };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => {
      const idx = STEP_ORDER.indexOf(prev.currentStep);
      const prevIdx = Math.max(idx - 1, 0);
      return {
        ...prev,
        currentStep: idx === -1 ? prev.currentStep : STEP_ORDER[prevIdx],
        error: null,
      };
    });
  }, []);

  const goToStep = useCallback((step: WalletActivationStep) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
      error: null,
    }));
  }, []);

  const setCreatedWallet = useCallback((wallet: Wallet) => {
    setState((prev) => ({
      ...prev,
      createdWallet: wallet,
    }));
  }, []);

  const setError = useCallback((error: WalletActivationError | null) => {
    setState((prev) => ({
      ...prev,
      error,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const value: WalletActivationContextValue = {
    ...state,
    open,
    close,
    nextStep,
    prevStep,
    goToStep,
    setCreatedWallet,
    setError,
    reset,
  };

  return (
    <WalletActivationContext.Provider value={value}>
      {children}
    </WalletActivationContext.Provider>
  );
}
