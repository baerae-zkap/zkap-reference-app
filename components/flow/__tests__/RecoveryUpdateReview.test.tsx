import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RecoveryUpdateReview } from '../RecoveryUpdateReview';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

const makeAccount = (sub: string, identifier: string): RecoveryAccount => ({
  provider: 'google',
  iss: 'https://accounts.google.com',
  sub,
  aud: 'test-client-id',
  identifier,
  isDefault: false,
});

const current = [
  makeAccount('s1', 'one@gmail.com'),
  makeAccount('s2', 'two@gmail.com'),
];
const next = [
  makeAccount('s1', 'one@gmail.com'),
  makeAccount('s2', 'two@gmail.com'),
  makeAccount('s3', 'three@gmail.com'),
];

const baseProps = {
  currentAccounts: current,
  newAccounts: next,
  onConfirm: jest.fn(),
  onBack: jest.fn(),
  onCancel: jest.fn(),
};

describe('RecoveryUpdateReview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders before and after diff labels', () => {
    const { getByText } = render(<RecoveryUpdateReview {...baseProps} />);
    expect(getByText('recovery.review.before')).toBeTruthy();
    expect(getByText('recovery.review.after')).toBeTruthy();
  });

  it('renders the kicker, title and warning', () => {
    const { getByText } = render(<RecoveryUpdateReview {...baseProps} />);
    expect(getByText('recovery.review.kicker')).toBeTruthy();
    expect(getByText('recovery.review.title')).toBeTruthy();
    expect(getByText('recovery.review.warn')).toBeTruthy();
  });

  it('shows current accounts in the before half and new accounts in the after half', () => {
    const { getAllByText, getByText } = render(<RecoveryUpdateReview {...baseProps} />);
    // one@/two@ appear in both before and after halves
    expect(getAllByText('one@gmail.com').length).toBe(2);
    expect(getAllByText('two@gmail.com').length).toBe(2);
    // three@ is only in the after half
    expect(getByText('three@gmail.com')).toBeTruthy();
  });

  it('renders the start CTA and back', () => {
    const { getByText } = render(<RecoveryUpdateReview {...baseProps} />);
    expect(getByText('recovery.review.start')).toBeTruthy();
    expect(getByText('recovery.review.back')).toBeTruthy();
  });

  it('calls onConfirm / onBack', () => {
    const onConfirm = jest.fn();
    const onBack = jest.fn();
    const { getByTestId } = render(
      <RecoveryUpdateReview
        {...baseProps}
        onConfirm={onConfirm}
        onBack={onBack}
      />,
    );
    fireEvent.press(getByTestId('recovery-review-start'));
    fireEvent.press(getByTestId('recovery-review-back'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
