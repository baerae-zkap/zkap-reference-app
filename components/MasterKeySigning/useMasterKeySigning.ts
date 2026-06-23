import { useState, useRef, useCallback } from 'react';
import {
  signWithMasterKey,
  type MasterKeySigningParams,
  type MasterKeySigningResult,
  type MasterKeySigningStep,
  type SigningAccountStatus,
} from '@/services/wallet/masterKeySigningService';

export interface UseMasterKeySigningReturn {
  startSigning: (params: Omit<MasterKeySigningParams, 'onProgress' | 'abortSignal'>) => Promise<MasterKeySigningResult>;
  isSigning: boolean;
  accountStatuses: SigningAccountStatus[];
  currentPhase: MasterKeySigningStep | null;
  verifiedCount: number;
  cancel: () => void;
  retry: () => Promise<MasterKeySigningResult>;
}

export function useMasterKeySigning(): UseMasterKeySigningReturn {
  const [isSigning, setIsSigning] = useState(false);
  const [accountStatuses, setAccountStatuses] = useState<SigningAccountStatus[]>([]);
  const [currentPhase, setCurrentPhase] = useState<MasterKeySigningStep | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<Omit<MasterKeySigningParams, 'onProgress' | 'abortSignal'> | null>(null);

  const handleProgress = useCallback((step: MasterKeySigningStep) => {
    setCurrentPhase(step);

    switch (step.type) {
      case 'computing_nonce':
        // Initialize all accounts to pending
        if (lastParamsRef.current) {
          setAccountStatuses((lastParamsRef.current.accounts ?? []).map(() => 'pending'));
        }
        break;
      case 'account_signing':
        setAccountStatuses(prev => {
          const next = [...prev];
          next[step.accountIndex] = step.status;
          return next;
        });
        break;
      case 'completed':
        // No cleanup needed - caller reads result
        break;
    }
  }, []);

  const startSigning = useCallback(async (
    params: Omit<MasterKeySigningParams, 'onProgress' | 'abortSignal'>,
  ): Promise<MasterKeySigningResult> => {
    lastParamsRef.current = params;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSigning(true);
    setAccountStatuses((params.accounts ?? []).map(() => 'pending'));
    setCurrentPhase(null);

    try {
      const result = await signWithMasterKey({
        ...params,
        onProgress: handleProgress,
        abortSignal: controller.signal,
      });
      return result;
    } finally {
      setIsSigning(false);
      abortControllerRef.current = null;
    }
  }, [handleProgress]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const retry = useCallback(async (): Promise<MasterKeySigningResult> => {
    if (!lastParamsRef.current) {
      throw new Error('No previous signing params to retry');
    }
    return startSigning(lastParamsRef.current);
  }, [startSigning]);

  const verifiedCount = accountStatuses.filter(s => s === 'verified').length;

  return {
    startSigning,
    isSigning,
    accountStatuses,
    currentPhase,
    verifiedCount,
    cancel,
    retry,
  };
}
