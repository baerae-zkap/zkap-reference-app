import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FlowStepHeader } from '../FlowStepHeader';

describe('FlowStepHeader', () => {
  it('renders the step title', () => {
    const { getByText } = render(
      <FlowStepHeader stepTitle="Identity Verification" onClose={jest.fn()} />,
    );
    expect(getByText('Identity Verification')).toBeTruthy();
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FlowStepHeader stepTitle="Verify" onClose={onClose} />,
    );
    fireEvent.press(getByTestId('flow-step-header-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a progress bar with the given percent', () => {
    const { getByTestId, getByText } = render(
      <FlowStepHeader stepTitle="Verify" percent={42} onClose={jest.fn()} />,
    );
    expect(getByTestId('flow-step-header-fill').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '42%' })]),
    );
    expect(getByText('42%')).toBeTruthy();
  });

  it('clamps percent into 0–100 and rounds', () => {
    const { getByTestId, rerender } = render(
      <FlowStepHeader stepTitle="Verify" percent={150} onClose={jest.fn()} />,
    );
    expect(getByTestId('flow-step-header-fill').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '100%' })]),
    );

    rerender(<FlowStepHeader stepTitle="Verify" percent={-10} onClose={jest.fn()} />);
    expect(getByTestId('flow-step-header-fill').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '0%' })]),
    );

    rerender(<FlowStepHeader stepTitle="Verify" percent={33.6} onClose={jest.fn()} />);
    expect(getByTestId('flow-step-header-fill').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '34%' })]),
    );
  });

  it('defaults percent to 0 when omitted', () => {
    const { getByText } = render(
      <FlowStepHeader stepTitle="Verify" onClose={jest.fn()} />,
    );
    expect(getByText('0%')).toBeTruthy();
  });

  it('hides the progress bar when hideProgress is true', () => {
    const { queryByTestId, queryByText } = render(
      <FlowStepHeader stepTitle="Verify" percent={50} hideProgress onClose={jest.fn()} />,
    );
    expect(queryByTestId('flow-step-header-fill')).toBeNull();
    expect(queryByText('50%')).toBeNull();
  });
});
