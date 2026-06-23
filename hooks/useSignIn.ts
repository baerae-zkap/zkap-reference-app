import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { ActionSheetState } from '@/components/ui/ActionSheet';
import i18next from 'i18next';
import { useAuthStore, SocialProvider, User } from '@/stores/authStore';
import { useWalletStore, WalletStatus } from '@/stores/walletStore';
import { getDefaultChain } from '@/libs/chains/supportedChains';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';
import {
  saveDefaultRecoveryAccount,
  getRecoveryAccounts,
  clearRecoveryAccounts,
  clearRecoveryAccountsForChain,
} from '@/libs/recovery/recoveryAccountStore';
import { checkWalletDeployed } from '@/services/wallet/walletCreationService';
import { getSalt, clearSalt, computeDeterministicSalt } from '@/libs/wallet/saltManager';
import { getWalletRecord, markWalletDeployed } from '@/libs/wallet/addressStore';
import * as SecureStore from 'expo-secure-store';
import { hasStoredPasskey, clearPasskey } from '@/libs/passkey/passkeyStore';
import { getCanonicalClientId, initProviderConfig } from '@/libs/wallet/providerConfigHelper';
import { googleSignIn, googleSignOut } from '@/services/auth/googleAuth';
import { useRecoveryOwnerStore } from '@/stores/recoveryOwnerStore';

interface SignInData {
  idToken: string;
  userName: string;
  email?: string;
}

interface SignInOptions {
  recoveryMode?: boolean;
}

function upsertDeployedWallet(address: string, chainId: number) {
  const store = useWalletStore.getState();
  const now = new Date().toISOString();
  const existingWallet = store.getWalletByChainId(chainId);

  if (existingWallet) {
    store.updateWallet(existingWallet.address, chainId, {
      address,
      status: WalletStatus.DEPLOYED,
      deployedAt: existingWallet.deployedAt ?? now,
    });
    return;
  }

  store.addWallet({
    address,
    chainId,
    status: WalletStatus.DEPLOYED,
    createdAt: now,
    deployedAt: now,
  });
}

function t(key: string) {
  const translated = i18next.t(key);
  return typeof translated === 'string' && translated.length > 0 ? translated : key;
}

export function useSignIn(opts: { showSheet: (sheet: ActionSheetState) => void }) {
  const router = useRouter();
  const { authenticate } = useAuthStore();
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);

  // Use the in-app ActionSheet instead of OS alerts to keep error presentation consistent.
  const notifyError = (title: string, message: string) =>
    opts.showSheet({ tone: 'danger', title, message, primaryText: t('common.confirm') });

  const handleSignIn = async (
    provider: SocialProvider,
    data: SignInData,
    options: SignInOptions = {}
  ) => {
    const isRecoveryMode = options.recoveryMode === true;
    setLoadingProvider(provider);
    try {
      // Check local state to determine whether the user has already completed onboarding.
      const chainId = Number(process.env.EXPO_PUBLIC_CHAIN_ID) || getDefaultChain().chainId;
      let localPasskey = await hasStoredPasskey();
      let existingWallet = useWalletStore.getState().getWalletByChainId(chainId);
      let existingAccounts = await getRecoveryAccounts();

      const user: User = {
        email: data.email,
        nickname: data.userName,
        provider,
        hasPasskey: localPasskey,
        hasRecovery: (existingAccounts?.length ?? 0) > 0,
      };

      // Decode the idToken (required by all branches below).
      let decoded: ReturnType<typeof decodeIdToken>;
      try {
        decoded = decodeIdToken(data.idToken);
      } catch (decodeError) {
        console.error('Failed to decode idToken:', decodeError);
        return;
      }

      // Account mismatch detection + local data wipe.
      // If there is a default recovery account from a previous session whose (iss, sub)
      // differs from the current login, clear all local state (recovery accounts, wallet,
      // passkey, salt, nickname) and enter the new-user onboarding flow.
      const existingDefault = existingAccounts?.find((a) => a.isDefault) ?? existingAccounts?.[0];
      const isAccountMismatch =
        !!existingDefault &&
        (existingDefault.sub !== decoded.sub || existingDefault.iss !== decoded.iss);

      if (isAccountMismatch) {
        console.log('[Sign-in] Account mismatch — clearing local data for previous account');
        try {
          await clearRecoveryAccounts();
          await clearRecoveryAccountsForChain(chainId);
          useWalletStore.getState().clearWallets();
          await clearPasskey();
          await clearSalt();
          // NOTE: wallet records in addressStore are keyed per-owner, so they are not cleared here.
          // Deleting another account's deployed-wallet record would break recovery for the original
          // account when it returns (it would find no record and create a new wallet instead).
          // Owner-scoped keys already prevent cross-account access, so preserving the records is safe.
          await SecureStore.deleteItemAsync('wallet_creation_salt').catch(() => {});
          await SecureStore.deleteItemAsync('last_user_nickname').catch(() => {});
        } catch (wipeError) {
          console.warn('[Sign-in] Failed to clear local data:', wipeError);
        }
        // Reset variables so subsequent branches treat this as a new-user signup.
        existingAccounts = null;
        existingWallet = undefined;
        localPasskey = false;
        user.hasPasskey = false;
        user.hasRecovery = false;
      }

      // Save the default recovery account for all new users.
      // initProviderConfig must complete before the first getCanonicalClientId/getHAud call
      // so that the canonical aud used for address derivation is consistent across the session.
      await initProviderConfig();
      const canonicalAud = getCanonicalClientId(provider);
      if (!isRecoveryMode && (!existingAccounts || !existingWallet)) {
        await saveDefaultRecoveryAccount({
          provider,
          iss: decoded.iss,
          sub: decoded.sub,
          aud: canonicalAud,
          identifier: data.email || data.userName || decoded.identifier,
        });
        user.hasRecovery = true;
      } else if (isRecoveryMode) {
        user.hasRecovery = (existingAccounts?.length ?? 0) > 0;
      }

      // Persist the nickname to SecureStore for reuse during recovery.
      if (data.userName) {
        SecureStore.setItemAsync('last_user_nickname', data.userName).catch(() => {});
      }

      // Detect returning users via owner-keyed deployed wallet records in SecureStore.
      // The wallet address depends on the passkey and cannot be re-derived from social identity
      // alone, so the SecureStore record is the source of truth. Looking up by the current
      // account's owner key (iss/sub) ensures the record belongs to this account (no cross-account
      // access). If deployed, navigate home without an RPC check (fail-open) so the same account
      // re-logging in does not land in the new-passkey/new-address onboarding flow.
      const owner = { iss: decoded.iss, sub: decoded.sub };
      if (isRecoveryMode || !existingWallet) {
        try {
          const record = await getWalletRecord(chainId, owner);

          if (record) {
            // Trust the deployed flag (fail-open). If unconfirmed, verify once via RPC and promote.
            let isDeployed = record.deployed;
            if (!isDeployed) {
              try {
                isDeployed = await checkWalletDeployed(record.address, chainId);
                if (isDeployed) await markWalletDeployed(chainId, owner);
              } catch (checkError) {
                if (isRecoveryMode) {
                  console.error('Wallet deployment check failed:', checkError);
                  notifyError(
                    t('common.error'),
                    t('recovery.initiate.walletLookupFailedMessage')
                  );
                  return;
                }
                // Normal sign-in: if the record had deployed=true it would have passed above.
                // Reaching here means the deployment status was unconfirmed.
              }
            }

            if (isDeployed) {
              upsertDeployedWallet(record.address, chainId);
              // Recovery always routes to passkey reset. For scenario ⑤ (new device, no stored
              // recovery accounts), the reset screen's picker handles account re-entry.
              authenticate(isRecoveryMode ? { ...user, authFlow: 'walletRecovery' } : user);
              if (isRecoveryMode) {
                // Pass the owner account (master key slot 0) to the reset screen picker as a pre-fill.
                useRecoveryOwnerStore.getState().setOwner({
                  provider,
                  iss: decoded.iss,
                  sub: decoded.sub,
                  aud: canonicalAud,
                  identifier: data.email || data.userName || decoded.identifier,
                  isDefault: true,
                });
                router.replace('/sign-up/passkey/reset');
              }
              if (__DEV__) console.log('Existing wallet detected, skipping onboarding:', record.address);
              return;
            }
          }

          if (isRecoveryMode) {
            // Recovery mode with no record (or undeployed): outside the scope of same-device recovery.
            notifyError(
              t('recovery.initiate.walletNotFound'),
              t('recovery.initiate.deployedWalletNotFoundMessage')
            );
            return;
          }

          // New user — store the deterministic salt (same computation as deployWallet).
          const existingSalt = await getSalt();
          if (!existingSalt) {
            const salt = computeDeterministicSalt(canonicalAud, decoded.sub);
            await SecureStore.setItemAsync('wallet_creation_salt', salt);
          }
          // The address is derived and stored in deriveWalletAddress (create screen); not set here.
          if (__DEV__) console.log('[Sign-in] New user — proceeding to onboarding');
        } catch (lookupError) {
          console.error('Wallet record lookup failed:', lookupError);
          if (isRecoveryMode) {
            notifyError(
              t('common.error'),
              t('recovery.initiate.walletLookupFailedMessage')
            );
            return;
          }
        }
      }

      if (isRecoveryMode) {
        notifyError(
          t('recovery.initiate.walletNotFound'),
          t('recovery.initiate.deployedWalletNotFoundMessage')
        );
        return;
      }

      // New user (no local passkey or wallet): route to wallet creation onboarding.
      // The create screen handles passkey creation and counterfactual address derivation
      // via calcAddr (aud/iss + passkey). AuthProvider routes via user.authFlow.
      if (!localPasskey && !existingWallet) {
        user.authFlow = 'walletCreation';
      }

      authenticate(user);

      if (data.email || data.userName) {
        useAuthStore.getState().updateUser({
          email: data.email,
          nickname: data.userName,
        });
      }
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleRecoverWallet = async () => {
    setLoadingProvider('google');
    try {
      const data = await googleSignIn({ forceAccountSelection: true });
      await handleSignIn('google', data, { recoveryMode: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      googleSignOut().catch(() => {});
      if (!msg.includes('cancelled') && !msg.includes('canceled')) {
        console.error('Google wallet recovery sign in error:', error);
        notifyError(
          t('recovery.initiate.walletLookupFailedTitle'),
          t('recovery.initiate.walletLookupFailedMessage')
        );
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return {
    handleSignIn,
    handleRecoverWallet,
    loadingProvider,
  };
}
