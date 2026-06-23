import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderIcon, getProviderName } from '@/components/SocialAccountList/SocialAccountList';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import type { MasterKeySigningStep, SigningAccountStatus } from '@/services/wallet/masterKeySigningService';

export interface MasterKeySigningOverlayProps {
  visible: boolean;
  accounts: RecoveryAccount[];
  accountStatuses: SigningAccountStatus[];
  currentPhase: MasterKeySigningStep | null;
  verifiedCount: number;
  onConfirmLogin?: () => void;
  onCancel: () => void;
  /**
   * Recovery account "pick" mode for scenario ⑤ (new-device recovery). When
   * `active`, the Auth phase renders an account-selection picker instead of the
   * normal sequential sign-in list (flows ③/④ leave this unset).
   *
   * Each entry in `accounts` is either verified (proof token obtained) or
   * pending (the owner account pre-filled from the recovery entry point, not
   * yet authenticated). If a pending slot exists, tapping it triggers
   * `onVerifyPending`; otherwise "Add recovery account" (`onAddAccount`) and
   * "Done" (`onDone`) are shown. All slots can be removed via `onRemove`.
   */
  pick?: {
    active: boolean;
    /** An OAuth flow is in progress — all controls disabled to prevent concurrent OAuth. */
    busy: boolean;
    /** Where to show the spinner: 'add' = add button, 'verify' = pending row. */
    busyKind?: 'add' | 'verify' | null;
    max?: number;
    accounts: { account: RecoveryAccount; verified: boolean }[];
    onAddAccount: () => void;
    onVerifyPending: () => void;
    onRemove: (index: number) => void;
    onDone: () => void;
  };
}

type FlowPhase = 'auth' | 'proof' | 'done';

function getDownloadPercent(progress: { downloaded: number; total: number; percent?: number }): number {
  if (typeof progress.percent === 'number') {
    return Math.max(0, Math.min(100, Math.round(progress.percent)));
  }
  if (progress.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress.downloaded / progress.total) * 100)));
}

/**
 * Map the granular signing step to one of the three user-facing phases.
 *
 * The 700MB proving-key download runs IN PARALLEL with account auth, so a
 * `downloading_keys` progress tick can arrive interleaved with `account_signing`
 * events. We keep the phase monotonic w.r.t. auth: while not every account is
 * verified we stay in 'auth' (the download bar is shown inside the Auth phase),
 * and only advance to 'proof' once auth is done. This prevents the Auth account
 * card from flickering away mid-login.
 */
function resolvePhase(
  step: MasterKeySigningStep | null,
  verifiedCount: number,
  total: number,
): FlowPhase {
  if (step?.type === 'completed') return 'done';

  const authComplete = total > 0 && verifiedCount >= total;

  switch (step?.type) {
    case 'collecting_merkle_data':
    case 'generating_proof':
    case 'encoding_signature':
      // Post-auth proof steps — but never overtake auth if it isn't finished.
      return authComplete ? 'proof' : 'auth';
    case 'downloading_keys':
      // Key download is concurrent with auth. Only treat it as the Proof phase
      // once auth is complete; otherwise show its progress within Auth.
      return authComplete ? 'proof' : 'auth';
    // null, computing_nonce, account_signing → still authenticating
    default:
      return 'auth';
  }
}

/** Ordered on-device proof sub-steps for the Proof phase progress list. */
const PROOF_STEPS: { key: MasterKeySigningStep['type']; label: string }[] = [
  { key: 'collecting_merkle_data', label: 'masterKeySigning.proofStepCollecting' },
  { key: 'generating_proof', label: 'masterKeySigning.proofStepGenerating' },
  { key: 'encoding_signature', label: 'masterKeySigning.proofStepSigning' },
];

/**
 * MasterKey signing overlay — shared by the recovery-update (④) and
 * passkey-reset (⑤) flows.
 *
 * Renders one of three clear phases driven by `currentPhase`:
 *  - Auth: step pills + the current account card + login/confirm button.
 *    OS-picker timing: waiting_user → verified within 500ms is treated as
 *    auto-select, so guidance/confirm only appears after a 500ms grace period.
 *  - Proof: the on-device delta — 700MB first-time download bar, a "generating
 *    on device" notice, and the collect→prove→sign step list. Presentation only.
 *  - Done: a ✓ confirmation with a close button.
 *
 * Props signature is unchanged so the flow screens need no edits.
 */
export function MasterKeySigningOverlay({
  visible,
  accounts,
  accountStatuses,
  currentPhase,
  verifiedCount,
  onConfirmLogin,
  onCancel,
  pick,
}: MasterKeySigningOverlayProps) {
  const { t } = useTranslation();
  // Track which accounts have passed the 500ms auto-select grace period
  const [showGuidance, setShowGuidance] = useState<Record<number, boolean>>({});
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (currentPhase?.type === 'account_signing' && currentPhase.status === 'waiting_user') {
      const idx = currentPhase.accountIndex;
      // Start hidden; after 500ms flip to show guidance (not auto-selected)
      setShowGuidance(prev => ({ ...prev, [idx]: false }));
      timersRef.current[idx] = setTimeout(() => {
        setShowGuidance(prev => ({ ...prev, [idx]: true }));
      }, 500);
    }
    // If account transitions away from waiting_user, clear its timer
    if (currentPhase?.type === 'account_signing' && currentPhase.status !== 'waiting_user') {
      const idx = currentPhase.accountIndex;
      if (timersRef.current[idx]) {
        clearTimeout(timersRef.current[idx]);
        delete timersRef.current[idx];
      }
    }
  }, [currentPhase]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  if (!visible) return null;

  const total = accounts.length;
  // In pick mode (scenario ⑤) stay in Auth until the user explicitly finishes selection.
  const phase = pick?.active ? 'auth' : resolvePhase(currentPhase, verifiedCount, total);

  const getStatusIcon = (status: SigningAccountStatus) => {
    switch (status) {
      case 'verified':
        return '✓';
      case 'waiting_user':
      case 'signing':
        return '›';
      case 'error':
        return '✕';
      default:
        return '○';
    }
  };

  const getStatusColor = (status: SigningAccountStatus) => {
    switch (status) {
      case 'verified':
        return '#10B981';
      case 'waiting_user':
      case 'signing':
        return '#3B82F6';
      case 'error':
        return '#EF4444';
      default:
        return '#94A3B8';
    }
  };

  const getStatusText = (status: SigningAccountStatus, index: number): string => {
    switch (status) {
      case 'verified':
        return t('masterKeySigning.statusVerified');
      case 'waiting_user':
        // Auto-select detection: show "verifying" until 500ms grace period passes
        return showGuidance[index]
          ? t('masterKeySigning.statusWaitingUser')
          : t('masterKeySigning.statusAutoVerifying');
      case 'signing':
        return t('masterKeySigning.statusSigning');
      case 'error':
        return t('masterKeySigning.statusError');
      default:
        return t('masterKeySigning.statusPending');
    }
  };

  const downloadPercent =
    currentPhase?.type === 'downloading_keys' && currentPhase.progress
      ? getDownloadPercent(currentPhase.progress)
      : 0;

  // Index of the account currently awaiting login (for the "next: …" footer)
  const activeIndex =
    currentPhase?.type === 'account_signing' ? currentPhase.accountIndex : -1;
  const nextAccount = activeIndex >= 0 ? accounts[activeIndex + 1] : undefined;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* ── Phase header (pills) ───────────────────────────────── */}
        <View style={styles.phasePills}>
          {(['auth', 'proof', 'done'] as FlowPhase[]).map((p, i) => {
            const order: FlowPhase[] = ['auth', 'proof', 'done'];
            const currentIdx = order.indexOf(phase);
            const cls = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
            const label =
              p === 'auth'
                ? t('masterKeySigning.phaseAuth')
                : p === 'proof'
                ? t('masterKeySigning.phaseProof')
                : t('masterKeySigning.phaseDone');
            return (
              <View key={p} style={styles.pillItem}>
                <View
                  style={[
                    styles.pillDot,
                    cls === 'current' && styles.pillDotCurrent,
                    cls === 'done' && styles.pillDotDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillNum,
                      (cls === 'current' || cls === 'done') && styles.pillNumActive,
                    ]}
                  >
                    {cls === 'done' ? '✓' : i + 1}
                  </Text>
                </View>
                <Text style={[styles.pillLabel, cls === 'current' && styles.pillLabelCurrent]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── AUTH PHASE ─────────────────────────────────────────── */}
        {phase === 'auth' && (
          <>
            <Text style={styles.title}>{t('masterKeySigning.title')}</Text>
            <Text style={styles.subtitle}>
              {pick?.active
                ? t('masterKeySigning.pickSubtitle')
                : t('masterKeySigning.subtitle')}
            </Text>

            {/* First-run 700MB key download — runs concurrently with auth, so we
                surface its progress here without leaving the Auth phase. */}
            {currentPhase?.type === 'downloading_keys' && currentPhase.progress && (
              <View style={styles.preSigning}>
                <Text style={styles.downloadTitle}>{t('proofMode.downloadingKeys')}</Text>
                <View style={styles.downloadProgressBar}>
                  <View style={[styles.downloadProgressFill, { width: `${downloadPercent}%` }]} />
                </View>
                <View style={styles.downloadInfoRow}>
                  <Text style={styles.downloadPercent}>{downloadPercent}%</Text>
                  <Text style={styles.downloadBytes}>
                    {t('proofMode.downloadProgress', {
                      downloaded: Math.round(currentPhase.progress.downloaded / (1024 * 1024)),
                      total: Math.round(currentPhase.progress.total / (1024 * 1024)),
                    })}
                  </Text>
                </View>
                <Text style={styles.downloadNotice}>
                  {t('proofMode.downloadFirstTimeNotice')}
                </Text>
              </View>
            )}

            {!pick?.active && (
              <>
                <View style={styles.accountList}>
                  {accounts.map((account, index) => {
                    const status = accountStatuses[index] || 'pending';
                    const isActive = status === 'waiting_user' || status === 'signing';

                    return (
                      <View
                        key={`${account.provider}-${account.sub}`}
                        style={[styles.accountRow, isActive && styles.accountRowActive]}
                      >
                        <View style={[styles.statusIcon, { backgroundColor: getStatusColor(status) + '20' }]}>
                          <Text style={[styles.statusIconText, { color: getStatusColor(status) }]}>
                            {getStatusIcon(status)}
                          </Text>
                        </View>

                        <View style={styles.accountContent}>
                          <View style={styles.accountHeader}>
                            <View style={styles.providerRow}>
                              <ProviderIcon provider={account.provider} />
                              <Text style={styles.accountIndex}>{index + 1}.</Text>
                              <Text style={styles.providerName}>
                                {getProviderName(account.provider)}
                              </Text>
                            </View>
                            {/* Saved-account hint */}
                            <Text style={styles.savedAccountLabel}>
                              {t('masterKeySigning.savedAccount')}
                            </Text>
                            <Text style={styles.accountId} numberOfLines={1}>
                              {account.identifier}
                            </Text>
                          </View>

                          <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                            {getStatusText(status, index)}
                          </Text>

                          {/* Guidance + big provider login button for the active (waiting) account */}
                          {isActive && status === 'waiting_user' && showGuidance[index] && (
                            <View style={styles.guidanceSection}>
                              <Text style={styles.guidanceText}>
                                {t('masterKeySigning.accountGuidance')}
                              </Text>
                              {onConfirmLogin && (
                                <Pressable style={styles.confirmButton} onPress={onConfirmLogin}>
                                  <ProviderIcon provider={account.provider} />
                                  <Text style={styles.confirmButtonText}>
                                    {t('masterKeySigning.loginWith', {
                                      provider: getProviderName(account.provider),
                                    })}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          )}
                        </View>

                        {status === 'signing' && <ActivityIndicator size="small" color="#3B82F6" />}
                      </View>
                    );
                  })}
                </View>

                {/* "n/N · Next: …" footer while an account is active */}
                {activeIndex >= 0 && (
                  <Text style={styles.authFooter}>
                    {t('masterKeySigning.authStepTitle', { current: activeIndex + 1, total })}
                    {' · '}
                    {nextAccount
                      ? t('masterKeySigning.authNextLabel', {
                          next: getProviderName(nextAccount.provider),
                        })
                      : t('masterKeySigning.authLastLabel')}
                  </Text>
                )}

                {/* Pre-signing spinner (nonce computation) */}
                {currentPhase?.type === 'computing_nonce' && (
                  <View style={styles.phaseIndicator}>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={styles.phaseText}>{t('masterKeySigning.computingNonce')}</Text>
                  </View>
                )}
              </>
            )}

            {/* pick mode (scenario ⑤): shows verified/pending slots with per-row remove (✕).
                If a pending (pre-filled owner) slot exists, tap to verify it;
                otherwise show "Add recovery account" + "Done". */}
            {pick?.active && (
              <>
                <View style={styles.accountList}>
                  {pick.accounts.map((row, index) => {
                    const tone: SigningAccountStatus = row.verified ? 'verified' : 'waiting_user';
                    // Pending (unverified owner) rows are tappable as a whole — no separate button.
                    // Verified rows are static.
                    const RowContainer: any = row.verified ? View : Pressable;
                    const rowProps = row.verified
                      ? {}
                      : { testID: 'recovery-pick-verify', onPress: pick.onVerifyPending, disabled: pick.busy };
                    return (
                      <RowContainer
                        key={`${row.account.provider}-${row.account.sub}-${index}`}
                        style={[styles.accountRow, !row.verified && styles.accountRowActive]}
                        {...rowProps}
                      >
                        <View style={[styles.statusIcon, { backgroundColor: getStatusColor(tone) + '20' }]}>
                          <Text style={[styles.statusIconText, { color: getStatusColor(tone) }]}>
                            {row.verified ? '✓' : '·'}
                          </Text>
                        </View>

                        <View style={styles.accountContent}>
                          <View style={styles.accountHeader}>
                            <View style={styles.providerRow}>
                              <ProviderIcon provider={row.account.provider} />
                              <Text style={styles.accountIndex}>{index + 1}.</Text>
                              <Text style={styles.providerName}>
                                {getProviderName(row.account.provider)}
                              </Text>
                            </View>
                            {!row.verified && (
                              <Text style={styles.savedAccountLabel}>
                                {t('masterKeySigning.pickOwnerHint')}
                              </Text>
                            )}
                            <Text style={styles.accountId} numberOfLines={1}>
                              {row.account.identifier}
                            </Text>
                          </View>

                          {row.verified ? (
                            <Text style={[styles.statusText, { color: getStatusColor(tone) }]}>
                              {t('masterKeySigning.statusVerified')}
                            </Text>
                          ) : pick.busyKind === 'verify' ? (
                            <View style={styles.pickPendingRow}>
                              <ActivityIndicator size="small" color="#3B82F6" />
                              <Text style={[styles.statusText, { color: getStatusColor(tone) }]}>
                                {t('masterKeySigning.statusPendingAuth')}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.pickVerifyAction}>
                              {t('masterKeySigning.verifyOwner')} ›
                            </Text>
                          )}
                        </View>

                        {!pick.busy && (
                          <Pressable
                            testID={`recovery-pick-remove-${index}`}
                            onPress={() => pick.onRemove(index)}
                            hitSlop={8}
                          >
                            <Text style={styles.pickRemoveText}>✕</Text>
                          </Pressable>
                        )}
                      </RowContainer>
                    );
                  })}
                </View>

                <Pressable
                  testID="recovery-pick-add"
                  style={[
                    styles.pickAddButton,
                    (pick.busy || pick.accounts.length >= (pick.max ?? 3)) && styles.pickButtonDisabled,
                  ]}
                  onPress={pick.onAddAccount}
                  disabled={pick.busy || pick.accounts.length >= (pick.max ?? 3)}
                >
                  {pick.busyKind === 'add' ? (
                    <ActivityIndicator size="small" color="#1E40AF" />
                  ) : (
                    <Text style={styles.pickAddButtonText}>{t('masterKeySigning.addAccount')}</Text>
                  )}
                </Pressable>

                <Pressable
                  testID="recovery-pick-done"
                  style={[
                    styles.pickDoneButton,
                    (pick.busy || pick.accounts.length === 0 || pick.accounts.some((a) => !a.verified)) &&
                      styles.pickButtonDisabled,
                  ]}
                  onPress={pick.onDone}
                  disabled={pick.busy || pick.accounts.length === 0 || pick.accounts.some((a) => !a.verified)}
                >
                  <Text style={styles.pickDoneButtonText}>{t('masterKeySigning.pickDone')}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── PROOF PHASE ────────────────────────────────────────── */}
        {phase === 'proof' && (
          <>
            <Text style={styles.title}>{t('masterKeySigning.proofTitle')}</Text>

            {/* First-time 700MB download bar */}
            {currentPhase?.type === 'downloading_keys' && currentPhase.progress && (
              <View style={styles.preSigning}>
                <Text style={styles.downloadTitle}>{t('proofMode.downloadingKeys')}</Text>
                <View style={styles.downloadProgressBar}>
                  <View style={[styles.downloadProgressFill, { width: `${downloadPercent}%` }]} />
                </View>
                <View style={styles.downloadInfoRow}>
                  <Text style={styles.downloadPercent}>{downloadPercent}%</Text>
                  <Text style={styles.downloadBytes}>
                    {t('proofMode.downloadProgress', {
                      downloaded: Math.round(currentPhase.progress.downloaded / (1024 * 1024)),
                      total: Math.round(currentPhase.progress.total / (1024 * 1024)),
                    })}
                  </Text>
                </View>
                <Text style={styles.downloadNotice}>
                  {t('proofMode.downloadFirstTimeNotice')}
                </Text>
              </View>
            )}

            {/* Download spinner before progress data arrives */}
            {currentPhase?.type === 'downloading_keys' && !currentPhase.progress && (
              <View style={styles.phaseIndicator}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.phaseText}>{t('proofMode.downloadingKeys')}</Text>
              </View>
            )}

            <Text style={styles.proofSecure}>{t('masterKeySigning.proofSecure')}</Text>

            {/* Ordered on-device proof step list. Steps before the current one show
                ✓ (done) so progression stays legible even if a phase only renders
                briefly — the user sees collect ✓ → prove ⟳ → sign rather than a single
                phase appearing stuck then flashing past. */}
            <View style={styles.proofSteps}>
              {(() => {
                const stepLabelMap: Record<string, string> = {
                  collecting_merkle_data: t('masterKeySigning.collectingMerkleData'),
                  generating_proof: t('masterKeySigning.generatingProof'),
                  encoding_signature: t('masterKeySigning.encodingSignature'),
                };
                const curIdx = PROOF_STEPS.findIndex((s) => s.key === currentPhase?.type);
                return PROOF_STEPS.map((s, i) => {
                  const active = i === curIdx;
                  const done = curIdx >= 0 && i < curIdx;
                  return (
                    <View key={s.key} style={styles.proofStepRow}>
                      {active ? (
                        <ActivityIndicator size="small" color="#3B82F6" />
                      ) : (
                        <Text style={[styles.proofStepDot, done && styles.proofStepDotDone]}>
                          {done ? '✓' : '○'}
                        </Text>
                      )}
                      <Text
                        style={[styles.proofStepText, (active || done) && styles.proofStepTextActive]}
                      >
                        {active ? stepLabelMap[s.key] : t(s.label)}
                      </Text>
                    </View>
                  );
                });
              })()}
            </View>
          </>
        )}

        {/* ── DONE PHASE ─────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={styles.doneSection}>
            <View style={styles.doneIcon}>
              <Text style={styles.doneIconText}>✓</Text>
            </View>
            <Text style={styles.title}>{t('masterKeySigning.completed')}</Text>
            <Text style={styles.doneBody}>{t('masterKeySigning.doneBody')}</Text>
          </View>
        )}

        {/* Cancel / Close button (always present) */}
        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>
            {phase === 'done'
              ? t('masterKeySigning.doneButton')
              : t('masterKeySigning.cancelButton')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    width: '88%',
    maxWidth: 380,
  },
  phasePills: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 16,
  },
  pillItem: {
    alignItems: 'center',
    gap: 4,
  },
  pillDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  pillDotCurrent: {
    backgroundColor: '#3B82F6',
  },
  pillDotDone: {
    backgroundColor: '#10B981',
  },
  pillNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  pillNumActive: {
    color: '#FFFFFF',
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  pillLabelCurrent: {
    color: '#3B82F6',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  accountList: {
    gap: 10,
    marginBottom: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  accountRowActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconText: {
    fontSize: 16,
    fontWeight: '700',
  },
  accountContent: {
    flex: 1,
    gap: 2,
  },
  accountHeader: {
    gap: 1,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountIndex: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  providerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  savedAccountLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginLeft: 26,
  },
  accountId: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 26,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  guidanceSection: {
    gap: 8,
    marginTop: 4,
  },
  guidanceText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pickButtonDisabled: {
    opacity: 0.5,
  },
  pickAddButton: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pickAddButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  pickDoneButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  pickDoneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pickRemoveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    paddingHorizontal: 4,
  },
  pickPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pickVerifyAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  authFooter: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 8,
  },
  phaseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  phaseText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  proofSecure: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  proofSteps: {
    gap: 10,
    marginBottom: 16,
  },
  proofStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proofStepDot: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
    color: '#94A3B8',
  },
  proofStepDotDone: {
    color: '#10B981',
  },
  proofStepText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  proofStepTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  doneSection: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 16,
    gap: 10,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneIconText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#15803D',
  },
  doneBody: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  preSigning: {
    marginTop: 8,
    marginBottom: 8,
  },
  downloadTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    textAlign: 'center',
    marginBottom: 12,
  },
  downloadProgressBar: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  downloadProgressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  downloadInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  downloadPercent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B82F6',
  },
  downloadBytes: {
    fontSize: 13,
    color: '#64748B',
  },
  downloadNotice: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});
